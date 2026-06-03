# Voice architecture: one kitchen, two windows

This doc records *why* Korvin's voice is built the way it is, so anyone reading the repo
understands the decisions before touching the code. It is load-bearing: the channel strategy
(dashboard now, Telegram / WhatsApp / Signal later) all hangs off the principles here.

The dashboard **is** the product. Everything below optimises for it first and stays *portable*
to other channels second — never the reverse.

---

## The short version

- **One warm model, two serving windows.** Kokoro (TTS) and Whisper (STT) load **once** at
  startup and stay resident in the dashboard process. Both the whole-file reply path and the
  streaming reply path are served by that **same** warm model. We never spawn a fresh Python
  process per request again (that was bug **B126** — see below).
- **Two delivery modes, both kept.** *Streaming* (sentence-by-sentence frames over an open
  connection) is for the dashboard/LIVE, where a human notices every 100 ms. *Whole-file* (one
  complete audio file) is the **portable** path every messaging channel reuses, because
  Telegram/WhatsApp/Signal can't hold a streaming socket open — they want a finished file.
- **The "should Korvin speak, and how much?" decision lives server-side**, as a `mode`
  parameter, not in the browser. The dashboard's toggle only *sends* the preference; the server
  decides. This keeps every future channel honest with one rule set.
- **Channels are an abuse surface.** Each new channel is a new front door and gets its own
  gatekeeping (allowlist, rate limit, per-channel policy), not a shared open door.

---

## Why "one kitchen, two windows"

The kitchen is the loaded model. The windows are the two ways a reply leaves the building:

| Window | What it sends | Who it's for | Why |
|--------|---------------|--------------|-----|
| **Streaming** | Framed audio, one sentence at a time, as it's synthesised | Dashboard / LIVE (browser, open connection) | Humans notice latency in conversation; first words should start while the rest is still cooking |
| **Whole-file** | One complete audio file | RECORD on the dashboard **and** every messaging channel | Messaging platforms upload a finished file (Telegram `sendVoice`, WhatsApp media ID, Signal attachment). They cannot consume a stream |

The mistake to avoid is building *two kitchens* — a streaming synthesiser and a separate
whole-file synthesiser that drift apart. There is **one** synthesis core; the two windows are
thin adapters over it. Less code, one place to audit, no divergence.

> **Do not delete the whole-file path.** It is tempting once LIVE streaming feels great to think
> "streaming is the good one, drop the rest." But the whole-file path is the *only* one that
> ports to messaging channels. Streaming is the dashboard-only luxury; whole-file is the
> universal currency.

---

## The principles we adopted (a–h)

These are the standing design rules for voice across all channels. They were chosen
deliberately; each has a reason.

**a) Don't hard-code WAV output.** The synthesis core produces audio; the *container* is a
channel decision. The dashboard takes WAV happily. Messaging channels need **Opus** (in OGG for
Telegram/WhatsApp) — ~20× smaller (a 30 s reply is ~75 KB Opus vs ~1.4 MB WAV at 24 kHz). So the
architecture must allow a transcode step at the channel edge, not bake WAV into the core.

**b) Cache common phrases.** TTS for a given `(text, voice)` is deterministic. Greetings,
confirmations, error lines ("I didn't catch that") repeat constantly. A small cache keyed on
`(text, voice)` turns those into zero-latency replays. Bounded size, evict oldest.

**c) "Should Korvin speak?" is a per-channel policy.** The sane default is **mirror the input
modality**: voice in → voice out, text in → text out. But each channel can override (a Telegram
group might be text-only by policy; LIVE is always voice). This is policy, not a hard-coded
`if`.

**d) Right-size latency engineering to where humans notice it.** The dashboard's LIVE loop gets
the streaming machinery and the warm-up budget. A Telegram voice note that arrives 600 ms later
than theoretically possible is invisible to the recipient — don't spend complexity there. Effort
follows perception.

**e) Channels are an abuse surface.** Every channel is a new way for unknown senders to make
Korvin do expensive work (STT + LLM + TTS on every inbound). Each channel needs its own
**gatekeeping**: sender allowlist, per-sender rate limit, max audio length. The dashboard is
key/session-gated already; messaging channels are *open by default* and must not be.

**f) Channel-specific graceful degradation.** When a capability is missing, degrade *per
channel*, never hang. No microphone on a headless box → text only. TTS engine unavailable →
send the text reply. Transcode tool missing → send WAV if the channel allows, else text. The
[audio-capability rule](../CLAUDE.md) applies everywhere: detect, degrade, never get stuck in a
stuck-mic state.

**g) Speak-the-headline (hybrid).** For long replies, *speak the first sentence and show the
rest as text*. You hear an immediate spoken acknowledgement; you read the detail. This falls
naturally out of the streaming core, which already splits on sentence boundaries — "headline"
is simply "synthesise the first segment only, send the remainder as text." **See the dedicated
section below — this is the one with real design implications.**

