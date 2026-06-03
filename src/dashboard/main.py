import os, sqlite3, subprocess, re, json, time, tempfile, math, secrets, hmac, sys, struct
from datetime import datetime, date, timedelta
from pathlib import Path
from urllib.parse import urlparse
from fastapi import FastAPI, Header, HTTPException, Depends, File, UploadFile, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from starlette.concurrency import run_in_threadpool, iterate_in_threadpool
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
STT_MODEL_PATH = DATA_DIR / "stt_model.txt"
TTS_VOICE_PATH = DATA_DIR / "tts_voice.txt"
sys.path.insert(0, str(BASE_DIR / "src" / "voice"))
try:
    from voice import (
        synth_wav_bytes as _tts_synth_bytes,
        iter_speech_frames as _tts_iter_frames,
        warm_up as _tts_warm_up,
    )
    _TTS_AVAILABLE = True
except Exception:
    _tts_synth_bytes = _tts_iter_frames = _tts_warm_up = None
    _TTS_AVAILABLE = False

app = FastAPI(title="Korvin Dashboard", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "src" / "dashboard" / "static")), name="static")

@app.on_event("startup")
async def _warm_voice_models():
    # Pay the once-per-process cold start before any user is listening (B126).
    if _WHISPER_AVAILABLE:
        try:
            await run_in_threadpool(_get_whisper_model)
        except Exception as _e:
            print(f"[voice] STT warm-up skipped: {_e}", file=sys.stderr)
    if _TTS_AVAILABLE:
        try:
            await run_in_threadpool(_tts_warm_up)
        except Exception as _e:
            print(f"[voice] TTS warm-up skipped: {_e}", file=sys.stderr)

DB_PATH = str(DATA_DIR / "memory.db")
KILLSWITCH_FLAG = str(DATA_DIR / "killswitch.flag")
CHAT_TIMEOUT_PATH = str(DATA_DIR / "chat_timeout.txt")
TOKEN_WARNING_PATH = str(DATA_DIR / "token_warning_threshold.txt")
CONFIG_PATH = str(DATA_DIR / "config.json")
ACTIVE_MODEL_PATH = str(DATA_DIR / "active_model.txt")
TOKEN_USAGE_PATH = str(DATA_DIR / "token_usage.json")
TOKEN_RATES_PATH = str(DATA_DIR / "token_rates.json")
CAPABILITIES_PATH = str(DATA_DIR / "capabilities.json")
KORVIN_DASHBOARD_TOKEN = os.environ.get("KORVIN_DASHBOARD_TOKEN", "").strip()
SESSION_COOKIE_NAME = "korvin_session"
SESSION_COOKIE_MAX_AGE = 12 * 60 * 60
_dashboard_sessions = {}
LOGIN_RATE_WINDOW = 60
LOGIN_RATE_MAX_FAILURES = 5
_dashboard_login_failures = defaultdict(list)

