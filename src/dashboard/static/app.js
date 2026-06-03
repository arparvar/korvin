let dashboardBooted = false;

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const response = await fetch(path, { ...opts, headers, credentials: 'same-origin' });
  if (response.status === 403) {
    showLock();
  }
  return response;
}

function showLock() {
  document.body.classList.add('locked');
  document.getElementById('lock-screen').style.display = 'flex';
}

function hideLock() {
  document.body.classList.remove('locked');
  document.getElementById('lock-screen').style.display = 'none';
}

async function login(event) {
  if (event) event.preventDefault();
  const password = document.getElementById('login-password').value;
  const feedback = document.getElementById('login-feedback');
  const btn = document.getElementById('login-btn');
  feedback.textContent = '';
  btn.disabled = true;
  try {
    const response = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      feedback.textContent = 'Login failed.';
      return;
    }
    document.getElementById('login-password').value = '';
    hideLock();
    bootDashboard();
  } catch (err) {
    feedback.textContent = 'Login failed.';
  } finally {
    btn.disabled = false;
  }
}

// To add an STT model: update _STT_MODEL_ALLOWLIST in src/dashboard/main.py, then add a label here.
const STT_MODEL_LABELS = {
  'tiny.en': 'tiny.en — fastest, ~95 MB RAM (default)',
  'distil-medium.en': 'distil-medium.en — high quality, ~384 MB RAM ⚠',
};

// To add a TTS voice: update _TTS_VOICE_ALLOWLIST in src/dashboard/main.py, then add a label here.
const TTS_VOICE_LABELS = {
  'af_heart': 'af_heart — American female', 'af_bella': 'af_bella — American female',
  'af_nova': 'af_nova — American female', 'af_sarah': 'af_sarah — American female',
  'af_sky': 'af_sky — American female',
  'am_adam': 'am_adam — American male', 'am_echo': 'am_echo — American male',
  'am_michael': 'am_michael — American male', 'am_onyx': 'am_onyx — American male',
  'bf_alice': 'bf_alice — British female', 'bf_emma': 'bf_emma — British female',
  'bm_george': 'bm_george — British male', 'bm_lewis': 'bm_lewis — British male (default)',
};

let allMessages = [];
let _micRecorder = null;
let _micChunks = [];
let _micStream = null;

function toggleMic() {
  if (_micRecorder && _micRecorder.state === 'recording') {
    _micRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Microphone not supported in this browser or context (HTTPS required).');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _micStream = stream;
    _micChunks = [];
    _micRecorder = new MediaRecorder(stream);
    _micRecorder.ondataavailable = function(e) { if (e.data.size > 0) _micChunks.push(e.data); };
    _micRecorder.onstop = function() {
      if (_micStream) { _micStream.getTracks().forEach(function(t) { t.stop(); }); _micStream = null; }
      const blob = new Blob(_micChunks, { type: 'audio/webm' });
      _micChunks = [];
      _micRecorder = null;
      sendVoiceChatStream(blob);
    };
    _micRecorder.start();
    const btn = document.getElementById('mic-btn');
    btn.textContent = '⏹';
    btn.style.background = '#c0392b';
  }).catch(function(err) {
    alert('Microphone access denied: ' + err.message);
  });
}

async function sendVoiceChat(blob) {
  const btn = document.getElementById('mic-btn');
  btn.disabled = true;
  btn.textContent = '⏳';
  btn.style.background = '';
  try {
    const form = new FormData();
    form.append('file', blob, 'voice.webm');
    const r = await api('/api/voice/chat', { method: 'POST', headers: {}, body: form });
    const d = await r.json();
    if (!r.ok && d.detail) { appendChatMessage('system', d.detail); return; }
    if (d.error && !d.transcript) {
      appendChatMessage('system', 'Voice error: ' + d.error);
      return;
    }
    if (d.transcript) appendChatMessage('user', d.transcript, 'dashboard-voice');
    if (d.reply) {
      appendChatMessage('assistant', d.reply, 'dashboard-voice');
      document.getElementById('chat-messages').scrollTop = 99999;
    }
    if (d.audio_base64) {
      try {
        const bytes = atob(d.audio_base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const mimeType = (d.audio_format === 'mp3') ? 'audio/mpeg' : 'audio/wav';
        const url = URL.createObjectURL(new Blob([arr], { type: mimeType }));
        // Render a native audio player in the chat: autoplay if the browser allows it,
        // otherwise the visible controls give a guaranteed one-tap play (clicking the
        // built-in ▶ is a direct gesture every browser honors). More reliable than
        // playing a detached Audio() object after the network round-trip.
        const player = document.createElement('audio');
        player.controls = true;
        player.autoplay = true;
        player.src = url;
        player.className = 'voice-reply';
        player.onended = function() { URL.revokeObjectURL(url); };
        const slot = document.getElementById('voice-player-slot');
        const old = slot.querySelector('audio');
        if (old && old.src.startsWith('blob:')) URL.revokeObjectURL(old.src);
        slot.innerHTML = '';
        slot.appendChild(player);
        player.play().catch(function(){ /* autoplay blocked — tap the visible ▶ control */ });
      } catch(e) { /* audio playback failed silently */ }
    }
  } catch(e) {
    appendChatMessage('system', 'Voice chat error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🎤';
    btn.style.background = '';
  }
}

// EPIC V Stage 1: streamed voice reply. Plays each audio chunk as it arrives (gapless) via Web Audio.
// The AudioContext is created right after the user's stop-recording gesture, so autoplay is permitted.
// On ANY failure it falls back to the proven non-streaming sendVoiceChat (production never regresses).
async function sendVoiceChatStream(blob) {
  const btn = document.getElementById('mic-btn');
  btn.disabled = true; btn.textContent = '⏳'; btn.style.background = '';
  let ctx = null;
  try {
    const form = new FormData();
    form.append('file', blob, 'voice.webm');
    const r = await fetch('/api/voice/chat/stream', { method: 'POST', body: form, credentials: 'same-origin' });
    if (r.status === 403) { showLock(); throw new Error('locked'); }
    if (!r.ok || !r.body) throw new Error('stream unavailable');
    if (!String(r.headers.get('content-type') || '').includes('application/octet-stream')) throw new Error('stream unavailable');

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    try { await ctx.resume(); } catch (_) {}
    if (ctx.state === 'suspended') throw new Error('audio blocked'); // -> fallback gives a tappable player

    const reader = r.body.getReader();
    let buf = new Uint8Array(0);
    let gotMeta = false;
    let nextStart = ctx.currentTime;
    const concat = (a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; };

    while (true) {
      const { done, value } = await reader.read();
      if (value) buf = concat(buf, value);
      while (buf.length >= 4) {
        const len = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
        if (buf.length < 4 + len) break;
        const payload = buf.slice(4, 4 + len);
        buf = buf.slice(4 + len);
        if (!gotMeta) {
          gotMeta = true;
          const meta = JSON.parse(new TextDecoder().decode(payload));
          if (meta.transcript) appendChatMessage('user', meta.transcript, 'dashboard-voice');
          if (meta.reply) {
            appendChatMessage('assistant', meta.reply, 'dashboard-voice');
            document.getElementById('chat-messages').scrollTop = 99999;
          }
        } else {
          const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
          const audioBuf = await ctx.decodeAudioData(ab);
          const src = ctx.createBufferSource();
          src.buffer = audioBuf; src.connect(ctx.destination);
          const startAt = Math.max(nextStart, ctx.currentTime);
          src.start(startAt);
          nextStart = startAt + audioBuf.duration;
        }
      }
      if (done) break;
    }
  } catch (e) {
    if (ctx) { try { ctx.close(); } catch (_) {} }
    return sendVoiceChat(blob); // proven fallback: renders a tappable <audio> player
  } finally {
    btn.disabled = false; btn.textContent = '🎤'; btn.style.background = '';
  }
}

const LIVE_IDLE_LABEL = '🔴 Live';
const LIVE_STOP_LABEL = '■ Stop';

const liveVoice = {
  active: false,
  state: 'idle',
  session: 0,
  stream: null,
  ctx: null,
  analyser: null,
  inputSource: null,
  floorRms: 0.0015,
  recorder: null,
  chunks: [],
  vadTimer: null,
  maxTimer: null,
  bargeTimer: null,
  statusTimer: null,
  abortController: null,
  sources: []
};

function liveDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setLiveStatus(msg) {
  const el = document.getElementById('voice-status');
  if (el) el.textContent = msg || '';
}

function setLiveButton(active) {
  const btn = document.getElementById('live-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = active ? LIVE_STOP_LABEL : LIVE_IDLE_LABEL;
  btn.style.background = active ? '#c0392b' : '';
}

function resetLiveIdle(msg) {
  liveVoice.active = false;
  liveVoice.state = 'idle';
  setLiveButton(false);
  setLiveStatus(msg || '');
}

function clearLiveTimers() {
  if (liveVoice.vadTimer) clearInterval(liveVoice.vadTimer);
  if (liveVoice.maxTimer) clearTimeout(liveVoice.maxTimer);
  if (liveVoice.bargeTimer) clearInterval(liveVoice.bargeTimer);
  if (liveVoice.statusTimer) clearTimeout(liveVoice.statusTimer);
  liveVoice.vadTimer = null;
  liveVoice.maxTimer = null;
  liveVoice.bargeTimer = null;
  liveVoice.statusTimer = null;
}

function liveRms(analyser, data) {
  if (!analyser || !data) return 0;
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

async function probeAudioInput() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { ok: false, msg: 'Voice needs mic support (HTTPS/localhost).' };
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return { ok: false, msg: 'Voice needs Web Audio support in this browser.' };
  }

  let stream = null;
  let ctx = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (_) {
    return { ok: false, msg: 'Mic access denied or unavailable.' };
  }

  try {
    ctx = new AudioCtx();
    try { await ctx.resume(); } catch (_) {}
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const inputSource = ctx.createMediaStreamSource(stream);
    inputSource.connect(analyser);

    const data = new Float32Array(analyser.fftSize);
    const until = Date.now() + 800;
    let peak = 0;
    let total = 0;
    let count = 0;
    while (Date.now() < until) {
      const rms = liveRms(analyser, data);
      peak = Math.max(peak, rms);
      total += rms;
      count += 1;
      await liveDelay(50);
    }

    if (peak < 0.0015) {
      stream.getTracks().forEach(t => t.stop());
      try { await ctx.close(); } catch (_) {}
      return {
        ok: false,
        msg: 'No working microphone detected (common on servers/VMs). Voice input unavailable - use text chat.'
      };
    }

    // JS cannot detect a null output sink like ZIION auto_null; playback may "succeed" silently.
    return {
      ok: true,
      stream,
      ctx,
      analyser,
      inputSource,
      floorRms: Math.max(total / Math.max(count, 1), 0.0015)
    };
  } catch (_) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ctx) { try { await ctx.close(); } catch (__) {} }
    return { ok: false, msg: 'Voice input unavailable - use text chat.' };
  }
}

