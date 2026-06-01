import os, sqlite3, subprocess, re, json, time, tempfile, math
from datetime import datetime, date
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Depends, File, UploadFile, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict
import requests
import base64
try:
    from faster_whisper import WhisperModel as _FasterWhisperModel
    _WHISPER_AVAILABLE = True
except ImportError:
    _FasterWhisperModel = None
    _WHISPER_AVAILABLE = False
try:
    from pydub import AudioSegment as _pydub_audio
    _PYDUB_AVAILABLE = True
except ImportError:
    _pydub_audio = None
    _PYDUB_AVAILABLE = False

BASE_DIR = Path(__file__).parent.parent.parent
APP_DIR = str(BASE_DIR)
DATA_DIR = BASE_DIR / "data"
TTS_PROVIDER_PATH = DATA_DIR / "tts_provider.txt"
STT_MODEL_PATH = DATA_DIR / "stt_model.txt"

app = FastAPI(title="Korvin Dashboard")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "src" / "dashboard" / "static")), name="static")

DB_PATH = str(DATA_DIR / "memory.db")
KILLSWITCH_FLAG = str(DATA_DIR / "killswitch.flag")
CHAT_TIMEOUT_PATH = str(DATA_DIR / "chat_timeout.txt")
TOKEN_WARNING_PATH = str(DATA_DIR / "token_warning_threshold.txt")
KORVIN_DASHBOARD_TOKEN = os.environ.get("KORVIN_DASHBOARD_TOKEN", "").strip()

def require_key(request: Request, x_korvin_key: Optional[str] = Header(default=None)):
    api_key = os.environ.get("KORVIN_API_KEY", "")
    if not api_key or x_korvin_key != api_key:
        raise HTTPException(status_code=403, detail="Forbidden")
    if KORVIN_DASHBOARD_TOKEN:
        x_korvin_token = request.headers.get("x-korvin-token")
        if x_korvin_token != KORVIN_DASHBOARD_TOKEN:
            raise HTTPException(status_code=403, detail="Forbidden")

LOG_SANITIZE = re.compile(
    r'(Traceback \(most recent call last\)|File "/.*?"|^\s+.*\.py.*$)',
    re.MULTILINE
)
SECRET_SANITIZE = re.compile(
    r'(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|(?:api[_-]?key|token|secret)\s*[:=]\s*["\']?[^"\'\s]+)',
    re.IGNORECASE
)

def _redact_sensitive(text: str) -> str:
    return SECRET_SANITIZE.sub("[REDACTED_SECRET]", str(text or ""))

def _read_chat_timeout():
    try:
        with open(CHAT_TIMEOUT_PATH) as f:
            return int(f.read().strip())
    except:
        return int(os.environ.get("LITELLM_CHAT_TIMEOUT", "180"))

def _write_chat_timeout(seconds: int):
    os.makedirs(os.path.dirname(CHAT_TIMEOUT_PATH), exist_ok=True)
    with open(CHAT_TIMEOUT_PATH, "w") as f:
        f.write(str(seconds))

def _read_token_warning():
    try:
        with open(TOKEN_WARNING_PATH) as f:
            return int(f.read().strip())
    except:
        return 5000

def _write_token_warning(tokens: int):
    os.makedirs(os.path.dirname(TOKEN_WARNING_PATH), exist_ok=True)
    with open(TOKEN_WARNING_PATH, "w") as f:
        f.write(str(tokens))

# ── Whisper model lazy‑load ────────────────────────────────────────
_whisper_model = None

def _get_stt_model_name() -> str:
    try:
        m = STT_MODEL_PATH.read_text().strip()
        if m:
            return m
    except Exception:
        pass
    return os.environ.get("KORVIN_STT_MODEL", "tiny.en")

def _get_whisper_model():
    global _whisper_model
    if not _WHISPER_AVAILABLE:
        return None
    if _whisper_model is None:
        _whisper_model = _FasterWhisperModel(_get_stt_model_name(), device="cpu", compute_type="int8")
    return _whisper_model

