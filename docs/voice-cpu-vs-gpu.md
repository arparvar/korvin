# Voice: CPU vs GPU, and how to upgrade the TTS

Korvin's voice features (text-to-speech and speech-to-text) run on a library called
**PyTorch** (`torch`). This doc explains a choice that has a big impact on install size,
why the default is what it is, and how to change it safely.

---

## The short version

- **Out of the box, Korvin installs the CPU build of PyTorch.** It is small, and it runs
  the default voice models (Kokoro TTS + faster-whisper STT) perfectly on a normal server
  with no graphics card.
- **The GPU build is an opt-in.** It only helps if your machine has a real NVIDIA GPU.
  On a CPU-only box it adds ~3.4 GB of files that never run.
- **The default TTS engine is Kokoro.** A more expressive (but heavier, GPU-oriented)
  engine like Chatterbox can be added as an **optional add-on** — never the default.

---

## Why two builds of PyTorch exist

PyTorch ships in two flavors that install almost identically but are very different inside:

| Build | Built for | Extra weight |
|-------|-----------|--------------|
| **CPU** (`torch==2.12.0+cpu`)    | A normal processor (CPU)         | none |
| **GPU/CUDA** (`torch==…+cu130`)  | An NVIDIA graphics card (GPU)    | ~3.4 GB of NVIDIA libraries |

**CUDA** is NVIDIA's technology for doing AI math on a graphics card. The GPU build bundles
the NVIDIA libraries needed for that: `nvidia-cublas`, `nvidia-cudnn`, `nvidia-cufft`,
`triton`, and more — about 3.4 GB in total.

The catch: when you run a plain `pip install torch`, pip gives you the **GPU build by
default**, assuming you have an NVIDIA card. Our servers (Hostinger VPS, ZIION) are
**CPU-only**, so all 3.4 GB of GPU libraries would sit on disk and **never run once** —
like a calculator app silently installing drivers for a printer you don't own.

Measured on ZIION: with the GPU build the voice venv was **5.9 GB**; switching to the CPU
build dropped it to **2.1 GB** — a **3.8 GB saving with zero quality loss on a CPU box**,
and a much faster, more reliable install (the "works first-try for anyone" goal).

That is why `requirements-voice.txt` pins the **CPU** build explicitly:

```
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.12.0+cpu
```

---

## Switching to the GPU build (only if you have an NVIDIA GPU)

This is safe and reversible:

- The GPU wheels come from the **same official PyTorch index** as the CPU ones — no new
  source to trust.
- It is **version-pinned** (`torch==2.12.0+cu130`), so the install stays reproducible.
- It is a **local install action only** — no secrets, nothing sent anywhere.

After a normal install, run:

```bash
pip install -r requirements-voice-gpu.txt
```

This replaces the CPU torch with the matching CUDA build in place. To go back, reinstall
the CPU build:

```bash
pip install -r requirements-voice.txt
```

> **Do this only on a machine with a working NVIDIA GPU and drivers.** Korvin never
> auto-detects a GPU — that would add complexity and could guess wrong and break the
> install. The choice is always explicit. CPU is the safe default.

---

## Upgrading the voice itself (TTS quality)

The default engine is **Kokoro-82M** (Apache-2.0, ~82M params). It is the best practical
TTS for a CPU-only, fully-local, privacy-respecting box: small, fast, no cloud calls.

You can already **change the voice instantly from the dashboard** (Settings → Voice). The
American voices (`af_heart`, `af_bella`, …) tend to sound the most natural; the British
voices (`bm_*`, `bf_*`) have a stiffer cadence.

If you want a more expressive voice **and you run on a GPU box**, Chatterbox-Turbo (MIT
licence) is a genuine step up in naturalness. It is **not bundled** because it is heavy and
slow without a GPU. It is left as a documented add-on:

1. Switch to the GPU torch build (above).
2. Install the add-on engine separately (kept out of the default requirements so a normal
   CPU install stays lean).
3. Select it from the dashboard once wired.

**Privacy note:** any TTS we add must run **locally**. Cloud TTS services (ElevenLabs,
etc.) are ruled out — the reply text we'd send them is user data, and Korvin's rule is that
user data never leaves the box.