async function enterLiveMode() {
  if (liveVoice.active) return;
  const btn = document.getElementById('live-btn');
  if (btn) btn.disabled = true;
  setLiveStatus('Checking mic...');

  const probe = await probeAudioInput();
  if (!probe.ok) {
    resetLiveIdle(probe.msg);
    return;
  }
  if (!window.MediaRecorder) {
    probe.stream.getTracks().forEach(t => t.stop());
    try { await probe.ctx.close(); } catch (_) {}
    resetLiveIdle('Voice recording needs MediaRecorder support in this browser.');
    return;
  }

  liveVoice.active = true;
  liveVoice.state = 'listening';
  liveVoice.session += 1;
  liveVoice.stream = probe.stream;
  liveVoice.ctx = probe.ctx;
  liveVoice.analyser = probe.analyser;
  liveVoice.inputSource = probe.inputSource;
  liveVoice.floorRms = probe.floorRms;
  setLiveButton(true);
  startLiveListening(liveVoice.session);
}

function exitLiveMode() {
  liveVoice.active = false;
  liveVoice.state = 'idle';
  liveVoice.session += 1;
  clearLiveTimers();

  if (liveVoice.recorder && liveVoice.recorder.state === 'recording') {
    try { liveVoice.recorder.stop(); } catch (_) {}
  }
  liveVoice.recorder = null;
  liveVoice.chunks = [];

  stopLiveSources();
  if (liveVoice.abortController) {
    try { liveVoice.abortController.abort(); } catch (_) {}
  }
  liveVoice.abortController = null;

  if (liveVoice.stream) liveVoice.stream.getTracks().forEach(t => t.stop());
  liveVoice.stream = null;
  liveVoice.analyser = null;
  liveVoice.inputSource = null;
  if (liveVoice.ctx) {
    try { liveVoice.ctx.close(); } catch (_) {}
  }
  liveVoice.ctx = null;
  resetLiveIdle('');
}

function toggleLiveMode() {
  if (liveVoice.active) exitLiveMode();
  else enterLiveMode();
}

function stopLiveSources() {
  liveVoice.sources.forEach(src => {
    try { src.stop(); } catch (_) {}
    try { src.disconnect(); } catch (_) {}
  });
  liveVoice.sources = [];
}

function stopLiveRecorder() {
  if (!liveVoice.recorder || liveVoice.recorder.state !== 'recording') return;
  clearInterval(liveVoice.vadTimer);
  clearTimeout(liveVoice.maxTimer);
  liveVoice.vadTimer = null;
  liveVoice.maxTimer = null;
  try { liveVoice.recorder.stop(); } catch (_) {}
}