def _check_voice_activity(audio_path: str, min_dBFS: float = -40.0) -> bool:
    if not _PYDUB_AVAILABLE:
        return True
    try:
        audio = _pydub_audio.from_file(audio_path)
        return audio.dBFS > min_dBFS
    except Exception:
        return True

# ── Public endpoints ────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def root():
    with open(str(BASE_DIR / "src" / "dashboard" / "static" / "index.html")) as f:
        html = f.read()
    api_key = os.environ.get("KORVIN_API_KEY", "")
    html = html.replace("__KORVIN_API_KEY__", api_key)
    return HTMLResponse(content=html)

@app.get("/api/status", dependencies=[Depends(require_key)])
def status():
    return {"korvin": "online", "version": "0.1.1", "memory": "sqlite"}

def _get_tts_provider() -> str:
    try:
        p = TTS_PROVIDER_PATH.read_text().strip()
        if p in ('supertonic', 'chatterbox'):
            return p
    except Exception:
        pass
    return os.environ.get("KORVIN_TTS_PROVIDER", "supertonic")

@app.get("/api/voice/status", dependencies=[Depends(require_key)])
def voice_status():
    voice = os.environ.get("KORVIN_TTS_VOICE", "M1")
    if voice == "default":
        voice = "M1"
    model = os.environ.get("KORVIN_TTS_MODEL", "supertonic-3")
    stt_model = _get_stt_model_name()
    tts_provider = _get_tts_provider()
    if tts_provider == "chatterbox":
        tts_label = "Chatterbox Turbo"
    else:
        tts_label = f"Supertonic {model} ({voice})"
    return {
        "stt": "whisper",
        "stt_model": stt_model,
        "tts_provider": tts_provider,
        "tts_voice": voice,
        "tts_model": model,
        "tts_label": tts_label,
        "stt_label": f"Whisper {stt_model}"
    }

@app.get("/api/health")
def health_check():
    health = {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "bot": "unknown",
        "litellm": "unknown",
        "memory_total": 0,
        "last_activity": None,
        "backup_last": None,
        "backup_hours": None,
        "dashboard_token_required": bool(KORVIN_DASHBOARD_TOKEN),
    }
    try:
        r = subprocess.run(["systemctl", "is-active", "korvin"], capture_output=True, text=True, timeout=3)
        health["bot"] = "running" if r.stdout.strip() == "active" else "stopped"
    except Exception:
        pass
    try:
        resp = requests.get("http://127.0.0.1:4000/health/readiness", timeout=3)
        health["litellm"] = "reachable" if resp.status_code < 500 else "error"
    except Exception:
        health["litellm"] = "unreachable"
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            count = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
            last = conn.execute("SELECT MAX(timestamp) FROM messages").fetchone()[0]
            health["memory_total"] = count
            health["last_activity"] = last
            conn.close()
        except Exception:
            pass
    backup_dir = "/home/korvin/.backup-repo/snapshots"
    if os.path.exists(backup_dir):
        try:
            dirs = sorted([d for d in os.listdir(backup_dir) if os.path.isdir(os.path.join(backup_dir, d))])
            if dirs:
                health["backup_last"] = dirs[-1]
                parts = dirs[-1].split("_", 1)
                last_ts = parts[0] + "T" + parts[1].replace("-", ":")
                age = datetime.utcnow() - datetime.fromisoformat(last_ts)
                health["backup_hours"] = round(age.total_seconds() / 3600, 1)
        except Exception:
            pass
    if health["bot"] != "running" or health["litellm"] == "unreachable":
        health["status"] = "degraded"
    return health

@app.get("/api/system", dependencies=[Depends(require_key)])
def system_info():
    try:
        disk = subprocess.check_output("df -h / | tail -1", shell=True).decode().split()
        mem = subprocess.check_output("free -m | grep Mem", shell=True).decode().split()
        cpu = subprocess.check_output("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", shell=True).decode().strip()
        return {
            "disk_used": disk[2], "disk_free": disk[3], "disk_pct": disk[4],
            "mem_total_mb": mem[1], "mem_used_mb": mem[2], "mem_free_mb": mem[3],
            "cpu_pct": cpu,
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/memory/recent", dependencies=[Depends(require_key)])
def recent_memory(chat_id: str = "", limit: int = 20):
    if not chat_id:
        chat_id = os.environ.get("KORVIN_CHAT_ID", "dashboard-chat")
    if not os.path.exists(DB_PATH):
        return {"messages": [], "error": "No memory DB found"}
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT role, content, timestamp FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?",
            (chat_id, limit)
        ).fetchall()
        conn.close()
        return {"messages": [{"role": r[0], "content": r[1], "timestamp": r[2]} for r in reversed(rows)]}
    except Exception as e:
        return {"messages": [], "error": str(e)}

