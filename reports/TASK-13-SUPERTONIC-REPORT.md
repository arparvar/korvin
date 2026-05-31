# Task 13 - Supertonic 3 TTS Evaluation

Date: 2026-05-31  
VM: ZIION Debian 12, Python 3.11.2  
Test location: `/home/ziion/supertonic-venv`, script at `/home/ziion/supertonic_test.py`

## Installation

Sources checked:
- GitHub README: https://github.com/supertone-inc/supertonic
- Python package docs: https://supertone-inc.github.io/supertonic-py/
- PyPI: https://pypi.org/project/supertonic/

Upstream notes:
- Install command: `pip install supertonic`
- Server install command: `pip install 'supertonic[serve]'`
- Python SDK first run downloads model assets automatically from Hugging Face.
- PyPI says first model download is about 400 MB.
- Actual ZIION model cache after first run: `386M` at `/home/ziion/.cache/supertonic3`
- Supertonic 3 supports 31 languages plus `na` fallback.
- Code license: MIT. Model license: OpenRAIL-M.
- HTTP server command from current docs: `supertonic serve --host 127.0.0.1 --port 7788`
- OpenAI-compatible endpoint: `/v1/audio/speech`

Direct install attempt against Debian system Python failed because Debian 12 blocks unmanaged pip installs:

```text
error: externally-managed-environment

× This environment is externally managed
╰─> To install Python packages system-wide, try apt install
    python3-xyz, where xyz is the package you are trying to
    install.
```

Successful install path used:

```bash
python3 -m venv ~/supertonic-venv
~/supertonic-venv/bin/python -m pip install supertonic
```

Base SDK install time:
- 13.9 seconds terminal wall time

Base package installed:

```text
Name: supertonic
Version: 1.3.1
Location: /home/ziion/supertonic-venv/lib/python3.11/site-packages
Requires: huggingface-hub, numpy, onnxruntime, soundfile
```

Base direct/transitive packages after `pip install supertonic`:

```text
annotated-doc==0.0.4
anyio==4.13.0
certifi==2026.5.20
cffi==2.0.0
click==8.4.1
filelock==3.29.0
flatbuffers==25.12.19
fsspec==2026.4.0
h11==0.16.0
hf-xet==1.5.0
httpcore==1.0.9
httpx==0.28.1
huggingface_hub==1.17.0
idna==3.17
markdown-it-py==4.2.0
mdurl==0.1.2
numpy==2.4.6
onnxruntime==1.26.0
packaging==26.2
protobuf==7.35.0
pycparser==3.0
Pygments==2.20.0
PyYAML==6.0.3
rich==15.0.0
shellingham==1.5.4
soundfile==0.13.1
supertonic==1.3.1
tqdm==4.67.3
typer==0.25.1
typing_extensions==4.15.0
```

Footprint measured on ZIION:

```text
344K /home/ziion/supertonic-venv/lib/python3.11/site-packages/supertonic
60K  /home/ziion/supertonic-venv/lib/python3.11/site-packages/supertonic-1.3.1.dist-info
205M /home/ziion/supertonic-venv/lib/python3.11/site-packages
386M /home/ziion/.cache/supertonic3
torch not installed (good)
```

After installing the HTTP server extra:

```bash
~/supertonic-venv/bin/python -m pip install 'supertonic[serve]'
```

Server extra install time:
- 5.9 seconds terminal wall time

Additional server packages:

```text
annotated-types==0.7.0
fastapi==0.136.3
httptools==0.8.0
pydantic==2.13.4
pydantic_core==2.46.4
python-dotenv==1.2.2
python-multipart==0.0.29
starlette==1.2.1
typing-inspection==0.4.2
uvicorn==0.48.0
uvloop==0.22.1
watchfiles==1.2.0
websockets==16.0
```

Final server-capable footprint:

```text
236M /home/ziion/supertonic-venv/lib/python3.11/site-packages
386M /home/ziion/.cache/supertonic3
622M total for venv site-packages plus model cache
```

Comparison:
- Supertonic 3 with HTTP server and model cache: about 622 MB.
- Torch alone is expected to be 800 MB+ and was not installed in the Supertonic venv.
- Current Korvin heavy stack includes torch, torchaudio, CUDA/NVIDIA packages, openai-whisper, transformers, spaCy models, and Kokoro, so Supertonic is materially lighter.

## Test Results

Script used:

```bash
~/supertonic-venv/bin/python ~/supertonic_test.py
```

Initialization:
- `TTS(auto_download=True)` succeeded.
- First run init time, including model availability check/download: `14.958` seconds.
- Hugging Face warning: unauthenticated requests have lower rate limits. No token was used.

