import warnings
warnings.filterwarnings('ignore')

import io, struct, sys, threading
import soundfile as sf
import numpy as np
from kokoro import KPipeline

_TTS_PIPELINES = {}
_TTS_LOCK = threading.Lock()

def _get_pipeline(lang_code, voice):
    if lang_code not in ("a", "b"):
        raise ValueError(f"Unsupported Kokoro voice lang_code '{lang_code}' from voice '{voice}'")
    if lang_code not in _TTS_PIPELINES:
        with _TTS_LOCK:
            if lang_code not in _TTS_PIPELINES:
                _TTS_PIPELINES[lang_code] = KPipeline(lang_code=lang_code, repo_id='hexgrad/Kokoro-82M')
    return _TTS_PIPELINES[lang_code]

def _iter_segments(text, voice, max_segments=None):
    lang_code = voice[0] if voice else ""
    tts = _get_pipeline(lang_code, voice)
    segments = iter(tts(text, voice=voice, split_pattern=r"(?<=[.!?])\s+"))
    yielded = 0
    while True:
        with _TTS_LOCK:
            try:
                _, _, audio = next(segments)
            except StopIteration:
                return
        if audio is not None:
            yield audio
            yielded += 1
            if max_segments is not None and yielded >= max_segments:
                return

def synth_wav_bytes(text, voice="af_heart", max_segments=None):
    chunks = list(_iter_segments(text, voice, max_segments=max_segments))
    if not chunks:
        raise RuntimeError("TTS produced no audio output")
    combined = np.concatenate(chunks)
    buf = io.BytesIO()
    sf.write(buf, combined, 24000, format="WAV")
    return buf.getvalue()

def iter_speech_frames(text, voice="af_heart", max_segments=None):
    wrote = False
    for audio in _iter_segments(text, voice, max_segments=max_segments):
        buf = io.BytesIO()
        sf.write(buf, audio, 24000, format="WAV")
        data = buf.getvalue()
        yield struct.pack(">I", len(data)) + data
        wrote = True
    if not wrote:
        raise RuntimeError("TTS produced no audio output")

def warm_up(voice="af_heart"):
    try:
        synth_wav_bytes("Ready.", voice)
        return True
    except Exception:
        return False

def generate_speech(text, output_path, voice="af_heart"):
    with open(output_path, "wb") as f:
        f.write(synth_wav_bytes(text, voice))
    return output_path

def stream_speech(text, out, voice="af_heart"):
    """Synthesize `text` and write each Kokoro audio segment to binary stream `out` as a framed
    WAV chunk: a 4-byte big-endian length prefix followed by that many bytes of a standalone WAV.
    Kokoro's KPipeline already yields audio segment-by-segment, so chunk 1 is emitted (and can be
    played by the caller) while chunk 2 is still being synthesized."""
    # Split on sentence boundaries (not just newlines) so each sentence is emitted as its own frame
    # -> Korvin starts speaking sentence 1 while sentence 2 is still synthesizing. Without this,
    # a one-paragraph reply (the common case) would be a single segment and stream nothing.
    for frame in iter_speech_frames(text, voice):
        out.write(frame)
        out.flush()

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--stream":
        # Usage: python voice.py --stream <text_file> [voice]
        txt_path = sys.argv[2]
        voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
        with open(txt_path) as f:
            stream_speech(f.read(), sys.stdout.buffer, voice)
    else:
        out = generate_speech("Hello Carlos. Korvin voice systems confirmed online.", "/tmp/korvin-smoketest.wav")
        print(f"WAV written: {out}")