@app.get("/api/memory/context-window", dependencies=[Depends(require_key)])
def context_window(chat_id: str = "", limit: int = 10, max_tokens: int = 128000):
    if not chat_id:
        chat_id = os.environ.get("KORVIN_CHAT_ID", "dashboard-chat")
    if not os.path.exists(DB_PATH):
        return {"messages_used": 0, "messages_limit": limit, "tokens_estimate": 0, "max_tokens": max_tokens, "pct_messages": 0, "pct_tokens": 0, "status": "ok"}
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?",
            (chat_id, limit)
        ).fetchall()
        conn.close()
        total_chars = sum(len(r[1]) for r in rows)
        tokens_estimate = total_chars // 4
        pct_messages = round((len(rows) / limit) * 100, 1)
        pct_tokens = round((tokens_estimate / max_tokens) * 100, 2)
        return {
            "chat_id": chat_id,
            "messages_used": len(rows),
            "messages_limit": limit,
            "tokens_estimate": tokens_estimate,
            "max_tokens": max_tokens,
            "pct_messages": pct_messages,
            "pct_tokens": pct_tokens,
            "status": "critical" if pct_messages >= 80 else "warning" if pct_messages >= 60 else "ok"
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/killswitch", dependencies=[Depends(require_key)])
def killswitch_status():
    active = os.path.exists(KILLSWITCH_FLAG)
    return {"killswitch": active, "mode": "read_only" if active else "normal"}

@app.get("/api/logs", dependencies=[Depends(require_key)])
def get_logs(lines: int = 100):
    try:
        audit_path = DATA_DIR / "audit.ndjson"
        if not audit_path.exists():
            return {"lines": [], "error": "No audit log found"}
        raw_lines = audit_path.read_text().splitlines()
        if not raw_lines:
            return {"lines": [], "error": "No audit log found"}
        formatted = []
        for raw_line in raw_lines[-lines:]:
            entry = json.loads(raw_line)
            formatted.append(f"[{entry.get('ts','?')}] {entry.get('event','?')} chat={entry.get('chat_id','?')}")
        return {"lines": formatted}
    except Exception as e:
        return {"lines": [], "error": str(e)}

class KillswitchRequest(BaseModel):
    enabled: bool

@app.post("/api/killswitch", dependencies=[Depends(require_key)])
def killswitch_set(body: KillswitchRequest):
    if body.enabled:
        open(KILLSWITCH_FLAG, "w").close()
    else:
        if os.path.exists(KILLSWITCH_FLAG):
            os.remove(KILLSWITCH_FLAG)
    active = os.path.exists(KILLSWITCH_FLAG)
    return {"killswitch": active, "mode": "read_only" if active else "normal"}

CONFIG_PATH = str(BASE_DIR / "config.json")

def _read_config():
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {}

def _write_config(updates: dict):
    config = _read_config()
    config.update(updates)
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)

ACTIVE_MODEL_PATH = str(DATA_DIR / "active_model.txt")

MODEL_LABELS = {
    "deepseek-v4-pro": "DeepSeek V4 Pro",
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "gemini-flash": "Gemini Flash",
}

MODEL_WHITELIST = {
    "deepseek-v4-pro":      "openai/deepseek-v4-pro",
    "deepseek-v4-flash":    "openai/deepseek-v4-flash",
    "gemini-flash":         "gemini/gemini-2.5-flash",
}

MODEL_KEY_REQUIREMENTS = {
    "deepseek-v4-pro":   "DEEPSEEK_API_KEY",
    "deepseek-v4-flash": "DEEPSEEK_API_KEY",
    "gemini-flash":      "GEMINI_API_KEY",
}