function startLiveListening(token) {
  if (!liveVoice.active || token !== liveVoice.session || !liveVoice.stream || !liveVoice.analyser) return;
  clearLiveTimers();
  stopLiveSources();
  liveVoice.state = 'listening';
  setLiveButton(true);
  setLiveStatus('Listening...');

  const recorder = new MediaRecorder(liveVoice.stream);
  const chunks = [];
  const data = new Float32Array(liveVoice.analyser.fftSize);
  const threshold = Math.max(liveVoice.floorRms * 3, 0.01);
  let loudFrames = 0;
  let quietMs = 0;
  let speechStarted = false;

  liveVoice.recorder = recorder;
  liveVoice.chunks = chunks;
  recorder.ondataavailable = function(e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.onerror = function() {
    if (token === liveVoice.session) {
      exitLiveMode();
      resetLiveIdle('Voice recording failed - use text chat.');
    }
  };
  recorder.onstop = function() {
    handleLiveRecorderStop(chunks, speechStarted, token);
  };

  try {
    recorder.start();
  } catch (_) {
    exitLiveMode();
    resetLiveIdle('Voice recording failed - use text chat.');
    return;
  }

  liveVoice.vadTimer = setInterval(function() {
    if (!liveVoice.active || token !== liveVoice.session || recorder.state !== 'recording') return;
    const rms = liveRms(liveVoice.analyser, data);
    if (rms > threshold) loudFrames += 1;
    else loudFrames = 0;
    if (!speechStarted && loudFrames >= 3) speechStarted = true;
    if (!speechStarted) return;
    if (rms < threshold) quietMs += 50;
    else quietMs = 0;
    if (quietMs >= 900) stopLiveRecorder();
  }, 50);

  liveVoice.maxTimer = setTimeout(stopLiveRecorder, 30000);
}

async function handleLiveRecorderStop(chunks, speechStarted, token) {
  clearInterval(liveVoice.vadTimer);
  clearTimeout(liveVoice.maxTimer);
  liveVoice.vadTimer = null;
  liveVoice.maxTimer = null;
  if (token !== liveVoice.session) return;
  liveVoice.recorder = null;
  if (!liveVoice.active) return;

  const blob = new Blob(chunks, { type: 'audio/webm' });
  liveVoice.chunks = [];
  if (!speechStarted || blob.size < 800) {
    startLiveListening(token);
    return;
  }

  liveVoice.state = 'thinking';
  setLiveStatus('Thinking...');
  try {
    await playLiveReply(blob, token);
    if (liveVoice.active && token === liveVoice.session && liveVoice.state === 'speaking') {
      startLiveListening(token);
    }
  } catch (e) {
    if (token !== liveVoice.session) return;
    if (e && e.message === 'locked') {
      showLock();
      exitLiveMode();
      return;
    }
    if (liveVoice.active) {
      setLiveStatus('Voice playback failed - listening again.');
      liveVoice.statusTimer = setTimeout(function() {
        if (liveVoice.active && token === liveVoice.session) startLiveListening(token);
      }, 900);
    } else {
      resetLiveIdle('Voice error - use text chat.');
    }
  }
}

async function playLiveReply(blob, token) {
  if (!liveVoice.ctx) throw new Error('audio unavailable');
  const form = new FormData();
  form.append('file', blob, 'voice.webm');
  const controller = new AbortController();
  liveVoice.abortController = controller;
  let r = null;
  try {
    r = await fetch('/api/voice/chat/stream', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      signal: controller.signal
    });
  } catch (e) {
    if (liveVoice.abortController === controller) liveVoice.abortController = null;
    throw e;
  }
  if (r.status === 403) {
    if (liveVoice.abortController === controller) liveVoice.abortController = null;
    throw new Error('locked');
  }
  if (!r.ok || !r.body) {
    if (liveVoice.abortController === controller) liveVoice.abortController = null;
    throw new Error('stream unavailable');
  }
  if (!String(r.headers.get('content-type') || '').includes('application/octet-stream')) {
    if (liveVoice.abortController === controller) liveVoice.abortController = null;
    throw new Error('stream unavailable');
  }
  if (!liveVoice.active || token !== liveVoice.session) {
    if (liveVoice.abortController === controller) liveVoice.abortController = null;
    return;
  }

  try { await liveVoice.ctx.resume(); } catch (_) {}
  liveVoice.state = 'speaking';
  setLiveStatus('Speaking...');
  startLiveBargeWatch(token);

  const reader = r.body.getReader();
  let buf = new Uint8Array(0);
  let gotMeta = false;
  let nextStart = liveVoice.ctx.currentTime;
  const concat = (a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (token !== liveVoice.session || !liveVoice.active) return;
      if (value) buf = concat(buf, value);
      while (buf.length >= 4) {
        const len = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
        if (buf.length < 4 + len) break;
        const payload = buf.slice(4, 4 + len);
        buf = buf.slice(4 + len);
        if (!gotMeta) {
          gotMeta = true;
          const meta = JSON.parse(new TextDecoder().decode(payload));
          if (meta.transcript) appendChatMessage('user', meta.transcript, 'dashboard-voice');
          if (meta.reply) {
            appendChatMessage('assistant', meta.reply, 'dashboard-voice');
            document.getElementById('chat-messages').scrollTop = 99999;
          }
        } else {
          const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
          const audioBuf = await liveVoice.ctx.decodeAudioData(ab);
          if (token !== liveVoice.session || !liveVoice.active) return;
          const src = liveVoice.ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(liveVoice.ctx.destination);
          src.onended = function() {
            liveVoice.sources = liveVoice.sources.filter(s => s !== src);
          };
          const startAt = Math.max(nextStart, liveVoice.ctx.currentTime);
          liveVoice.sources.push(src);
          src.start(startAt);
          nextStart = startAt + audioBuf.duration;
        }
      }
      if (done) break;
    }
    const waitMs = Math.max(0, (nextStart - liveVoice.ctx.currentTime) * 1000) + 50;
    await liveDelay(waitMs);
  } finally {
    if (liveVoice.abortController === controller) liveVoice.abortController = null;
    if (liveVoice.bargeTimer) clearInterval(liveVoice.bargeTimer);
    liveVoice.bargeTimer = null;
    stopLiveSources();
  }
}

function startLiveBargeWatch(token) {
  if (liveVoice.bargeTimer) clearInterval(liveVoice.bargeTimer);
  const data = new Float32Array(liveVoice.analyser.fftSize);
  const threshold = Math.max(liveVoice.floorRms * 6, 0.05);
  let loudMs = 0;
  liveVoice.bargeTimer = setInterval(function() {
    if (!liveVoice.active || token !== liveVoice.session || liveVoice.state !== 'speaking') return;
    const rms = liveRms(liveVoice.analyser, data);
    loudMs = rms > threshold ? loudMs + 50 : 0;
    if (loudMs < 200) return;
    // v1 assumes headphones or getUserMedia AEC; speaker audio can loop into the mic.
    // Upgrade path: Silero VAD in an ONNX Web Worker plus real AEC.
    liveVoice.session += 1;
    stopLiveSources();
    if (liveVoice.abortController) {
      try { liveVoice.abortController.abort(); } catch (_) {}
      liveVoice.abortController = null;
    }
    startLiveListening(liveVoice.session);
  }, 50);
}
let killActive = false;
let cwLimit = 46;
let configMaxTokens = 128000;
let autoRefreshTimer = null;
let chatRefreshTimer = null;
let chatIsLoading = false;
let modelList = [];
let sttModelMeta = {};
let chartPeriod = 'day';
let chartMetric = 'cost';
let lastUsageSeries = null;
const MODEL_COLORS = {
  'deepseek-v4-pro': '#58a6ff',
  'deepseek-v4-flash': '#3fb950',
  'gemini-flash': '#d29922',
  'mimo-v2.5': '#a371f7',
  'mimo-v2.5-pro': '#f778ba'
};
const FALLBACK_COLORS = ['#ff7b72', '#79c0ff', '#7ee787', '#e3b341', '#d2a8ff'];

