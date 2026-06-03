'use strict';
// YouTube transcription via yt-dlp + Whisper subprocess

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;

function validateYoutubeUrl(url) {
  return YT_URL_RE.test(url);
}

function runExecFile(cmd, args, options) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

async function transcribeYoutube(url) {
  if (!validateYoutubeUrl(url)) {
    return 'Invalid YouTube URL. Must match: https://(www.)?(youtube.com|youtu.be)/...';
  }

  // Download audio with yt-dlp
  let audioPath = null;
  try {
    await runExecFile(
      'yt-dlp',
      [
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '5',
        '--output', '/tmp/korvin_yt_%(id)s.%(ext)s',
        '--no-playlist',
        '--print', 'filename',
        '--print-to-file', '/tmp/korvin_yt_path.txt',
        url,
      ],
      { timeout: 60000 }
    );
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('enoent') || msg.includes('not found') || msg.includes('no such file')) {
      return 'YouTube transcription requires yt-dlp and Whisper. Install with: pip install yt-dlp openai-whisper';
    }
    return `yt-dlp failed: ${err.message}`;
  }

  // Resolve the output file path by querying yt-dlp for the filename
  let resolvedPath = null;
  try {
    const { stdout } = await runExecFile(
      'yt-dlp',
      [
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '5',
        '--output', '/tmp/korvin_yt_%(id)s.%(ext)s',
        '--no-playlist',
        '--get-filename',
        url,
      ],
      { timeout: 15000 }
    );
    resolvedPath = stdout.split('\n')[0].trim();
  } catch (_) {
    // fallback: scan /tmp for the file
  }

  // Fallback: find the file in /tmp matching our prefix
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    try {
      const files = fs.readdirSync('/tmp').filter(f => f.startsWith('korvin_yt_') && f.endsWith('.mp3'));
      if (files.length > 0) {
        files.sort((a, b) => {
          const sa = fs.statSync(path.join('/tmp', a));
          const sb = fs.statSync(path.join('/tmp', b));
          return sb.mtimeMs - sa.mtimeMs;
        });
        resolvedPath = path.join('/tmp', files[0]);
      }
    } catch (_) {}
  }

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return 'yt-dlp ran but audio file could not be located in /tmp.';
  }

  audioPath = resolvedPath;

  // Transcribe with Whisper
  let transcript = '';
  try {
    const { stdout } = await runExecFile(
      'venv/bin/python3',
      [
        '-c',
        `import sys, whisper; m=whisper.load_model('tiny.en'); r=m.transcribe(sys.argv[1]); print(r['text'])`,
        audioPath,
      ],
      { timeout: 120000, cwd: ROOT }
    );
    transcript = stdout;
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('enoent') || msg.includes('not found') || msg.includes('no such file')) {
      return 'YouTube transcription requires yt-dlp and Whisper. Install with: pip install yt-dlp openai-whisper';
    }
    if (msg.includes('no module named')) {
      return 'YouTube transcription requires yt-dlp and Whisper. Install with: pip install yt-dlp openai-whisper';
    }
    return `Whisper transcription failed: ${err.message}`;
  } finally {
    // Clean up temp file
    if (audioPath) {
      try { fs.unlinkSync(audioPath); } catch (_) {}
    }
  }

  return transcript || '(no transcript returned)';
}

module.exports = { transcribeYoutube };