def _read_active_model():
    try:
        with open(ACTIVE_MODEL_PATH) as f:
            return f.read().strip()
    except Exception:
        return os.environ.get("KORVIN_MODEL", "deepseek-v4-pro")

def _write_active_model(slug: str):
    os.makedirs(os.path.dirname(ACTIVE_MODEL_PATH), exist_ok=True)
    with open(ACTIVE_MODEL_PATH, "w") as f:
        f.write(slug)

@app.get("/api/memory/limit", dependencies=[Depends(require_key)])
def get_memory_limit():
    config = _read_config()
    return {
        "memory_limit": config.get("memory_limit", 100),
        "max_tokens": config.get("max_tokens", 128000),
        "memory_strategy": config.get("memory_strategy", "sliding_window"),
        "summarizer_url": config.get("summarizer_url", "http://localhost:4000/v1/chat/completions"),
        "summarizer_model": config.get("summarizer_model", "deepseek-v4-flash")
    }

class MemoryLimitRequest(BaseModel):
    summarizer_url: str = "http://localhost:4000/v1/chat/completions"
    summarizer_model: str = "deepseek-v4-flash"
    memory_limit: int
    max_tokens: int
    memory_strategy: str = "sliding_window"

@app.post("/api/memory/limit", dependencies=[Depends(require_key)])
def set_memory_limit(body: MemoryLimitRequest):
    if body.memory_limit < 1:
        raise HTTPException(status_code=400, detail="memory_limit must be at least 1")
    if body.max_tokens < 1000:
        raise HTTPException(status_code=400, detail="max_tokens must be at least 1000")
    if body.memory_strategy not in ["sliding_window", "hard_stop", "summarize"]:
        raise HTTPException(status_code=400, detail="Invalid memory_strategy")
    _write_config({
        "summarizer_url": body.summarizer_url,
        "summarizer_model": body.summarizer_model,
        "memory_limit": body.memory_limit,
        "max_tokens": body.max_tokens,
        "memory_strategy": body.memory_strategy
    })
    return {"saved": True, "summarizer_url": body.summarizer_url, "summarizer_model": body.summarizer_model, "memory_limit": body.memory_limit, "max_tokens": body.max_tokens, "memory_strategy": body.memory_strategy}

class PruneRequest(BaseModel):
    chat_id: str = ""

@app.post("/api/memory/prune", dependencies=[Depends(require_key)])
def prune_memory(body: PruneRequest):
    from src.hermes.memory import prune
    config = _read_config()
    limit = config.get("memory_limit", 100)
    pruned = prune(body.chat_id, limit)
    return {"pruned": pruned, "limit": limit, "chat_id": body.chat_id}

@app.get("/api/active-model", dependencies=[Depends(require_key)])
def get_active_model():
    slug = _read_active_model()
    model_string = MODEL_WHITELIST.get(slug, "unknown")
    return {"active_model": slug, "model_string": model_string}

class SwitchModelRequest(BaseModel):
    model: str