// ── Theme ──────────────────────────────────────────────────────────
function applyTheme(light) {
  document.body.classList.toggle('light', light);
  document.getElementById('theme-btn').textContent = light ? '🌙' : '☀️';
}
function toggleTheme() {
  const isLight = !document.body.classList.contains('light');
  localStorage.setItem('korvin-theme', isLight ? 'light' : 'dark');
  applyTheme(isLight);
}

function updateSttWarning(model) {
  const warn = document.getElementById('stt-model-warning');
  if (!warn) return;
  const warning = sttModelMeta[model] && sttModelMeta[model].warning;
  if (warning) {
    warn.style.cssText = 'display:block;margin-top:8px;padding:8px;border-radius:6px;font-size:0.78rem;background:#3a3a00;color:#ffdd88';
    warn.textContent = warning;
  } else {
    warn.style.display = 'none';
  }
}
async function saveSttModel() {
  const sel = document.getElementById('stt-model-select');
  const fb = document.getElementById('stt-model-feedback');
  if (!sel) return;
  try {
    const r = await api('/api/settings/stt-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: sel.value })
    });
    if (r.ok) {
      fb.textContent = 'Saved. New model loads on next voice request.';
      fb.className = 'feedback ok';
      await loadVoiceStatus();
    } else {
      fb.textContent = 'Error saving model.';
      fb.className = 'feedback err';
    }
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
}

applyTheme(localStorage.getItem('korvin-theme') === 'light');

// ── Navigation ─────────────────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button:not(.theme-btn)').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  clearInterval(autoRefreshTimer);
  clearInterval(chatRefreshTimer);
  if (id === 'home') {
    loadSystem(); loadActiveModelStatus(); loadHealth(); loadChannelStatus(); loadVoiceStatus(); loadUsageChart(); loadContextWindow('cw-home');
    autoRefreshTimer = setInterval(() => { loadSystem(); loadHealth(); loadChannelStatus(); loadUsageChart(); loadContextWindow('cw-home'); }, 10000);
  }
  if (id === 'memory') { loadMemoryConfig(); loadMemory(); loadContextWindow('cw-memory'); }
  if (id === 'logs') loadLogs();
  if (id === 'skills') loadSkills();
  if (id === 'security') { loadKillswitch(); loadSecuritySummary(); }
  if (id === 'settings') { loadModels(); loadTokenRates(); loadTimeout(); loadWarning(); loadChannelStatus(); loadVoiceStatus(); }
  if (id === 'chat') {
    loadChatHistory();
    chatRefreshTimer = setInterval(loadChatHistory, 5000);
  }
}

// ── System ─────────────────────────────────────────────────────────
async function loadSystem() {
  try {
    const r = await api('/api/system', { headers: {} });
    const d = await r.json();
    document.getElementById('s-cpu').textContent = d.cpu_pct ? d.cpu_pct + '%' : '—';
    document.getElementById('s-mem-used').textContent = d.mem_used_mb || '—';
    document.getElementById('s-disk-used').textContent = d.disk_used || '—';
    document.getElementById('s-disk-free').textContent = d.disk_free || '—';
    if (d.mem_total_mb && d.mem_used_mb) {
      const memPct = Math.round((parseInt(d.mem_used_mb) / parseInt(d.mem_total_mb)) * 100);
      document.getElementById('s-mem-pct').textContent = memPct;
      const barMem = document.getElementById('bar-mem');
      barMem.style.width = memPct + '%';
      barMem.className = 'bar ' + (memPct >= 80 ? 'critical' : memPct >= 60 ? 'warning' : 'ok');
    }
    if (d.disk_pct) {
      const diskPct = parseInt(d.disk_pct);
      document.getElementById('s-disk-pct').textContent = d.disk_pct;
      const barDisk = document.getElementById('bar-disk');
      barDisk.style.width = diskPct + '%';
      barDisk.className = 'bar ' + (diskPct >= 80 ? 'critical' : diskPct >= 60 ? 'warning' : 'ok');
    }
  } catch(e) { console.error('System load error:', e); }
}

// ── Health ─────────────────────────────────────────────────────────
async function loadHealth() {
  try {
    const r = await api('/api/health');
    const d = await r.json();
    const botOk = d.bot === 'running';
    document.getElementById('health-bot').textContent = d.bot;
    document.getElementById('health-bot-dot').className = 'dot ' + (botOk ? 'green' : 'red');
    const litellmOk = d.litellm === 'reachable';
    document.getElementById('health-litellm').textContent = d.litellm;
    document.getElementById('health-litellm-dot').className = 'dot ' + (litellmOk ? 'green' : 'red');
    const backupOk = d.backup_hours !== null && d.backup_hours < 7;
    document.getElementById('health-memory').textContent = d.memory_total + ' messages';
    document.getElementById('health-memory-dot').className = 'dot green';
    document.getElementById('health-backup').textContent = d.backup_last ? d.backup_last + ' (' + (d.backup_hours || '?') + 'h ago)' : 'none';
    document.getElementById('health-backup-dot').className = 'dot ' + (backupOk ? 'green' : 'yellow');
    const overallOk = d.status === 'ok';
    document.getElementById('health-overall').textContent = d.status;
    document.getElementById('health-overall-dot').className = 'dot ' + (overallOk ? 'green' : 'red');
  } catch(e) { /* ignore */ }
}

async function loadChannelStatus() {
  try {
    const r = await api('/api/channel');
    const d = await r.json();
    const telegram = d.telegram || {};
    const status = telegram.status || 'unknown';
    const text = status === 'running' ? 'Telegram: connected' : status === 'not_configured' ? 'Telegram: not configured' : 'Telegram: ' + status;
    ['home-telegram-status', 'settings-telegram-status'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    });
    ['home-telegram-dot', 'settings-telegram-dot'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.className = 'dot ' + (status === 'running' ? 'green' : status === 'not_configured' ? 'yellow' : 'red');
    });
  } catch(e) { /* keep defaults */ }
}

async function loadVoiceStatus() {
  try {
    const r = await api('/api/voice/status', { headers: {} });
    const d = await r.json();
    const homeLabel = document.getElementById('home-voice-label');
    const sttLabel = document.getElementById('settings-stt-label');
    const ttsLabel = document.getElementById('settings-tts-label');
    sttModelMeta = d.stt_model_meta || {};
    if (homeLabel) homeLabel.textContent = (d.stt_label || 'Whisper') + ' + ' + (d.tts_label || 'Kokoro');
    if (sttLabel) sttLabel.textContent = d.stt_label || 'Whisper tiny.en';
    if (ttsLabel) ttsLabel.textContent = d.tts_label || 'Kokoro bm_lewis';
    const sttSel = document.getElementById('stt-model-select');
    if (sttSel && d.stt_models) {
      sttSel.replaceChildren(...d.stt_models.map(m => new Option((sttModelMeta[m] && sttModelMeta[m].label) || STT_MODEL_LABELS[m] || m, m)));
      if (d.stt_model) { sttSel.value = d.stt_model; updateSttWarning(d.stt_model); }
    }
    const ttsSel = document.getElementById('tts-voice-select');
    if (ttsSel && d.tts_voices) {
      ttsSel.replaceChildren(...d.tts_voices.map(v => new Option(TTS_VOICE_LABELS[v] || v, v)));
      if (d.tts_voice) ttsSel.value = d.tts_voice;
    }
  } catch(e) { /* keep defaults */ }
}