Generated output directory:

```text
/home/ziion/supertonic_outputs
```

Important limitation:
- I verified successful generation, valid WAV files, durations, and file sizes.
- I did not perform human listening QA in this terminal session, so pronunciation quality is not signed off by ear.

### Test 1 - VPS security report output

Input:

```text
VPS Report 2026-05-31T15:48:00Z. Disk: 62%. RAM: 2227m/7940m. Services: korvin.service active, korvin-dashboard.service active, litellm.service active. No external threat feed in v1.0.
```

Result:
- Success
- Generation time: `5.151` seconds
- Output: `/home/ziion/supertonic_outputs/test1_vps_security_report.wav`
- Output file size: `1,824,812` bytes
- Audio duration: `20.666` seconds
- Notes: No runtime error on ISO timestamp, percent sign, RAM units, slash, service names, hyphenated service name, or `v1.0`. Human listening QA still needed for exact pronunciation of `2026-05-31T15:48:00Z`, `2227m/7940m`, and service names.

### Test 2 - Research skill output with numbers

Input:

```text
Key finding: LLM prompt injection attacks increased 340% in Q1 2026. Affected 12 of 20 surveyed organizations. CVSS scores ranged from 6.1 to 9.8. Source: OWASP LLM Security Report, March 2026.
```

Result:
- Success
- Generation time: `4.303` seconds
- Output: `/home/ziion/supertonic_outputs/test2_research_numbers.wav`
- Output file size: `1,701,932` bytes
- Audio duration: `19.279` seconds
- Notes: No runtime error on acronym-heavy text, percent, quarter notation, ratios, decimal CVSS scores, or OWASP acronym. Human listening QA still needed for acronym and decimal pronunciation.

### Test 3 - Schedule confirmation

Input:

```text
Scheduled: review my goals at 0 9 * * 1. Job ID: job-a3f7b. Cancel with /cancel job-a3f7b.
```

Result:
- Success
- Generation time: `2.012` seconds
- Output: `/home/ziion/supertonic_outputs/test3_schedule_confirmation.wav`
- Output file size: `761,900` bytes
- Audio duration: `8.616` seconds
- Notes: No runtime error on cron stars, job ID, slash command, or mixed letters/numbers. Human listening QA still needed because cron syntax may be spoken awkwardly.

### Test 4 - Error/fallback message with special chars

Input:

```text
Too many requests. Please wait 47 seconds. Your rate limit resets at 16:03 UTC.
```

Result:
- Success
- Generation time: `1.676` seconds
- Output: `/home/ziion/supertonic_outputs/test4_rate_limit_message.wav`
- Output file size: `688,172` bytes
- Audio duration: `7.786` seconds
- Notes: No runtime error on time notation or UTC acronym. This is the cleanest production-style text in the test set.

### Test 5 - Markdown-heavy text

Input:

```text
## Summary
- Point one: API latency improved
- Point two: 3 services healthy
- Point three: memory.db size 1.2 MB
```

Result:
- Success
- Generation time: `2.237` seconds
- Output: `/home/ziion/supertonic_outputs/test5_markdown_heavy.wav`
- Output file size: `835,628` bytes
- Audio duration: `9.429` seconds
- Notes: No runtime error on Markdown heading markers, bullet markers, newline-separated content, `memory.db`, decimal file size, or `MB`. Human listening QA still needed to decide whether Korvin should strip Markdown before TTS for cleaner speech.

### Test 6 - Mixed language

Input:

```text
Hello. Hola. Bonjour. ???????????????.
```

Result:
- Success
- Generation time: `0.938` seconds
- Output: `/home/ziion/supertonic_outputs/test6_mixed_language.wav`
- Output file size: `227,372` bytes
- Audio duration: `2.537` seconds
- Notes: Used `lang="na"` fallback. No runtime error. The provided test string contains literal question marks, not readable non-Latin text, so this only proves fallback handling for mixed English/Spanish/French plus punctuation noise.

## OpenAI-Compatible Endpoint

Base install result:

```bash
~/supertonic-venv/bin/supertonic serve --host 127.0.0.1 --port 8080
```

Failed before installing the server extra:

```text
Error: fastapi and uvicorn are required for the 'serve' command.
Install them with: pip install supertonic[serve]
```

Server-capable install command:

```bash
~/supertonic-venv/bin/python -m pip install 'supertonic[serve]'
```

Working server command:

```bash
~/supertonic-venv/bin/supertonic serve --host 127.0.0.1 --port 8080
```