@app.post("/api/switch-model", dependencies=[Depends(require_key)])
def switch_model(body: SwitchModelRequest):
    slug = body.model.strip()
    if slug not in MODEL_WHITELIST:
        raise HTTPException(status_code=400, detail=f"Model '{slug}' not in whitelist")
    previous = _read_active_model()
    try:
        _write_active_model(slug)
        return {
            "success": True,
            "active_model": slug,
            "model_string": MODEL_WHITELIST[slug],
            "switched_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        _write_active_model(previous)
        raise HTTPException(status_code=500, detail=f"Switch failed: {str(e)}. Rolled back to {previous}.")

@app.get("/api/models", dependencies=[Depends(require_key)])
def get_models():
    models = []
    for slug, model_string in MODEL_WHITELIST.items():
        required_key = MODEL_KEY_REQUIREMENTS.get(slug)
        if required_key and not os.environ.get(required_key, "").strip():
            continue
        models.append({
            "slug": slug,
            "label": MODEL_LABELS.get(slug, slug),
            "model_string": model_string
        })
    return {"models": models, "active": _read_active_model()}

# ── Token Tracking ─────────────────────────────────────────────────────
TOKEN_USAGE_PATH = str(DATA_DIR / "token_usage.json")
TOKEN_RATES_PATH = str(DATA_DIR / "token_rates.json")

DEFAULT_RATES = {
    "deepseek-v4-pro": 0.27,
    "deepseek-v4-flash": 0.07,
    "gemini-flash": 0.15,
}

def _read_token_usage():
    try:
        with open(TOKEN_USAGE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}

def _add_token_usage(model: str, tokens: int):
    today = date.today().isoformat()
    usage = _read_token_usage()
    if today not in usage:
        usage[today] = {}
    day = usage[today]
    if model not in day:
        day[model] = {"tokens": 0}
    day[model]["tokens"] += tokens
    day["total_tokens"] = day.get("total_tokens", 0) + tokens
    with open(TOKEN_USAGE_PATH, "w") as f:
        json.dump(usage, f)

def _read_token_rates():
    try:
        with open(TOKEN_RATES_PATH) as f:
            return json.load(f)
    except Exception:
        return dict(DEFAULT_RATES)

def _write_token_rates(rates: dict):
    os.makedirs(os.path.dirname(TOKEN_RATES_PATH), exist_ok=True)
    with open(TOKEN_RATES_PATH, "w") as f:
        json.dump(rates, f)

def _telegram_send(chat_id: str, text: str):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token or not chat_id:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=5
        )
    except Exception:
        pass

# ── Chat ────────────────────────────────────────────────────────────────
CHAT_RATE_LIMIT_WINDOW = 60
CHAT_RATE_LIMIT_MAX    = 20
_chat_ratelimit: dict[str, list[float]] = defaultdict(list)

def _check_chat_rate_limit(session_id: str):
    now = time.time()
    window = CHAT_RATE_LIMIT_WINDOW
    cutoff = now - window

    for key in list(_chat_ratelimit.keys()):
        _chat_ratelimit[key] = [t for t in _chat_ratelimit[key] if t > cutoff]
        if not _chat_ratelimit[key]:
            del _chat_ratelimit[key]

    timestamps = _chat_ratelimit[session_id]
    if len(timestamps) >= CHAT_RATE_LIMIT_MAX:
        retry_after = max(1, math.ceil(timestamps[0] + window - now))
        return False, retry_after

    _chat_ratelimit[session_id].append(now)
    return True, 0

class ChatRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None