async function saveTtsVoice() {
  const sel = document.getElementById('tts-voice-select');
  const fb = document.getElementById('tts-voice-feedback');
  if (!sel) return;
  try {
    const r = await api('/api/settings/tts-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: sel.value })
    });
    if (r.ok) {
      fb.textContent = 'Saved. New voice applies to next TTS response.';
      fb.className = 'feedback ok';
      await loadVoiceStatus();
    } else {
      fb.textContent = 'Error saving voice.';
      fb.className = 'feedback err';
    }
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
}

// ── Token Usage ────────────────────────────────────────────────────
function renderUsageSummary(data) {
  const el = document.getElementById('token-usage');
  if (!el) return;
  const labels = { day: 'Today', week: 'This week', month: 'This month', year: 'This year' };
  const periodLabel = labels[data && data.period] || 'Current';
  const buckets = (data && data.buckets) || [];
  if (!buckets.length) {
    el.innerHTML = '<span style="color:var(--text3)">No usage data yet.</span>';
    return;
  }
  const current = buckets[buckets.length - 1];
  const tokens = Number(current.total_tokens || 0);
  const cost = Number(current.total_cost || 0);
  el.innerHTML = `<div class="status-row">${periodLabel}: <strong>${tokens.toLocaleString()}</strong> tokens · ~<strong>$${cost.toFixed(4)}</strong></div>`;
}

async function loadUsageChart() {
  const chart = document.getElementById('usage-chart');
  try {
    const r = await api(`/api/token-usage/series?period=${chartPeriod}`, { headers: {} });
    if (!r.ok) throw new Error('Chart load failed');
    lastUsageSeries = await r.json();
    renderUsageSummary(lastUsageSeries);
    renderChart(lastUsageSeries);
  } catch(e) {
    if (chart) chart.innerHTML = '<span style="color:var(--text3)">No usage data yet.</span>';
  }
}

function modelColor(model, index) {
  return MODEL_COLORS[model] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function formatChartValue(value) {
  if (chartMetric === 'cost') return '$' + Number(value || 0).toFixed(4);
  return Number(value || 0).toLocaleString() + ' tokens';
}

function renderChart(data) {
  const chart = document.getElementById('usage-chart');
  const legend = document.getElementById('chart-legend');
  if (!chart || !data || !data.buckets) return;
  const models = data.models || [];
  const buckets = data.buckets || [];
  if (!buckets.length) {
    chart.innerHTML = '<span style="color:var(--text3)">No usage data yet.</span>';
    if (legend) legend.innerHTML = '';
    return;
  }

  const width = 320;
  const height = 160;
  const top = 10;
  const chartHeight = 104;
  const baseY = top + chartHeight;
  const slot = (width - 16) / buckets.length;
  const barWidth = Math.max(6, Math.min(16, slot * 0.62));
  const totals = buckets.map(b => chartMetric === 'cost' ? (b.total_cost || 0) : (b.total_tokens || 0));
  const maxTotal = Math.max(0, ...totals);
  const labelEvery = buckets.length > 8 ? 2 : 1;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="API usage chart">`;
  svg += `<line x1="8" y1="${baseY}" x2="${width - 8}" y2="${baseY}" stroke="var(--border)" stroke-width="1"></line>`;

  buckets.forEach((bucket, bucketIndex) => {
    const x = 8 + (slot * bucketIndex) + (slot - barWidth) / 2;
    let y = baseY;
    models.forEach((model, modelIndex) => {
      const cost = bucket.cost || {};
      const tokens = bucket.tokens || {};
      const value = chartMetric === 'cost' ? (cost[model] || 0) : (tokens[model] || 0);
      if (!value || maxTotal <= 0) return;
      const segmentHeight = Math.max(1, (value / maxTotal) * chartHeight);
      y -= segmentHeight;
      svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segmentHeight.toFixed(2)}" fill="${modelColor(model, modelIndex)}">`;
      svg += `<title>${escapeHtml(bucket.label)} - ${escapeHtml(model)}: ${formatChartValue(value)}</title></rect>`;
    });
    if (totals[bucketIndex] <= 0) {
      svg += `<rect x="${x.toFixed(2)}" y="${baseY - 2}" width="${barWidth.toFixed(2)}" height="2" fill="var(--bg3)">`;
      svg += `<title>${escapeHtml(bucket.label)}: ${formatChartValue(0)}</title></rect>`;
    }
    if (bucketIndex % labelEvery === 0 || bucketIndex === buckets.length - 1) {
      svg += `<text x="${(x + barWidth / 2).toFixed(2)}" y="146" text-anchor="middle" fill="var(--text3)" font-size="8">${escapeHtml(bucket.label)}</text>`;
    }
  });
  svg += '</svg>';
  chart.innerHTML = svg;
  if (legend) {
    legend.innerHTML = models.map((model, index) => `
      <span><i class="chart-swatch" style="background:${modelColor(model, index)}"></i>${escapeHtml(model)}</span>
    `).join('');
  }
}

// ── Token Rates ────────────────────────────────────────────────────
async function loadTokenRates() {
  try {
    const r = await api('/api/token-rates', { headers: {} });
    const d = await r.json();
    const labels = {
      'deepseek-v4-pro':  'DeepSeek V4 Pro',
      'deepseek-v4-flash': 'DeepSeek V4 Flash',
      'gemini-flash':     'Gemini Flash',
      'mimo-v2.5':        'MiMo v2.5',
      'mimo-v2.5-pro':    'MiMo v2.5 Pro',
    };
    document.getElementById('rates-fields').innerHTML = Object.entries(d.rates).map(([key, val]) => {
      return `<div class="status-row">
        <span style="min-width:180px">${labels[key] || key}</span>
        <input class="field-input rate-input" type="number" step="0.01" min="0" value="${val}" data-model="${key}" style="width:100px;margin:0">
        <span style="color:var(--text3);font-size:0.8rem">/ 1M tokens</span>
      </div>`;
    }).join('');
  } catch(e) { /* ignore */ }
}

async function saveRates() {
  const fb = document.getElementById('rates-feedback');
  const btn = document.getElementById('save-rates-btn');
  const inputs = document.querySelectorAll('.rate-input');
  const rates = {};
  inputs.forEach(inp => { rates[inp.dataset.model] = parseFloat(inp.value) || 0; });
  try {
    btn.disabled = true;
    const r = await api('/api/token-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates })
    });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'feedback err'; btn.disabled = false; return; }
    fb.textContent = '✓ Rates saved.';
    fb.className = 'feedback ok';
    loadUsageChart();
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
  btn.disabled = false;
}