def _init_db():
    os.makedirs(str(DATA_DIR), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT,
        timestamp TEXT
    )""")
    conn.commit()
    conn.close()

_init_db()

def _constant_time_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(str(left or ""), str(right or ""))

def _has_valid_session(request: Request) -> bool:
    session_id = request.cookies.get(SESSION_COOKIE_NAME, "")
    now = time.time()
    for sid, created in list(_dashboard_sessions.items()):
        if now - created > SESSION_COOKIE_MAX_AGE:
            del _dashboard_sessions[sid]
    created = _dashboard_sessions.get(session_id)
    return bool(session_id and created and now - created <= SESSION_COOKIE_MAX_AGE)

def require_key(request: Request, x_korvin_key: Optional[str] = Header(default=None)):
    if _has_valid_session(request):
        return
    api_key = os.environ.get("KORVIN_API_KEY", "")
    if api_key and x_korvin_key and _constant_time_equal(x_korvin_key, api_key):
        return
    _audit("auth_failed", provided_key_prefix=(x_korvin_key or "")[:6])
    raise HTTPException(status_code=403, detail="Forbidden")

# Secret guardrail: every reply passes through _redact_sensitive() (below) before leaving the server,
# so real keys/tokens never reach the screen. To personalize, ADD patterns to this regex (keep it in
# code, not a runtime field -- a malformed user regex could stop redacting or hang the server / ReDoS).
SECRET_SANITIZE = re.compile(
    r'(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|(?:api[_-]?key|token|secret)\s*[:=]\s*["\']?[^"\'\s]+)',
    re.IGNORECASE
)

def _redact_sensitive(text: str) -> str:
    return SECRET_SANITIZE.sub("[REDACTED_SECRET]", str(text or ""))

PROMPT_INJECTION_RE = re.compile(
    r'ignore\s+(all\s+)?(previous|prior|above)\s+instructions?|you\s+are\s+now|jailbreak|system\s*:|(?:reveal|show|print|dump)\s+(?:your\s+)?system\s+prompt',
    re.IGNORECASE,
)

def _audit(event: str, **kwargs):
    audit_path = DATA_DIR / "audit.ndjson"
    entry = {"ts": datetime.utcnow().isoformat(), "event": event, **kwargs}
    try:
        os.makedirs(str(DATA_DIR), exist_ok=True)
        with open(str(audit_path), "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass

def block_if_killswitch():
    if os.path.exists(KILLSWITCH_FLAG):
        raise HTTPException(status_code=503, detail="Korvin is in read-only mode.")

def _killable_services():
    names = os.environ.get("KORVIN_KILLABLE_SERVICES", "").split()
    # Defence-in-depth: only well-formed unit names, and NEVER the dashboard itself.
    safe = re.compile(r"^[A-Za-z0-9@._-]+\.service$")
    return [n for n in names if safe.match(n) and n != "korvin-dashboard.service"]

def _systemctl_privileged(action, service):
    # action must be "stop" or "start"; service comes only from _killable_services().
    if action not in ("stop", "start"):
        return False
    try:
        r = subprocess.run(
            ["sudo", "-n", "/usr/bin/systemctl", action, service],
            capture_output=True, text=True, timeout=10,
        )
        return r.returncode == 0
    except Exception:
        return False

def _dashboard_chat_id(requested: Optional[str] = None) -> str:
    owner_chat = os.environ.get("KORVIN_CHAT_ID", "").strip()
    if requested and owner_chat and str(requested) != owner_chat:
        raise HTTPException(status_code=400, detail="chat_id is not allowed")
    return owner_chat or "dashboard-chat"

def _reject_prompt_injection(text: str, chat_id: str):
    if PROMPT_INJECTION_RE.search(text or ""):
        _audit("injection_blocked", chat_id=chat_id, snippet=(text or "")[:80])
        raise HTTPException(status_code=400, detail="Input blocked.")

def _persist_exchange(chat_id: str, user_text: str, assistant_text: str, source: str):
    try:
        now = datetime.utcnow().isoformat()
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)",
            (chat_id, "user", user_text, source, now),
        )
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)",
            (chat_id, "assistant", assistant_text, source, now),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

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

# ── Voice allowlists ───────────────────────────────────────────────
_STT_MODEL_ALLOWLIST = {"tiny.en", "distil-medium.en"}

_TTS_VOICE_ALLOWLIST = {
    "af_heart", "af_bella", "af_nova", "af_sarah", "af_sky",
    "am_adam", "am_echo", "am_michael", "am_onyx",
    "bf_emma", "bf_alice", "bm_lewis", "bm_george",
}

# ── Whisper model lazy‑load ────────────────────────────────────────
_whisper_model = None

def _get_stt_model_name() -> str:
    try:
        m = STT_MODEL_PATH.read_text().strip()
        if m in _STT_MODEL_ALLOWLIST:
            return m
    except Exception:
        pass
    return os.environ.get("KORVIN_STT_MODEL", "tiny.en")

def _get_tts_voice() -> str:
    try:
        v = TTS_VOICE_PATH.read_text().strip()
        if v in _TTS_VOICE_ALLOWLIST:
            return v
    except Exception:
        pass
    return "af_heart"

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
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})

class LoginRequest(BaseModel):
    password: str

@app.post("/api/login")
def login(body: LoginRequest, request: Request, response: Response):
    if not KORVIN_DASHBOARD_TOKEN:
        _audit("auth_failed", reason="dashboard_token_missing")
        raise HTTPException(status_code=503, detail="Dashboard login is not configured.")
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    for ip, attempts in list(_dashboard_login_failures.items()):
        fresh = [ts for ts in attempts if now - ts <= LOGIN_RATE_WINDOW]
        if fresh:
            _dashboard_login_failures[ip] = fresh
        else:
            del _dashboard_login_failures[ip]
    failures = _dashboard_login_failures.get(client_ip, [])
    if len(failures) >= LOGIN_RATE_MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Too many attempts, try again shortly.")
    if not _constant_time_equal(body.password, KORVIN_DASHBOARD_TOKEN):
        _dashboard_login_failures[client_ip].append(now)
        _audit("auth_failed", reason="bad_dashboard_password")
        raise HTTPException(status_code=403, detail="Forbidden")
    _dashboard_login_failures.pop(client_ip, None)
    session_id = secrets.token_hex(32)
    _dashboard_sessions[session_id] = time.time()
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_id,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )
    return {"ok": True}

@app.post("/api/logout")
def logout(request: Request, response: Response):
    session_id = request.cookies.get(SESSION_COOKIE_NAME, "")
    if session_id:
        _dashboard_sessions.pop(session_id, None)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}

@app.get("/api/status", dependencies=[Depends(require_key)])
def status():
    return {"korvin": "online", "version": "1.2.0", "memory": "sqlite"}

@app.get("/api/voice/status", dependencies=[Depends(require_key)])
def voice_status():
    if not _WHISPER_AVAILABLE:
        return {"installed": False, "stt_model": None, "stt_label": "Not installed", "tts_label": "Not installed", "tts_provider": None, "stt_model_meta": {}}
    stt_model = _get_stt_model_name()
    tts_voice = _get_tts_voice()
    stt_meta = {
        "tiny.en": {"label": "tiny.en - fastest, ~95 MB RAM", "warning": None},
        "distil-medium.en": {"label": "distil-medium.en - high quality, ~384 MB RAM", "warning": "distil-medium.en requires ~384 MB RAM. Model downloads ~300 MB on first use. Ensure at least 512 MB free RAM before switching."},
    }
    return {
        "installed": True,
        "stt_model": stt_model,
        "stt_models": sorted(_STT_MODEL_ALLOWLIST),
        "stt_model_meta": stt_meta,
        "stt_label": f"Whisper {stt_model}",
        "tts_voice": tts_voice,
        "tts_voices": sorted(_TTS_VOICE_ALLOWLIST),
        "tts_label": f"Kokoro {tts_voice}",
        "tts_provider": "kokoro",
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

def _service_state(service: str) -> str:
    try:
        result = subprocess.run(["systemctl", "is-active", service], capture_output=True, text=True, timeout=3)
        return "running" if result.stdout.strip() == "active" else "stopped"
    except Exception:
        return "unknown"

@app.get("/api/channel", dependencies=[Depends(require_key)])
def channel_status():
    token_set = bool(os.environ.get("TELEGRAM_BOT_TOKEN", "").strip())
    return {
        "telegram": {
            "configured": token_set,
            "status": _service_state("korvin") if token_set else "not_configured",
            "label": "Telegram",
        }
    }

def _read_capabilities():
    try:
        with open(CAPABILITIES_PATH) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []

def _write_capabilities(caps):
    os.makedirs(os.path.dirname(CAPABILITIES_PATH), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(CAPABILITIES_PATH), suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(caps, f, indent=2)
        os.replace(tmp, CAPABILITIES_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

@app.get("/api/skills", dependencies=[Depends(require_key)])
def skills_status():
    items = []
    for entry in _read_capabilities():
        if not isinstance(entry, dict) or entry.get("type") != "skill":
            continue
        items.append({
            "id": entry.get("id"),
            "label": entry.get("label") or entry.get("id"),
            "enabled": entry.get("enabled", True) is True,
            "permission": entry.get("permission"),
        })
    return {"skills": items}

class SkillToggleRequest(BaseModel):
    enabled: bool

@app.post("/api/skills/{skill_id}", dependencies=[Depends(require_key)])
def set_skill_enabled(skill_id: str, body: SkillToggleRequest):
    caps = _read_capabilities()
    target = None
    for entry in caps:
        if isinstance(entry, dict) and entry.get("id") == skill_id and entry.get("type") == "skill":
            target = entry
            break
    if target is None:
        raise HTTPException(status_code=404, detail="Unknown skill")
    target["enabled"] = body.enabled is True
    _write_capabilities(caps)
    return {"id": skill_id, "enabled": target["enabled"]}

@app.get("/api/security/summary", dependencies=[Depends(require_key)])
def security_summary():
    audit_path = DATA_DIR / "audit.ndjson"
    blocked = 0
    recent = []
    if audit_path.exists():
        for raw_line in audit_path.read_text().splitlines()[-100:]:
            try:
                entry = json.loads(raw_line)
            except Exception:
                continue
            if entry.get("event") == "injection_blocked":
                blocked += 1
                recent.append(f"[{entry.get('ts', '?')}] injection blocked")
    return {
        "defender": "active",
        "blocked_count": blocked,
        "recent_threats": recent[-5:],
    }

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

@app.get("/api/system/rate-limits", dependencies=[Depends(require_key)])
def rate_limit_status():
    try:
        result = subprocess.run(
            ['node', '-e', 'const g=require("./src/openclaw/gateway"); const h=g.getLastRateLimitHeaders(); process.stdout.write(JSON.stringify(h||{}))'],
            capture_output=True,
            text=True,
            cwd=APP_DIR,
            timeout=10
        )
        data = json.loads(result.stdout.strip() or '{}')
        return data if data else {"message": "No rate-limit headers seen yet — send a message first."}
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
def context_window(chat_id: str = ""):
    if not chat_id:
        chat_id = os.environ.get("KORVIN_CHAT_ID", "dashboard-chat")
    config = _read_config()
    limit = config.get("memory_limit", 100)
    max_tokens = config.get("max_tokens", 128000)
    try:
        from src.hermes.memory import get_context
        msgs = get_context(chat_id)
        tokens_estimate = sum(len(m.get("content") or "") for m in msgs) // 4
        messages_used = len(msgs)
        pct_messages = round((messages_used / limit) * 100, 1) if limit else 0
        pct_tokens = round((tokens_estimate / max_tokens) * 100, 2) if max_tokens else 0
        return {
            "chat_id": chat_id,
            "messages_used": messages_used,
            "messages_limit": limit,
            "tokens_estimate": tokens_estimate,
            "max_tokens": max_tokens,
            "pct_messages": pct_messages,
            "pct_tokens": pct_tokens,
            "status": "critical" if pct_tokens >= 80 else "warning" if pct_tokens >= 60 else "ok"
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/killswitch", dependencies=[Depends(require_key)])
def killswitch_status():
    active = os.path.exists(KILLSWITCH_FLAG)
    services = {}
    for service in _killable_services():
        try:
            r = subprocess.run(["systemctl", "is-active", service], capture_output=True, text=True, timeout=3)
            services[service] = r.stdout.strip() == "active"
        except Exception:
            services[service] = False
    return {"killswitch": active, "mode": "read_only" if active else "normal", "services": services}

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
    killable = _killable_services()
    services = {}
    if body.enabled:
        open(KILLSWITCH_FLAG, "w").close()
        for service in reversed(killable):
            services[service] = _systemctl_privileged("stop", service)
    else:
        if os.path.exists(KILLSWITCH_FLAG):
            os.remove(KILLSWITCH_FLAG)
        for service in killable:
            services[service] = _systemctl_privileged("start", service)
    active = os.path.exists(KILLSWITCH_FLAG)
    degraded = (not killable) or any(not ok for ok in services.values())
    _audit("killswitch_toggle", enabled=body.enabled, degraded=degraded, services=services)
    return {"killswitch": active, "mode": "read_only" if active else "normal", "services": services, "degraded": degraded}

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

MODEL_LABELS = {
    "deepseek-v4-pro":   "DeepSeek V4 Pro",
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "gemini-flash":      "Gemini Flash",
    "mimo-v2.5":         "MiMo v2.5",
    "mimo-v2.5-pro":     "MiMo v2.5 Pro",
}

MODEL_WHITELIST = {
    "deepseek-v4-pro":   "openai/deepseek-v4-pro",
    "deepseek-v4-flash": "openai/deepseek-v4-flash",
    "gemini-flash":      "gemini/gemini-2.5-flash",
    "mimo-v2.5":         "openai/mimo-v2.5",
    "mimo-v2.5-pro":     "openai/mimo-v2.5-pro",
}

MODEL_KEY_REQUIREMENTS = {
    "deepseek-v4-pro":   "DEEPSEEK_API_KEY",
    "deepseek-v4-flash": "DEEPSEEK_API_KEY",
    "gemini-flash":      "GEMINI_API_KEY",
    "mimo-v2.5":         "MIMO_API_KEY",
    "mimo-v2.5-pro":     "MIMO_API_KEY",
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

@app.post("/api/memory/limit", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def set_memory_limit(body: MemoryLimitRequest):
    if body.memory_limit < 1:
        raise HTTPException(status_code=400, detail="memory_limit must be at least 1")
    if body.max_tokens < 1000:
        raise HTTPException(status_code=400, detail="max_tokens must be at least 1000")
    if body.memory_strategy not in ["sliding_window", "hard_stop", "summarize"]:
        raise HTTPException(status_code=400, detail="Invalid memory_strategy")
    parsed = urlparse(body.summarizer_url)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1"):
        raise HTTPException(status_code=400, detail="summarizer_url must point to localhost over http(s)")
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

@app.post("/api/memory/prune", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def prune_memory(body: Optional[PruneRequest] = None):
    from src.hermes.memory import prune
    chat_id = _dashboard_chat_id(body.chat_id if body else None)
    config = _read_config()
    limit = config.get("memory_limit", 100)
    pruned = prune(chat_id, limit)
    return {"pruned": pruned, "limit": limit, "chat_id": chat_id}

@app.get("/api/active-model", dependencies=[Depends(require_key)])
def get_active_model():
    slug = _read_active_model()
    model_string = MODEL_WHITELIST.get(slug, "unknown")
    return {"active_model": slug, "model_string": model_string}

class SwitchModelRequest(BaseModel):
    model: str

@app.post("/api/switch-model", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
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
DEFAULT_RATES = {
    "deepseek-v4-pro": 0.27,
    "deepseek-v4-flash": 0.07,
    "gemini-flash": 0.15,
    # MiMo: provisional (unified price unverified post-2026-05-26 cut); set high for fail-safe warnings, editable in UI
    "mimo-v2.5": 0.16,
    "mimo-v2.5-pro": 0.40,
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
    owner_chat = os.environ.get("KORVIN_CHAT_ID", "").strip()
    if not token or not owner_chat or str(chat_id) != owner_chat:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": owner_chat, "text": _redact_sensitive(text)},
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

MAX_CHAT_CHARS = 16000  # cap chat/voice input length (DoS + token-cost guard, B31)

class ChatRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None

@app.post("/api/chat", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def chat(body: ChatRequest):
    chat_id = _dashboard_chat_id(body.chat_id)
    allowed, retry_after = _check_chat_rate_limit(chat_id)
    if not allowed:
        return JSONResponse(
            {"error": "Too many requests", "retryAfterSeconds": retry_after},
            status_code=429
        )
    message_text = body.message.replace("\x00", "").strip()
    if not message_text:
        return JSONResponse({"reply": "Please type a message."})
    if len(message_text) > MAX_CHAT_CHARS:
        return JSONResponse({"reply": f"Message too long (max {MAX_CHAT_CHARS} characters)."}, status_code=413)
    _reject_prompt_injection(message_text, chat_id)

    result = subprocess.run(
        ['node', '-e', 'const d=require("./src/skills/dispatcher"); d.dispatchSkill(process.env.MSG,"dashboard").then(r=>process.stdout.write(r||"")).catch(()=>process.stdout.write(""))'],
        env={**os.environ, 'MSG': message_text},
        capture_output=True,
        text=True,
        cwd=APP_DIR,
        timeout=30
    )
    if result.stdout.strip():
        skill_reply = result.stdout.strip()
        try:
            _persist_exchange(chat_id, message_text, skill_reply, "dashboard")
        except Exception:
            pass
        return JSONResponse({'reply': skill_reply})

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

    try:
        from src.hermes.memory import get_context
        for m in get_context(chat_id):
            messages.append({"role": m["role"], "content": m["content"]})
    except Exception:
        pass

    messages.append({"role": "user", "content": message_text})

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
                # Buffered, NOT streamed (B103, intentional): the full reply is scrubbed once by
                # _redact_sensitive() before it reaches the client. Token streaming would emit text
                # before redaction can run on the whole reply, risking a secret flashing on screen.
                "stream": False
            },
            timeout=_read_chat_timeout()
        )
        if not resp.ok:
            _audit("model_error", status=resp.status_code)
            if resp.status_code in (401, 403):
                friendly = "Korvin couldn't authenticate with the model provider. Check that the API key for the active model is set."
            elif resp.status_code == 429:
                friendly = "The model provider is rate-limiting or out of quota. Wait a moment, or check your plan's limits."
            elif resp.status_code in (500, 502, 503, 504):
                friendly = "The model provider is temporarily unavailable. Please try again in a moment."
            else:
                friendly = "The AI service couldn't complete your request. Try again, or switch models in Settings."
            return {"reply": friendly, "error": True}
        data = resp.json()
        _msg = data["choices"][0]["message"]
        reply = _redact_sensitive(_msg.get("content") or _msg.get("reasoning_content") or "")
        used = data.get("usage", {}).get("total_tokens", 0)
        if used > _read_token_warning():
            reply += f"\n\n💰 This response used {used:,} tokens. You can adjust the warning threshold in Settings → Token Budget Warning."
        total_tokens = data.get("usage", {}).get("total_tokens", 0)
        if total_tokens:
            try:
                _add_token_usage(_read_active_model(), total_tokens)
            except Exception:
                pass
    except Exception as e:
        err_msg = str(e)
        if "Read timed out" in err_msg or "timed out" in err_msg:
            return {"reply": f"The AI took too long to respond (current timeout: {_read_chat_timeout()}s). You can increase this in Settings → Chat Timeout.", "error": True}
        return {"reply": _redact_sensitive(f"Error: {err_msg}"), "error": True}

    try:
        _persist_exchange(chat_id, body.message, reply, "dashboard")
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

@app.get("/api/chat/export", dependencies=[Depends(require_key)])
def chat_export():
    chat_id = _dashboard_chat_id()
    if not os.path.exists(DB_PATH):
        return JSONResponse({"messages": []})
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT role, content, source, timestamp FROM messages WHERE chat_id=? ORDER BY id ASC",
            (chat_id,),
        ).fetchall()
        conn.close()
        return {
            "messages": [
                {"role": r[0], "content": r[1], "source": r[2] or "dashboard", "timestamp": r[3]}
                for r in rows
            ]
        }
    except Exception:
        return JSONResponse({"messages": []})

# ── Chat Timeout (dashboard-configurable) ─────────────────────────────

@app.get("/api/chat-timeout", dependencies=[Depends(require_key)])
def chat_timeout_get():
    return {"timeout": _read_chat_timeout()}

class ChatTimeoutRequest(BaseModel):
    timeout: int

@app.post("/api/chat-timeout", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def chat_timeout_set(body: ChatTimeoutRequest):
    if body.timeout < 10:
        raise HTTPException(status_code=400, detail="Timeout must be at least 10 seconds")
    if body.timeout > 300:
        raise HTTPException(status_code=400, detail="Timeout must be at most 300 seconds")
    _write_chat_timeout(body.timeout)
    return {"saved": True, "timeout": body.timeout}

# ── Token Warning Threshold (dashboard-configurable) ──────────────────

@app.get("/api/token-warning-threshold", dependencies=[Depends(require_key)])
def token_warning_get():
    return {"threshold": _read_token_warning()}

class TokenWarningRequest(BaseModel):
    threshold: int

@app.post("/api/token-warning-threshold", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def token_warning_set(body: TokenWarningRequest):
    if not 100 <= body.threshold <= 100_000_000:
        raise HTTPException(status_code=400, detail="Threshold must be between 100 and 100,000,000 tokens")
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

@app.post("/api/token-rates", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def save_token_rates(body: TokenRatesRequest):
    for model, rate in body.rates.items():
        if not isinstance(rate, (int, float)) or isinstance(rate, bool) or rate < 0 or rate > 1000:
            raise HTTPException(status_code=400, detail="Each rate must be a number between 0 and 1000")
    _write_token_rates(body.rates)
    return {"saved": True, "rates": body.rates}

@app.get("/api/token-usage/series", dependencies=[Depends(require_key)])
def token_usage_series(period: str = "day"):
    if period not in ("day", "week", "month", "year"):
        period = "day"
    usage = _read_token_usage()
    rates = _read_token_rates()
    if not isinstance(usage, dict):
        usage = {}
    if not isinstance(rates, dict):
        rates = {}
    today = date.today()
    bucket_defs = []
    if period == "day":
        for i in range(13, -1, -1):
            start = today - timedelta(days=i)
            bucket_defs.append((start.isoformat(), start.strftime("%m-%d")))
    elif period == "week":
        monday = today - timedelta(days=today.weekday())
        for i in range(7, -1, -1):
            start = monday - timedelta(weeks=i)
            bucket_defs.append((start.isoformat(), "Wk " + start.strftime("%m-%d")))
    elif period == "month":
        for i in range(5, -1, -1):
            year = today.year
            month = today.month - i
            while month <= 0:
                month += 12
                year -= 1
            start = date(year, month, 1)
            bucket_defs.append((start.isoformat(), f"{year}-{month:02d}"))
    else:
        for i in range(4, -1, -1):
            start = date(today.year - i, 1, 1)
            bucket_defs.append((start.isoformat(), str(start.year)))

    buckets = {
        start: {"label": label, "start": start, "tokens": {}, "cost": {}}
        for start, label in bucket_defs
    }
    models = set()
    for day_key, day_data in usage.items():
        try:
            day = date.fromisoformat(day_key)
        except Exception:
            continue
        if not isinstance(day_data, dict):
            continue
        if period == "day":
            bucket_key = day.isoformat()
        elif period == "week":
            bucket_key = (day - timedelta(days=day.weekday())).isoformat()
        elif period == "month":
            bucket_key = date(day.year, day.month, 1).isoformat()
        else:
            bucket_key = date(day.year, 1, 1).isoformat()
        bucket = buckets.get(bucket_key)
        if bucket is None:
            continue
        for model, data in day_data.items():
            if model == "total_tokens" or not isinstance(data, dict):
                continue
            try:
                tokens = int(data.get("tokens", 0) or 0)
            except Exception:
                tokens = 0
            bucket["tokens"][model] = bucket["tokens"].get(model, 0) + tokens
            models.add(model)

    model_list = sorted(models)
    output = []
    for start, _label in bucket_defs:
        bucket = buckets[start]
        total_tokens = 0
        total_cost = 0.0
        for model in model_list:
            tokens = bucket["tokens"].get(model, 0)
            try:
                rate = float(rates.get(model, 0) or 0)
            except Exception:
                rate = 0
            cost = (tokens / 1_000_000) * rate
            bucket["tokens"][model] = tokens
            bucket["cost"][model] = round(cost, 6)
            total_tokens += tokens
            total_cost += cost
        bucket["total_tokens"] = total_tokens
        bucket["total_cost"] = round(total_cost, 6)
        output.append(bucket)
    return {"period": period, "models": model_list, "buckets": output}

# ── NEW: Speech‑to‑Text endpoint ───────────────────────────────────────

@app.post("/api/stt", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
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
        raise HTTPException(status_code=500, detail="Transcription failed")
    finally:
        try:
            os.unlink(tmp.name)
        except:
            pass
    return {"text": text}

class SttModelRequest(BaseModel):
    model: str

class TtsVoiceRequest(BaseModel):
    voice: str

@app.post("/api/settings/stt-model", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def set_stt_model(body: SttModelRequest):
    global _whisper_model
    if body.model not in _STT_MODEL_ALLOWLIST:
        raise HTTPException(status_code=400, detail=f"model must be one of: {', '.join(sorted(_STT_MODEL_ALLOWLIST))}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STT_MODEL_PATH.write_text(body.model)
    _whisper_model = None
    return {"model": body.model, "ok": True}

@app.post("/api/settings/tts-voice", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
def set_tts_voice(body: TtsVoiceRequest):
    if body.voice not in _TTS_VOICE_ALLOWLIST:
        raise HTTPException(status_code=400, detail=f"voice must be one of: {', '.join(sorted(_TTS_VOICE_ALLOWLIST))}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TTS_VOICE_PATH.write_text(body.voice)
    return {"voice": body.voice, "ok": True}

@app.post("/api/voice/chat", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
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
    except Exception:
        return JSONResponse({"error": "Could not process audio"}, status_code=422)
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    if not transcript:
        return JSONResponse({"error": "Could not transcribe audio"}, status_code=422)
    if len(transcript) > MAX_CHAT_CHARS:
        transcript = transcript[:MAX_CHAT_CHARS]
    chat_id = _dashboard_chat_id()
    _reject_prompt_injection(transcript, chat_id)
    _active_v = _read_active_model()
    _model_name_v = MODEL_LABELS.get(_active_v, _active_v)
    messages = [{
        "role": "system",
        "content": (
            f"You are Korvin, a self-hosted personal AI agent powered by {_model_name_v}. "
            "You are helpful, concise, and warm. "
            f"If asked what model you are, say you are Korvin powered by {_model_name_v}. "
            "Respond in English only. The user is speaking to you via voice - keep replies brief and conversational."
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
        _msg_v = data["choices"][0]["message"]
        reply = _redact_sensitive(_msg_v.get("content") or _msg_v.get("reasoning_content") or "")
    except Exception as e:
        return JSONResponse({"transcript": transcript, "reply": f"Error: {str(e)}", "audio_base64": None})

    # Persist to memory
    try:
        _persist_exchange(chat_id, transcript, reply, "dashboard-voice")
    except Exception:
        pass

    # TTS via Kokoro
    audio_b64 = None
    audio_fmt = "wav"
    reply_clean = re.sub(r'\*\*(.*?)\*\*', r'\1', reply)
    reply_clean = re.sub(r'\*(.*?)\*', r'\1', reply_clean)
    reply_clean = re.sub(r'`(.*?)`', r'\1', reply_clean)
    if _TTS_AVAILABLE and reply_clean.strip():
        try:
            _voice = _get_tts_voice()
            wav = await run_in_threadpool(_tts_synth_bytes, reply_clean, _voice)
            audio_b64 = base64.b64encode(wav).decode()
        except Exception as _e:
            print(f"[voice] TTS error: {_e}", file=sys.stderr)

    return JSONResponse({"transcript": transcript, "reply": reply, "audio_base64": audio_b64, "audio_format": audio_fmt})

@app.post("/api/voice/chat/stream", dependencies=[Depends(require_key), Depends(block_if_killswitch)])
async def voice_chat_stream(file: UploadFile = File(...)):
    """Accept audio file, STT -> LLM -> redacted streaming TTS audio frames."""
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
    except Exception:
        return JSONResponse({"error": "Could not process audio"}, status_code=422)
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    if not transcript:
        return JSONResponse({"error": "Could not transcribe audio"}, status_code=422)
    if len(transcript) > MAX_CHAT_CHARS:
        transcript = transcript[:MAX_CHAT_CHARS]
    chat_id = _dashboard_chat_id()
    _reject_prompt_injection(transcript, chat_id)
    _active_v = _read_active_model()
    _model_name_v = MODEL_LABELS.get(_active_v, _active_v)
    messages = [{
        "role": "system",
        "content": (
            f"You are Korvin, a self-hosted personal AI agent powered by {_model_name_v}. "
            "You are helpful, concise, and warm. "
            f"If asked what model you are, say you are Korvin powered by {_model_name_v}. "
            "Respond in English only. The user is speaking to you via voice - keep replies brief and conversational."
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
        _msg_v = data["choices"][0]["message"]
        reply = _redact_sensitive(_msg_v.get("content") or _msg_v.get("reasoning_content") or "")
    except Exception as e:
        return JSONResponse({"transcript": transcript, "reply": f"Error: {str(e)}", "audio_base64": None})

    # Persist to memory
    try:
        _persist_exchange(chat_id, transcript, reply, "dashboard-voice")
    except Exception:
        pass

    # B103: `reply` is already fully scrubbed by _redact_sensitive() on the COMPLETE reply BEFORE any
    # text is chunked to TTS below. Streaming the AUDIO of an already-redacted reply preserves the
    # one-pass redaction guarantee; un-redacted text is never sent to the synthesizer.
    reply_clean = re.sub(r'\*\*(.*?)\*\*', r'\1', reply)
    reply_clean = re.sub(r'\*(.*?)\*', r'\1', reply_clean)
    reply_clean = re.sub(r'`(.*?)`', r'\1', reply_clean)

    async def gen():
        # Frame 0 = JSON metadata (transcript + redacted reply) so the client renders text instantly.
        meta = json.dumps({"transcript": transcript, "reply": reply}).encode()
        yield struct.pack(">I", len(meta)) + meta
        if not reply_clean.strip() or not _TTS_AVAILABLE:
            return
        voice = _get_tts_voice()
        try:
            async for frame in iterate_in_threadpool(_tts_iter_frames(reply_clean, voice)):
                yield frame
        except Exception as _e:
            print(f"[voice] stream TTS error: {_e}", file=sys.stderr)
            return

    return StreamingResponse(gen(), media_type="application/octet-stream")