@app.post("/api/chat", dependencies=[Depends(require_key)])
def chat(body: ChatRequest):
    chat_id = body.chat_id or os.environ.get("KORVIN_CHAT_ID", "dashboard-chat")
    allowed, retry_after = _check_chat_rate_limit(chat_id)
    if not allowed:
        return JSONResponse(
            {"error": "Too many requests", "retryAfterSeconds": retry_after},
            status_code=429
        )
    message_text = body.message.strip()
    if not message_text:
        return JSONResponse({"reply": "Please type a message."})
    if re.search(r'ignore\s+(all\s+)?(previous|prior|above)\s+instructions?|you\s+are\s+now|jailbreak|system\s*:|(?:reveal|show|print|dump)\s+(?:your\s+)?system\s+prompt', message_text, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Input blocked: prompt injection pattern detected.")

    result = subprocess.run(
        ['node', '-e', 'const d=require("./src/skills/dispatcher"); d.dispatchSkill(process.env.MSG,"dashboard").then(r=>process.stdout.write(r||"")).catch(()=>process.stdout.write(""))'],
        env={**os.environ, 'MSG': message_text},
        capture_output=True,
        text=True,
        cwd=APP_DIR,
        timeout=30
    )
    if result.stdout.strip():
        return JSONResponse({"reply": result.stdout.strip()})

    _active = _read_active_model()
    _model_name = MODEL_LABELS.get(_active, _active)
    messages = [{
        "role": "system",
        "content": (
            f"You are Korvin, a self-hosted personal AI agent powered by {_model_name}. "
            "You are helpful, concise, and warm. "
            f"If asked what model you are, say you are Korvin powered by {_model_name}. "
            "Respond in English. You are speaking through a dashboard chat interface."
        )
    }]

    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 20",
                (chat_id,)
            ).fetchall()
            conn.close()
            for r in reversed(rows):
                messages.append({"role": r[0], "content": r[1]})
        except Exception:
            pass

    messages.append({"role": "user", "content": body.message})

    litellm_url = "http://127.0.0.1:4000/v1/chat/completions"
    litellm_key = os.environ.get("LITELLM_MASTER_KEY", "")
    try:
        resp = requests.post(
            litellm_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {litellm_key}"
            },
            json={
                "model": _read_active_model(),
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2048,
                "stream": False
            },
            timeout=_read_chat_timeout()
        )
        if not resp.ok:
            return {"reply": f"LiteLLM error: {resp.status_code}", "error": True}
        data = resp.json()
        reply = _redact_sensitive(data["choices"][0]["message"]["content"])
        used = data.get("usage", {}).get("total_tokens", 0)
        if used > _read_token_warning():
            reply += f"\n\n💰 This response used {used:,} tokens. You can adjust the warning threshold in Settings → Token Budget Warning."
        total_tokens = data.get("usage", {}).get("total_tokens", 0)
        if total_tokens:
            try:
                _add_token_usage("deepseek-v4-pro", total_tokens)
            except Exception:
                pass
    except Exception as e:
        err_msg = str(e)
        if "Read timed out" in err_msg or "timed out" in err_msg:
            return {"reply": f"The AI took too long to respond (current timeout: {_read_chat_timeout()}s). You can increase this in Settings → Chat Timeout.", "error": True}
        return {"reply": _redact_sensitive(f"Error: {err_msg}"), "error": True}

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)",
                     (chat_id, "user", body.message, "dashboard", datetime.utcnow().isoformat()))
        conn.execute("INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)",
                     (chat_id, "assistant", reply, "dashboard", datetime.utcnow().isoformat()))
        conn.commit()
        conn.close()
    except Exception:
        pass

    _telegram_send(chat_id, body.message)
    _telegram_send(chat_id, reply)

    return {"reply": reply}

@app.get("/api/chat/history", dependencies=[Depends(require_key)])
def chat_history(limit: int = 50):
    chat_id = os.environ.get("KORVIN_CHAT_ID", "dashboard-chat")
    if not os.path.exists(DB_PATH):
        return {"messages": []}
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT role, content, source, timestamp FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?",
            (chat_id, limit)
        ).fetchall()
        conn.close()
        return {"messages": [{"role": r[0], "content": r[1], "source": r[2] or "telegram", "timestamp": r[3]} for r in reversed(rows)]}
    except Exception:
        return {"messages": []}

# ── Chat Timeout (dashboard-configurable) ─────────────────────────────

@app.get("/api/chat-timeout", dependencies=[Depends(require_key)])
def chat_timeout_get():
    return {"timeout": _read_chat_timeout()}

class ChatTimeoutRequest(BaseModel):
    timeout: int

@app.post("/api/chat-timeout", dependencies=[Depends(require_key)])
def chat_timeout_set(body: ChatTimeoutRequest):
    if body.timeout < 10:
        raise HTTPException(status_code=400, detail="Timeout must be at least 10 seconds")
    _write_chat_timeout(body.timeout)
    return {"saved": True, "timeout": body.timeout}

# ── Token Warning Threshold (dashboard-configurable) ──────────────────

@app.get("/api/token-warning-threshold", dependencies=[Depends(require_key)])
def token_warning_get():
    return {"threshold": _read_token_warning()}

class TokenWarningRequest(BaseModel):
    threshold: int

@app.post("/api/token-warning-threshold", dependencies=[Depends(require_key)])
def token_warning_set(body: TokenWarningRequest):
    if body.threshold < 100:
        raise HTTPException(status_code=400, detail="Threshold must be at least 100 tokens")
    _write_token_warning(body.threshold)
    return {"saved": True, "threshold": body.threshold}

# ── Token Usage & Rates ────────────────────────────────────────────────