// ── Chat Timeout ───────────────────────────────────────────────────
async function loadTimeout() {
  try {
    const r = await api('/api/chat-timeout', { headers: {} });
    const d = await r.json();
    document.getElementById('chat-timeout-input').value = d.timeout;
  } catch(e) { /* ignore */ }
}

async function saveTimeout() {
  const fb = document.getElementById('timeout-feedback');
  const btn = document.getElementById('save-timeout-btn');
  const val = parseInt(document.getElementById('chat-timeout-input').value) || 180;
  try {
    btn.disabled = true;
    const r = await api('/api/chat-timeout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: val })
    });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'feedback err'; btn.disabled = false; return; }
    const d = await r.json();
    fb.textContent = '✓ Timeout saved: ' + d.timeout + 's';
    fb.className = 'feedback ok';
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
  btn.disabled = false;
}

// ── Token Warning Threshold ────────────────────────────────────────
async function loadWarning() {
  try {
    const r = await api('/api/token-warning-threshold', { headers: {} });
    const d = await r.json();
    document.getElementById('token-warning-input').value = d.threshold;
  } catch(e) { /* ignore */ }
}

async function saveWarning() {
  const fb = document.getElementById('warning-feedback');
  const btn = document.getElementById('save-warning-btn');
  const val = parseInt(document.getElementById('token-warning-input').value) || 5000;
  try {
    btn.disabled = true;
    const r = await api('/api/token-warning-threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: val })
    });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'feedback err'; btn.disabled = false; return; }
    const d = await r.json();
    fb.textContent = '✓ Threshold saved: ' + d.threshold.toLocaleString() + ' tokens';
    fb.className = 'feedback ok';
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
  btn.disabled = false;
}

// ── Active Model Status ────────────────────────────────────────────
async function loadActiveModelStatus() {
  try {
    const r = await api('/api/active-model', { headers: {} });
    const d = await r.json();
    const el = document.getElementById('home-model');
    if (el) el.textContent = d.active_model;
  } catch(e) { /* ignore */ }
}

// ── Context Window ─────────────────────────────────────────────────
async function loadContextWindow(targetId) {
  try {
    const r = await api(`/api/memory/context-window?limit=${cwLimit}&max_tokens=${configMaxTokens}`, { headers: {} });
    const d = await r.json();
    const pct = d.pct_messages || 0;
    const status = d.status || 'ok';
    const tag = document.getElementById('cw-tag');
    if (tag) { tag.textContent = status.toUpperCase(); tag.className = `tag ${status}`; }
    document.getElementById(targetId).innerHTML = `
      <div class="cw-meta">
        Messages in context: <strong>${d.messages_used ?? 0}</strong> / ${d.messages_limit ?? '?'}
        &nbsp;·&nbsp; ~<strong>${d.tokens_estimate ?? 0}</strong> tokens used
        &nbsp;·&nbsp; <strong>${pct}%</strong> of message limit
        &nbsp;·&nbsp; <strong>${d.pct_tokens ?? 0}%</strong> of ${(configMaxTokens/1000).toFixed(0)}k token cap
      </div>
      <div class="bar-wrap"><div class="bar ${status}" style="width:${Math.min(pct,100)}%"></div></div>
      <div class="bar-label"><span>0%</span><span>60% warn</span><span>80% critical</span><span>100%</span></div>
    `;
  } catch(e) { console.error('Context window error:', e); }
}

// ── Memory Config ──────────────────────────────────────────────────
async function loadMemoryConfig() {
  try {
    const r = await api('/api/memory/limit', { headers: {} });
    const d = await r.json();
    cwLimit = d.memory_limit;
    configMaxTokens = d.max_tokens;
    document.getElementById('cw-slider').value = cwLimit;
    document.getElementById('cw-slider-val').textContent = cwLimit;
    document.getElementById('max-tokens-input').value = configMaxTokens;
    document.getElementById('strategy-select').value = d.memory_strategy;
    if (d.summarizer_url) document.getElementById('summarizer-url').value = d.summarizer_url;
    if (d.summarizer_model) document.getElementById('summarizer-model').value = d.summarizer_model;
    onStrategyChange(d.memory_strategy);
    loadContextWindow('cw-memory');
  } catch(e) { console.error('Memory config load error:', e); }
}

function onStrategyChange(val) {
  document.getElementById('summarizer-fields').style.display = val === 'summarize' ? 'block' : 'none';
  document.getElementById('apply-btn').disabled = !document.getElementById('apply-toggle').checked;
}

function updateSlider(val) {
  cwLimit = parseInt(val);
  document.getElementById('cw-slider-val').textContent = val;
  document.getElementById('apply-btn').disabled = !document.getElementById('apply-toggle').checked;
  loadContextWindow('cw-memory');
}

function bindEvent(id, eventName, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(eventName, handler);
}

function setActiveButton(groupId, dataName, value) {
  document.querySelectorAll(`#${groupId} button`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset[dataName] === value);
  });
}

function bindChartControls() {
  document.querySelectorAll('#chart-period button').forEach(btn => {
    btn.addEventListener('click', function() {
      chartPeriod = this.dataset.period || 'day';
      setActiveButton('chart-period', 'period', chartPeriod);
      loadUsageChart();
    });
  });
  document.querySelectorAll('#chart-metric button').forEach(btn => {
    btn.addEventListener('click', function() {
      chartMetric = this.dataset.metric || 'cost';
      setActiveButton('chart-metric', 'metric', chartMetric);
      renderChart(lastUsageSeries);
    });
  });
}

function bindDashboardEvents() {
  bindEvent('login-form', 'submit', login);
  [
    ['nav-home', 'home'],
    ['nav-chat', 'chat'],
    ['nav-skills', 'skills'],
    ['nav-memory', 'memory'],
    ['nav-security', 'security'],
    ['nav-settings', 'settings'],
    ['nav-logs', 'logs']
  ].forEach(([id, page]) => bindEvent(id, 'click', function() { showPage(page, this); }));
  bindEvent('theme-btn', 'click', toggleTheme);
  bindEvent('refresh-health-btn', 'click', loadHealth);
  bindEvent('configure-rates-link', 'click', (event) => { event.preventDefault(); document.getElementById('nav-settings').click(); });
  bindEvent('refresh-system-btn', 'click', loadSystem);
  bindEvent('chat-input', 'keydown', (event) => { if (event.key === 'Enter') sendChat(); });
  bindEvent('mic-btn', 'click', toggleMic);
  bindEvent('live-btn', 'click', toggleLiveMode);
  bindEvent('chat-send-btn', 'click', sendChat);
  bindEvent('refresh-context-btn', 'click', () => loadContextWindow('cw-memory'));
  bindEvent('cw-slider', 'input', function() { updateSlider(this.value); });
  bindEvent('strategy-select', 'change', function() { onStrategyChange(this.value); });
  bindEvent('apply-btn', 'click', applyLimit);
  bindEvent('prune-btn', 'click', pruneNow);
  bindEvent('refresh-memory-btn', 'click', loadMemory);
  bindEvent('mem-search', 'input', filterMessages);
  bindEvent('export-chat-btn', 'click', exportChat);
  bindEvent('kill-btn', 'click', toggleKill);
  bindEvent('save-rates-btn', 'click', saveRates);
  bindEvent('save-timeout-btn', 'click', saveTimeout);
  bindEvent('save-warning-btn', 'click', saveWarning);
  bindEvent('stt-model-select', 'change', function() { updateSttWarning(this.value); });
  bindEvent('save-stt-model-btn', 'click', saveSttModel);
  bindEvent('save-tts-voice-btn', 'click', saveTtsVoice);
  bindEvent('refresh-logs-btn', 'click', loadLogs);
  bindChartControls();
  document.getElementById('apply-toggle').addEventListener('change', function() {
    document.getElementById('apply-btn').disabled = !this.checked;
    const fb = document.getElementById('limit-feedback');
    fb.textContent = this.checked ? 'Apply mode active - changes will be saved to agent config.' : '';
    fb.className = 'feedback ok';
  });
}