**h) Per-user / per-channel voice identity.** The `voice` argument already threads through every
synthesis call. So a user can have their own Korvin voice, and a channel can have a default one,
with no new machinery — just plumb the existing `voice` value from the right scope.

---

## Speak-the-headline and the 3-way toggle — and why the decision lives server-side

This is principle (g) made concrete, and it's the one that shapes the API.

**The feature.** Three speech modes:

| Mode | Behaviour |
|------|-----------|
| **Off** | No spoken reply. Text only. (Accessibility / quiet contexts / text-only channels.) |
| **Headline** | Speak the **first sentence**, show the full reply as text. Fast acknowledgement, full detail readable. |
| **Full** | Speak the entire reply. |

On the dashboard this is a **3-way toggle** (Off / Headline / Full). LIVE **biases to Full**
(you're having a conversation — you want the whole thing spoken), but we **never force
Headline** on anyone, because forcing "first sentence only" would break things for a user who
relies on hearing the complete reply. Accessibility wins ties.

**The load-bearing rule: the decision lives server-side, as a `mode` parameter.**

The browser does **not** decide how much to speak by, say, throwing away audio frames it
received. Instead the dashboard sends its toggle state to the server, and the server's synthesis
call takes a `mode` (equivalently, a `max_segments` cap: Headline = 1, Full = unlimited, Off =
synthesise nothing). Why this matters:

- **One rule set for every channel.** When Telegram arrives, its "headline" behaviour is the
  *same server-side `mode`*, driven by that channel's policy — not reimplemented in a bot. The
  dashboard toggle and a future Telegram setting both resolve to the same server parameter.
- **No wasted work.** "Speak the first sentence only" must mean *synthesise only the first
  sentence* — not synthesise everything and discard. Discarding on the client would burn the
  CPU we're trying to save. The cap has to be where the synthesis happens: the server.
- **Auditable and honest.** The amount of audio Korvin produces is decided in one place you can
  read, not scattered across clients.

**How it's wired (and what's built now vs later):**

- *Now (this refactor):* the synthesis core accepts the `mode` / `max_segments` parameter and is
  callable on "just the first sentence." The door is built. The default is Full; nothing changes
  behaviourally yet.
- *Fast-follow (separate task):* the dashboard 3-way toggle, persisted via the same
  settings-file pattern as the voice picker (`data/tts_voice.txt` → e.g. `data/speech_mode.txt`,
  read by a `_get_speech_mode()` helper mirroring `_get_tts_voice()`), and passed into the
  synthesis call. LIVE overrides toward Full.

Because the parameter exists from day one, the toggle is a small additive change, not a
re-architecture.

---

## Multi-channel reality (what actually differs per channel)

| Channel | Delivery | Container | Gatekeeping reality |
|---------|----------|-----------|---------------------|
| **Dashboard** | Streaming (LIVE) + whole-file (RECORD) | WAV fine | Key/session gated already |
| **Telegram** | Whole-file (`sendVoice`) | OGG/Opus | Open to anyone who finds the bot — needs allowlist + rate limit |
| **WhatsApp** | Whole-file (upload → media ID) | Opus | Per-conversation cost, 24 h window — cost is itself an abuse vector |
| **Signal** | Whole-file (signal-cli attachment) | file attachment | Tied to a phone number; per-sender control |

The pattern: **only the dashboard streams.** Everyone else takes the whole-file window, a
transcode to Opus, and their own front-door controls. That's exactly why the whole-file path is
the portable one worth protecting.

---

## Build sequencing

1. **Warm in-process TTS module (B126, this refactor).** One kitchen: load Kokoro once, serve
   both windows through it via a threadpool, warm up at startup. Signatures already accept the
   `mode` / `max_segments` parameter. *Keep both delivery modes.* — **the change being shipped now.**
2. **Dashboard 3-way speech toggle (Off / Headline / Full).** Settings-file pattern, server-side
   `mode`, LIVE biases to Full.
3. **Phrase cache** for `(text, voice)` (principle b).
4. **First messaging channel** (likely Telegram): whole-file window + Opus transcode + allowlist
   + rate limit. Reuses the kitchen and the `mode` rule with zero core changes.

---

## Doctrine check

This architecture is **harmonic** (one core, thin adapters), **congruent** (the same `mode` rule
everywhere), **simple** (no second synthesiser), **auditable** (the speak-decision lives in one
server-side place), **lightweight** (warm model, phrase cache, no per-request reload),
**secure / AI-attack-aware** (every channel is a gated front door), and **purposeful** (latency
effort spent only where humans perceive it). It is the doctrine applied to voice.