@app.get("/api/token-usage", dependencies=[Depends(require_key)])
def token_usage():
    usage = _read_token_usage()
    rates = _read_token_rates()
    today = date.today().isoformat()
    today_data = usage.get(today, {})
    total_tokens_today = today_data.get("total_tokens", 0)
    cost_today = 0.0
    for model, data in today_data.items():
        if model == "total_tokens":
            continue
        rate = rates.get(model, 0)
        cost_today += (data.get("tokens", 0) / 1_000_000) * rate
    month_tokens = 0
    month_cost = 0.0
    for day_key, day_data in usage.items():
        if day_key.startswith(today[:7]):
            month_tokens += day_data.get("total_tokens", 0)
            for model, data in day_data.items():
                if model == "total_tokens":
                    continue
                rate = rates.get(model, 0)
                month_cost += (data.get("tokens", 0) / 1_000_000) * rate
    return {
        "today": {"tokens": total_tokens_today, "cost": round(cost_today, 6)},
        "month": {"tokens": month_tokens, "cost": round(month_cost, 6)}
    }

@app.get("/api/token-rates", dependencies=[Depends(require_key)])
def token_rates():
    return {"rates": _read_token_rates()}

class TokenRatesRequest(BaseModel):
    rates: dict

@app.post("/api/token-rates", dependencies=[Depends(require_key)])
def save_token_rates(body: TokenRatesRequest):
    _write_token_rates(body.rates)
    return {"saved": True, "rates": body.rates}

# ── NEW: Speech‑to‑Text endpoint ───────────────────────────────────────

@app.post("/api/stt", dependencies=[Depends(require_key)])
async def transcribe_audio(file: UploadFile = File(...)):
    if not _WHISPER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Voice features not installed. Run: pip install faster-whisper")
    MAX_SIZE = 10 * 1024 * 1024  # 10 MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Audio file too large (max 10 MB)")

    suffix = ".wav"
    if file.filename and file.filename.lower().endswith(".ogg"):
        suffix = ".ogg"

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(content)
        tmp.close()
        if not _check_voice_activity(tmp.name):
            return {"text": ""}
        model = _get_whisper_model()
        segments, _ = model.transcribe(tmp.name, language="en", beam_size=1, vad_filter=False)
        text = " ".join(s.text for s in segments).strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except:
            pass
    return {"text": text}

class TtsProviderRequest(BaseModel):
    provider: str

@app.post("/api/settings/tts-provider", dependencies=[Depends(require_key)])
def set_tts_provider(body: TtsProviderRequest):
    if body.provider not in ('supertonic', 'chatterbox'):
        raise HTTPException(status_code=400, detail="provider must be 'supertonic' or 'chatterbox'")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TTS_PROVIDER_PATH.write_text(body.provider)
    return {"provider": body.provider, "ok": True}

_STT_MODEL_ALLOWLIST = {"tiny.en", "distil-large-v3"}

class SttModelRequest(BaseModel):
    model: str