document.addEventListener('DOMContentLoaded', bindDashboardEvents);

async function applyLimit() {
  const limit = parseInt(document.getElementById('cw-slider').value);
  const maxTokens = parseInt(document.getElementById('max-tokens-input').value);
  const strategy = document.getElementById('strategy-select').value;
  const summUrl = document.getElementById('summarizer-url').value;
  const summModel = document.getElementById('summarizer-model').value;
  const fb = document.getElementById('limit-feedback');
  try {
    const r = await api('/api/memory/limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory_limit: limit, max_tokens: maxTokens, memory_strategy: strategy, summarizer_url: summUrl, summarizer_model: summModel })
    });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'feedback err'; return; }
    const d = await r.json();
    configMaxTokens = d.max_tokens;
    const strategyLabel = strategy === 'summarize' ? `summarize (${summModel})` : strategy;
    fb.textContent = `✓ Saved — limit: ${d.memory_limit} msgs · ${(d.max_tokens/1000).toFixed(0)}k tokens · strategy: ${strategyLabel}`;
    fb.className = 'feedback ok';
    loadContextWindow('cw-memory');
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
}

async function pruneNow() {
  const fb = document.getElementById('limit-feedback');
  const btn = document.getElementById('prune-btn');
  btn.disabled = true;
  btn.textContent = 'Pruning...';
  try {
    const r = await api('/api/memory/prune', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'feedback err'; btn.disabled = false; btn.textContent = '✂ Prune Now'; return; }
    const d = await r.json();
    fb.textContent = d.pruned > 0 ? `✓ Pruned ${d.pruned} messages. Limit: ${d.limit}.` : `✓ Nothing to prune — already within limit of ${d.limit}.`;
    fb.className = 'feedback ok';
    loadMemory();
    loadContextWindow('cw-memory');
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
  btn.disabled = false;
  btn.textContent = '✂ Prune Now';
}

// ── Conversation History ───────────────────────────────────────────
async function loadMemory() {
  try {
    const r = await api('/api/memory/recent?limit=30', { headers: {} });
    const d = await r.json();
    allMessages = d.messages || [];
    renderMessages(allMessages);
  } catch(e) {
    document.getElementById('msg-list').innerHTML = '<p style="color:var(--red);font-size:0.85rem">Error loading memory.</p>';
  }
}

function renderMessages(msgs) {
  const el = document.getElementById('msg-list');
  if (!msgs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:0.85rem">No conversations stored yet.</p>'; return; }
  el.innerHTML = msgs.map(m => {
    const isSummary = m.role === 'system' && m.content.startsWith('[SUMMARY]');
    const content = isSummary ? m.content.replace('[SUMMARY]', '').trim() : m.content;
    const roleLabel = isSummary ? '<span class="summary-badge">SUMMARY</span>' : m.role;
    const rendered = typeof marked !== 'undefined' ? marked.parse(content) : escapeHtml(content).replace(/\n/g, '<br>');
    const safeContent = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rendered) : escapeHtml(content).replace(/\n/g, '<br>');
    return `<div class="msg ${m.role}${isSummary ? ' summary' : ''}">
      <div class="msg-role">${roleLabel} &middot; ${m.timestamp ? m.timestamp.slice(0,16).replace('T',' ') : 'unknown'}</div>
      ${safeContent}
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function filterMessages() {
  const q = document.getElementById('mem-search').value.toLowerCase();
  renderMessages(q ? allMessages.filter(m => m.content.toLowerCase().includes(q)) : allMessages);
}

async function exportChat() {
  const fb = document.getElementById('export-feedback');
  try {
    const r = await api('/api/chat/export', { headers: {} });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'feedback err'; return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'korvin-chat-history-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    fb.textContent = '✓ Download started.';
    fb.className = 'feedback ok';
  } catch(e) {
    fb.textContent = 'Error: ' + e.message;
    fb.className = 'feedback err';
  }
}

// ── Logs ───────────────────────────────────────────────────────────
async function loadLogs() {
  const box = document.getElementById('log-box');
  box.textContent = 'Loading...';
  try {
    const r = await api('/api/logs?lines=100', { headers: {} });
    if (r.status === 403) { box.textContent = 'Auth error — key mismatch.'; return; }
    const d = await r.json();
    if (!d.lines || !d.lines.length) { box.textContent = 'No log entries found.'; return; }
    box.innerHTML = d.lines.map(line => {
      const cls = line.includes('ERROR') ? 'error' : line.includes('WARNING') ? 'warn' : 'info';
      return `<span class="log-line ${cls}">${escapeHtml(line)}</span>`;
    }).join('\n');
    box.scrollTop = box.scrollHeight;
  } catch(e) { box.textContent = 'Failed to load logs: ' + e.message; }
}

async function loadSkills() {
  const box = document.getElementById('skills-list');
  if (!box) return;
  try {
    const r = await api('/api/skills');
    const d = await r.json();
    const skills = d.skills || [];
    const count = document.getElementById('skills-count');
    if (count) count.textContent = String(skills.length);
    if (!skills.length) {
      box.textContent = 'No skills installed.';
      return;
    }
    box.replaceChildren(...skills.map(renderSkillRow));
  } catch(e) {
    box.textContent = 'Could not load skills.';
  }
}

function renderSkillRow(skill) {
  const row = document.createElement('div');
  row.className = 'skill-row';

  const info = document.createElement('div');
  info.className = 'skill-info';
  const name = document.createElement('span');
  name.className = 'skill-name';
  name.textContent = skill.label || skill.id;
  info.appendChild(name);
  if (skill.permission) {
    const perm = document.createElement('span');
    perm.className = 'skill-perm';
    perm.textContent = skill.permission;
    info.appendChild(perm);
  }

  const toggle = document.createElement('label');
  toggle.className = 'toggle-switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = skill.enabled === true;
  input.addEventListener('change', () => toggleSkill(skill.id, input));
  const slider = document.createElement('span');
  slider.className = 'toggle-slider';
  toggle.appendChild(input);
  toggle.appendChild(slider);

  row.appendChild(info);
  row.appendChild(toggle);
  return row;
}

async function toggleSkill(id, input) {
  const desired = input.checked;
  input.disabled = true;
  try {
    const r = await api(`/api/skills/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: desired })
    });
    if (!r.ok) throw new Error('toggle failed');
    const d = await r.json();
    input.checked = d.enabled === true;
  } catch(e) {
    input.checked = !desired;
  } finally {
    input.disabled = false;
  }
}

