# Voice latency, VM sizing, and why "add more power" is the wrong lever

When you test Korvin's voice on the ZIION virtual machine, the **first** spoken reply of a
session feels laggy and slow, then everything after it is fine. The instinct is to give the
VM more CPUs or RAM. This doc explains why that doesn't help, what the lag actually is, and
the architectural decisions we made instead. It exists for transparency: anyone reading the
repo should understand *why* the box is configured the way it is.

---

## The short version

- The lag is a **one-time cold-start warmup**, not a throughput or power problem. The first
  voice request loads the TTS/STT models into memory and runs the first inference; every
  request after that is fast.
- **Adding vCPUs does not help** — the VM is already at the host's physical-core ceiling, and
  over-provisioning vCPUs past that makes things *slower*, not faster.
- RAM and video memory have **nothing to do with** voice latency.
- The real fix is a **startup warm-up**: do the slow first inference when the service boots,
  before any user is listening.
- Judge true audio *smoothness* on the **iPhone or the VPS**, not the VM — the VM's emulated
  sound card adds artifacts that real hardware doesn't have.

---

## What the lag actually is (measured)

We timed the Kokoro text-to-speech engine three times back-to-back on ZIION, generating the
same ~7-second sentence each time. "Realtime factor" = how long generation took ÷ how long the
resulting audio plays. **Below 1.0× means faster than realtime (good); above 1.0× means the
audio can't keep up (the lag you hear).**

| Run | Realtime factor | Verdict |
|-----|-----------------|---------|
| 1 (cold) | **1.10×** | Slower than realtime — this is the lag |
| 2 (warm) | 0.74× | Fine |
| 3 (warm) | 0.69× | Fine — comfortably faster than realtime |

The pattern is unmistakable: **only the first utterance is slow.** That is the signature of a
warmup cost — PyTorch loading the model weights into memory and building its first inference
graph — paid once per process, not a sign the machine is too weak. We also confirmed the model
is **fully cached locally (389 MB on disk)**, so the cold start is not waiting on any download
or network call.

---

## Why adding CPU/RAM/video memory is the wrong lever

### vCPUs: you're already at the ceiling

The ZIION VM runs on the dev host's **Intel i7-11370H: 4 physical cores / 8 logical threads**.
The VM is allocated **4 vCPUs** — i.e. one vCPU per physical core. That is the correct maximum.

Giving a VM **more vCPUs than the host has physical cores** is a classic anti-pattern. The
host scheduler then has to time-slice virtual CPUs onto fewer real cores, and a multi-threaded
workload (like torch) stalls waiting for *all* its vCPUs to be scheduled at once
("co-scheduling" / "CPU-ready" latency). The result is **more contention and higher latency,
not less**. So 4 is already the sweet spot — pushing to 6 or 8 would make voice *worse*.

### RAM and video memory don't touch this path

- **RAM (12 GB):** the models fit in memory with room to spare; we are not paging to disk.
  More RAM changes nothing about inference speed.
- **Video memory (128 MB):** that's for the emulated *display* adapter. Korvin's voice runs on
  the **CPU build** of PyTorch (see [voice-cpu-vs-gpu.md](voice-cpu-vs-gpu.md)) — there is no
  GPU compute in this VM at all, so video memory is irrelevant to TTS/STT.

The general principle: **diagnose the bottleneck before sizing for it.** A one-time warmup cost
cannot be bought away with steady-state capacity. This is the doctrine in practice — purposeful,
measured changes over reflexive ones.

---

## The VM tuning we *did* make: Paravirtualization → KVM

VirtualBox → **System → Acceleration → Paravirtualization Interface → KVM** (was "Default").

A guest OS runs faster when it *knows* it's virtualized and can ask the hypervisor for things
directly instead of emulating real hardware. That cooperation layer is the **paravirtualization
interface**. VirtualBox offers presets tuned for different guests:

| Option | Intended guest |
|--------|----------------|
| None / Legacy | Old or unknown OSes |
| Minimal | macOS guests |
| Hyper-V | Windows guests |
| **KVM** | **Linux guests** ← ZIION is Debian-based Linux |

Choosing **KVM** gives the Linux guest a paravirtualized clock and timing source it understands
natively. That means **smoother, more accurate timekeeping** — which matters for audio, where
playback is scheduled against the system clock and a jittery clock causes gaps and stutter. It's
a small, free, reversible win and the *correct* preset for a Linux guest; "Default" was letting
VirtualBox guess.

**Nested Paging** stays enabled: it lets the CPU's hardware handle guest memory address
translation (Intel EPT) instead of the hypervisor doing it in software — a large, well-known
performance win for any VM, and there's no reason to turn it off.

---

## The real fix for the cold-start lag (pending)

Because the lag is a once-per-process warmup, the fix is to **pay it before anyone is
listening**: when the dashboard service starts, run one throwaway speech generation (and one
throwaway transcription) to force the models to load and compile their first inference graph.
By the time a user taps the mic, the engine is already in the fast 0.7× zone.

Tracked as **B126** in [v2-feature-backlog.md](v2-feature-backlog.md). It's a small, scoped
change (~10 lines) and will be implemented by Codex per the orchestrator rule in `CLAUDE.md`.
A secondary option is pinning `OMP_NUM_THREADS` / `TORCH_NUM_THREADS` so torch doesn't
oversubscribe threads against the browser and the whisper STT on only 4 vCPUs.

---

## Where to judge audio quality

The ZIION VM uses an **emulated AC97 sound card** passed through VirtualBox. That path adds its
own buffering and timing artifacts that have nothing to do with Korvin. So the VM is the right
place to verify that voice **works** and to test the logic (capability detection, barge-in,
graceful degradation), but it is **not** a fair judge of audio *smoothness*. For that, test on
the **iPhone** (the primary client) or the **Hostinger VPS** — real hardware, real audio stack.