@app.post("/api/settings/stt-model", dependencies=[Depends(require_key)])
def set_stt_model(body: SttModelRequest):
    global _whisper_model
    if body.model not in _STT_MODEL_ALLOWLIST:
        raise HTTPException(status_code=400, detail=f"model must be one of: {', '.join(sorted(_STT_MODEL_ALLOWLIST))}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STT_MODEL_PATH.write_text(body.model)
    _whisper_model = None
    return {"model": body.model, "ok": True}

@app.post("/api/voice/chat", dependencies=[Depends(require_key)])
async def voice_chat(file: UploadFile = File(...)):
    """Accept audio file, STT → LLM → TTS, return transcript + reply + audio."""
    if not _WHISPER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Voice features not installed. Run: pip install faster-whisper")
    MAX_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Audio file too large (max 10 MB)")

    # Determine suffix from filename or default to .webm
    suffix = ".webm"
    if file.filename:
        fname = file.filename.lower()
        for ext in [".wav", ".ogg", ".mp3", ".m4a", ".webm"]:
            if fname.endswith(ext):
                suffix = ext
                break

    # STT
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    transcript = ""
    try:
        tmp.write(content)
        tmp.close()
        if not _check_voice_activity(tmp.name):
            return JSONResponse({"error": "No speech detected"}, status_code=422)
        model = _get_whisper_model()
        segments, _ = model.transcribe(tmp.name, language="en", beam_size=1, vad_filter=False)
        transcript = " ".join(s.text for s in segments).strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    if not transcript:
        return JSONResponse({"error": "Could not transcribe audio"}, status_code=422)

    # LLM chat (same pipeline as /api/chat, skip injection check — audio is transcribed)
    chat_id = os.environ.get("KORVIN_CHAT_ID", "dashboard-chat")
    _active_v = _read_active_model()
    _model_name_v = MODEL_LABELS.get(_active_v, _active_v)
    messages = [{
        "role": "system",
        "content": (
            f"You are Korvin, a self-hosted personal AI agent powered by {_model_name_v}. "
            "You are helpful, concise, and warm. "
            f"If asked what model you are, say you are Korvin powered by {_model_name_v}. "
            "Respond in English only. The user is speaking to you via voice ??? keep replies brief and conversational."
        )
    }]

    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 20",
                (chat_id,)
            ).fetchall()
            conn.close()
            for r in reversed(rows):
                messages.append({"role": r[0], "content": r[1]})
        except Exception:
            pass

    messages.append({"role": "user", "content": transcript})

    litellm_url = "http://127.0.0.1:4000/v1/chat/completions"
    litellm_key = os.environ.get("LITELLM_MASTER_KEY", "")
    try:
        resp = requests.post(
            litellm_url,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {litellm_key}"},
            json={
                "model": _read_active_model(),
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 512,
                "stream": False
            },
            timeout=_read_chat_timeout()
        )
        if not resp.ok:
            return JSONResponse({"transcript": transcript, "reply": f"LLM error {resp.status_code}", "audio_base64": None})
        data = resp.json()
        reply = _redact_sensitive(data["choices"][0]["message"]["content"])
    except Exception as e:
        return JSONResponse({"transcript": transcript, "reply": f"Error: {str(e)}", "audio_base64": None})

    # Persist to memory
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)",
            (chat_id, "user", transcript, "dashboard-voice", datetime.utcnow().isoformat())
        )
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)",
            (chat_id, "assistant", reply, "dashboard-voice", datetime.utcnow().isoformat())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

    # TTS
    audio_b64 = None
    audio_fmt = os.environ.get("KORVIN_TTS_FORMAT", "wav")
    import re as _re
    reply_clean = _re.sub(r'\*\*(.*?)\*\*', r'\1', reply)
    reply_clean = _re.sub(r'\*(.*?)\*', r'\1', reply_clean)
    reply_clean = _re.sub(r'`(.*?)`', r'\1', reply_clean)
    tts_provider = _get_tts_provider()
    if tts_provider == "chatterbox":
        chatterbox_url = os.environ.get("KORVIN_CHATTERBOX_URL", "http://127.0.0.1:7789")
        try:
            tts_resp = requests.post(
                f"{chatterbox_url}/generate",
                json={"text": reply_clean, "exaggeration": 0.5, "cfg_weight": 0.5},
                timeout=60
            )
            if tts_resp.ok:
                audio_b64 = base64.b64encode(tts_resp.content).decode()
                audio_fmt = "wav"
        except Exception:
            pass
    else:
        tts_url = os.environ.get("KORVIN_TTS_URL", "http://127.0.0.1:7788/v1/audio/speech")
        tts_voice = os.environ.get("KORVIN_TTS_VOICE", "M1")
        if tts_voice == "default":
            tts_voice = "M1"
        tts_model = os.environ.get("KORVIN_TTS_MODEL", "supertonic-3")
        try:
            tts_resp = requests.post(
                tts_url,
                json={"model": tts_model, "input": reply_clean, "voice": tts_voice, "response_format": audio_fmt},
                timeout=30
            )
            if tts_resp.ok:
                audio_b64 = base64.b64encode(tts_resp.content).decode()
        except Exception:
            pass

    return JSONResponse({"transcript": transcript, "reply": reply, "audio_base64": audio_b64, "audio_format": audio_fmt})