async function loadSecuritySummary() {
  try {
    const r = await api('/api/security/summary');
    const d = await r.json();
    const status = document.getElementById('defender-status');
    if (status) status.textContent = 'Injection defender: ' + (d.defender || 'unknown');
    const threatBox = document.getElementById('recent-threats');
    if (threatBox) {
      const threats = d.recent_threats || [];
      if (!threats.length) {
        threatBox.textContent = 'No blocked injection attempts recorded.';
      } else {
        threatBox.replaceChildren(...threats.map((line) => {
          const item = document.createElement('div');
          item.className = 'threat-item';
          item.textContent = line;
          return item;
        }));
      }
    }
    const count = document.getElementById('blocked-count');
    if (count) count.textContent = String(d.blocked_count || 0);
  } catch(e) { /* keep static text */ }
}

// ── Kill Switch ────────────────────────────────────────────────────
async function loadKillswitch() {
  try {
    const r = await api('/api/killswitch', { headers: {} });
    const d = await r.json();
    killActive = d.killswitch;
    renderKillswitch();
  } catch(e) { console.error('Killswitch load error:', e); }
}

function renderKillswitch() {
  const btn = document.getElementById('kill-btn');
  const status = document.getElementById('kill-status');
  if (killActive) {
    btn.textContent = '🔴 Read-Only Mode ON — Click to Disable';
    btn.style.background = '#388bfd';
    status.textContent = 'Agent is locked to read-only. No write actions will execute.';
    status.style.color = '#388bfd';
  } else {
    btn.textContent = '🟢 Read-Only Mode OFF — Click to Enable';
    btn.style.background = '#da3633';
    status.textContent = 'Agent is running normally.';
    status.style.color = '#2ea043';
  }
}

async function toggleKill() {
  try {
    const r = await api('/api/killswitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !killActive })
    });
    if (r.status === 403) { document.getElementById('kill-status').textContent = 'Auth error.'; return; }
    const d = await r.json();
    killActive = d.killswitch;
    renderKillswitch();
  } catch(e) { document.getElementById('kill-status').textContent = 'Error: ' + e.message; }
}

// ── Model Switcher ─────────────────────────────────────────────────
async function loadModels() {
  try {
    const r = await api('/api/models', { headers: {} });
    const d = await r.json();
    modelList = d.models;
    renderModelButtons(d.models, d.active);
  } catch(e) {
    document.getElementById('active-model-badge').textContent = 'Error';
  }
}

function renderModelButtons(models, activeSlug) {
  const container = document.getElementById('model-switcher');
  container.innerHTML = '';
  models.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'model-btn';
    btn.textContent = m.label;
    btn.onclick = () => switchModel(m.slug, btn);
    if (m.slug === activeSlug) btn.classList.add('active-model');
    container.appendChild(btn);
  });
  const label = models.find(m => m.slug === activeSlug);
  document.getElementById('active-model-badge').textContent = '● ' + (label ? label.label : activeSlug);
}

async function switchModel(slug, btn) {
  const fb = document.getElementById('switch-feedback');
  const buttons = document.querySelectorAll('.model-btn');
  const label = modelList.find(m => m.slug === slug);
  const name = label ? label.label : slug;
  if (!confirm(`Switch to ${name}?`)) return;
  buttons.forEach(b => b.disabled = true);
  fb.textContent = `⏳ Switching to ${name}…`;
  fb.className = 'switch-feedback loading';
  try {
    const r = await api('/api/switch-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: slug })
    });
    if (r.status === 403) { fb.textContent = 'Auth error.'; fb.className = 'switch-feedback err'; buttons.forEach(b => b.disabled = false); return; }
    if (!r.ok) {
      const d = await r.json();
      fb.textContent = '❌ ' + (d.detail || 'Switch failed');
      fb.className = 'switch-feedback err';
      buttons.forEach(b => b.disabled = false);
      return;
    }
    const d = await r.json();
    renderModelButtons(modelList, d.active_model);
    fb.textContent = `✅ Switched to ${name} at ${new Date(d.switched_at).toLocaleTimeString()}`;
    fb.className = 'switch-feedback ok';
  } catch(e) {
    fb.textContent = '❌ Error: ' + e.message;
    fb.className = 'switch-feedback err';
  }
  buttons.forEach(b => b.disabled = false);
}

// ── Chat ───────────────────────────────────────────────────────────
async function loadChatHistory() {
  if (chatIsLoading) return;
  const container = document.getElementById('chat-messages');
  try {
    const r = await api('/api/chat/history?limit=50', { headers: {} });
    if (r.status === 403) return;
    const d = await r.json();
    if (d.messages && d.messages.length > 0) {
      const wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
      container.innerHTML = '';
      d.messages.forEach(m => appendChatMessage(m.role, m.content, m.source, m.timestamp));
      if (wasAtBottom) container.scrollTop = container.scrollHeight;
    }
  } catch(e) { /* ignore */ }
}

async function sendChat() {
  chatIsLoading = true;
  const container = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-send-btn');
  const msg = input.value.trim();
  if (!msg) { chatIsLoading = false; return; }
  input.value = '';
  btn.disabled = true;
  appendChatMessage('user', msg, 'dashboard');
  container.scrollTop = container.scrollHeight;
  try {
    const r = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const d = await r.json();
    if (d.reply) {
      appendChatMessage('assistant', d.reply, 'dashboard');
      container.scrollTop = container.scrollHeight;
    } else {
      appendChatMessage('system', d.detail || 'No response from Korvin.');
    }
  } catch(e) {
    appendChatMessage('system', 'Error: ' + e.message);
  }
  chatIsLoading = false;
  btn.disabled = false;
}

function appendChatMessage(role, content, source = null, timestamp = null) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const roleLabels = { user: 'YOU', assistant: 'KORVIN', system: 'SYSTEM' };
  const sourceEmoji = source === 'dashboard' ? ' 💻' : source === 'telegram' ? ' 📱' : '';
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `<div class="msg-role">${roleLabels[role] || role.toUpperCase()}${sourceEmoji} · ${timeStr}</div>${escapeHtml(content)}`;
  container.appendChild(div);
  const placeholder = container.querySelector('div[style]');
  if (placeholder) placeholder.remove();
}

// ── Utilities ──────────────────────────────────────────────────────
function escapeHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Boot ───────────────────────────────────────────────────────────
function bootDashboard() {
  if (dashboardBooted) return;
  dashboardBooted = true;
  loadSystem();
  loadActiveModelStatus();
  loadHealth();
  loadChannelStatus();
  loadUsageChart();
  loadContextWindow('cw-home');
  loadVoiceStatus();
  autoRefreshTimer = setInterval(() => { loadSystem(); loadHealth(); loadUsageChart(); loadContextWindow('cw-home'); }, 10000);
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/static/sw.js'); }
}

async function startDashboard() {
  try {
    const response = await api('/api/status');
    if (response.ok) {
      hideLock();
      bootDashboard();
    } else {
      showLock();
    }
  } catch (_) {
    showLock();
  }
}

startDashboard();
