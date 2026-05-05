import warnings
warnings.filterwarnings('ignore')

import whisper
import soundfile as sf
import numpy as np
from kokoro import KPipeline
import os

MODEL = whisper.load_model("base")
TTS = KPipeline(lang_code='b', repo_id='hexgrad/Kokoro-82M')   # explicit repo silences the warning

def transcribe(audio_path):
    result = MODEL.transcribe(audio_path, fp16=False)
    return result["text"].strip()

def generate_speech(text, output_path, voice="bm_lewis"):
    chunks = []
    for _, _, audio in TTS(text, voice=voice):
        if audio is not None:
            chunks.append(audio)
    if not chunks:
        raise RuntimeError("TTS produced no audio output")
    combined = np.concatenate(chunks)
    sf.write(output_path, combined, 24000)
    return output_path

if __name__ == "__main__":
    out = generate_speech("Hello Carlos. Korvin voice systems confirmed online.", "/tmp/korvin-smoketest.wav")
    print(f"WAV written: {out}")