Default server model:

```text
supertonic-3
```

The exact requested sample payload failed because the request used `model:"supertonic"` while the default server was serving `supertonic-3`:

```text
HTTP/1.1 400 Bad Request
{"error":{"message":"this server serves 'supertonic-3'; request asked for 'supertonic'. Restart with --model supertonic to switch.","type":"invalid_request_error","code":"model_not_loaded"}}
```

Starting the server with `--model supertonic` fixed the model-name mismatch, but `voice:"default"` still failed:

```text
HTTP/1.1 400 Bad Request
{"error":{"message":"unknown voice 'default'","type":"invalid_request_error","code":"unknown_voice"}}
```

This OpenAI-compatible request worked:

```bash
curl -s -X POST http://localhost:8080/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"supertonic-3","input":"VPS disk usage is 62 percent. All services active.","voice":"M1","response_format":"wav"}' \
  --output /tmp/test_openai.wav
```

Result:

```text
HTTP/1.1 200 OK
x-audio-duration: 5.433
x-supertonic-version: 1.3.1
x-sample-rate: 44100
content-length: 479276
content-type: audio/wav
/tmp/test_openai.wav: RIFF WAVE audio, Microsoft PCM, 16 bit, mono 44100 Hz
```

This also worked with `--model supertonic` when the request used `voice:"M1"`:

```text
HTTP/1.1 200 OK
x-audio-duration: 4.667
content-length: 411692
content-type: audio/wav
```

Compatibility with Korvin LiteLLM TTS routing:
- The endpoint shape is OpenAI-compatible.
- It is usable if Korvin/LiteLLM can set the base URL to the local Supertonic server and send a matching model name plus a real Supertonic voice such as `M1`.
- Do not use `voice:"default"` unless Korvin maps it to `M1`, `F1`, or another available Supertonic voice.
- A live LiteLLM-through-Supertonic integration test is still needed before declaring it plug-and-play.

## Recommendation

1. Can Supertonic replace Kokoro/TTS in Korvin without GPU?

MAYBE, with a strong technical signal. It ran locally through ONNX Runtime, installed no Torch, installed no CUDA packages, and generated all six files without a GPU. It should be added as an optional local TTS engine first, then promoted after human listening QA.

2. Does it handle the ugly real-world text Korvin produces?

Yes at the runtime level. All six exact Korvin-style inputs generated WAV files successfully. The unresolved question is pronunciation quality for timestamps, cron syntax, slash commands, Markdown markers, service names, and acronyms.

3. What is the install size vs torch+kokoro?

Measured Supertonic server-capable install:
- `236M` Python site-packages
- `386M` model cache
- `622M` total
- No Torch installed

Torch alone is expected to be 800 MB+ before torchaudio, CUDA/NVIDIA packages, Whisper, Transformers, spaCy models, and Kokoro. Supertonic is a clear footprint reduction.

4. Is the OpenAI-compatible endpoint usable with LiteLLM?

Likely yes, but it needs one integration test through LiteLLM. Direct HTTP tests succeeded against `/v1/audio/speech` when the request used a matching model and a real voice (`M1`). The default sample payload failed because `voice:"default"` is not a valid Supertonic voice.

5. YES / NO / MAYBE to adding Supertonic as Korvin's optional TTS?

MAYBE, leaning YES for optional TTS. Add it behind a flag. Do not make it the default until Carlos or another human listens to the six generated files and approves pronunciation quality.

## Minimal Korvin Integration

- Add optional config only; keep text-only Korvin as the default.
- Suggested flag: `KORVIN_TTS_PROVIDER=supertonic`.
- Suggested local URL: `KORVIN_TTS_BASE_URL=http://127.0.0.1:7788/v1/audio/speech`.
- Suggested defaults: `KORVIN_TTS_MODEL=supertonic-3`, `KORVIN_TTS_VOICE=M1`, `KORVIN_TTS_FORMAT=wav`.
- Run Supertonic as a loopback-only service: `supertonic serve --host 127.0.0.1 --port 7788`.
- If only dashboard playback is needed, put the first TTS call in the dashboard API response path after final text is generated.
- If Telegram voice replies are needed too, add a small shared TTS client and call it from the final response edge used by the dashboard and Telegram bot.
- Keep Whisper STT separate. Supertonic replaces the TTS/Kokoro side only; it does not replace speech-to-text.
- Strip or normalize Markdown before TTS if human QA confirms headings, bullets, or code-like strings sound awkward.
- Map any generic `default` voice setting to `M1` or another known Supertonic voice before calling the endpoint.
