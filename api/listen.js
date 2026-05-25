// /api/listen.js — STT  Groq Whisper → Sarvam
// Production-hardened: size limits, timeouts, structured errors, CORS

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB — Groq's hard limit
const FETCH_TIMEOUT_MS = 30000;            // STT can be slow on long audio

export default async function handler(req, res) {
  // ── CORS preflight ────────────────────────────────────────────────────────
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Parse & validate input ────────────────────────────────────────────────
  const { audio, lang = 'hi', contentType = 'audio/webm' } = req.body || {};

  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: '`audio` (base64 string) is required' });
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audio, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 in `audio`' });
  }

  if (audioBuffer.length === 0) {
    return res.status(400).json({ error: 'Audio data is empty' });
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return res.status(413).json({
      error: `Audio too large. Maximum ${MAX_AUDIO_BYTES / 1024 / 1024} MB.`,
    });
  }

  const safeLang = /^[a-z]{2}$/.test(lang) ? lang : 'hi';
  const safeContentType = ALLOWED_CONTENT_TYPES.has(contentType)
    ? contentType
    : 'audio/webm';

  const GROQ_KEY   = process.env.GROQ_API_KEY;
  const SARVAM_KEY = process.env.SARVAM_API_KEY;

  const errors = [];

  // ── 1. Groq Whisper-large-v3 — fast, free, multilingual ──────────────────
  if (isKey(GROQ_KEY)) {
    try {
      const ext = contentTypeToExt(safeContentType);
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: safeContentType }), `audio.${ext}`);
      form.append('model', 'whisper-large-v3');
      form.append('language', toWhisperLang(safeLang));
      form.append('response_format', 'json');

      const r = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        { method: 'POST', headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: form }
      );

      if (r.ok) {
        const data = await r.json();
        if (data.text?.trim()) {
          return res.status(200).json({
            success: true,
            text: data.text.trim(),
            provider: 'groq-whisper',
            lang: safeLang,
          });
        }
        errors.push('groq: empty transcript');
      } else {
        const msg = await safeText(r);
        errors.push(`groq: ${r.status} ${msg}`);
        console.error('[listen] Groq failed:', r.status, msg);
      }
    } catch (e) {
      errors.push(`groq: ${e.message}`);
      console.error('[listen] Groq error:', e.message);
    }
  }

  // ── 2. Sarvam saarika:v2 — Indian language specialist ────────────────────
  if (isKey(SARVAM_KEY)) {
    try {
      const ext = contentTypeToExt(safeContentType);
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: safeContentType }), `audio.${ext}`);
      form.append('model', 'saarika:v2.5');
      form.append('language_code', toSarvamLang(safeLang));

      const r = await fetchWithTimeout('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': SARVAM_KEY },
        body: form,
      });

      if (r.ok) {
        const data = await r.json();
        if (data.transcript?.trim()) {
          return res.status(200).json({
            success: true,
            text: data.transcript.trim(),
            provider: 'sarvam',
            lang: safeLang,
          });
        }
        errors.push('sarvam: empty transcript');
      } else {
        const msg = await safeText(r);
        errors.push(`sarvam: ${r.status} ${msg}`);
        console.error('[listen] Sarvam failed:', r.status, msg);
      }
    } catch (e) {
      errors.push(`sarvam: ${e.message}`);
      console.error('[listen] Sarvam error:', e.message);
    }
  }

  // ── All providers failed ──────────────────────────────────────────────────
  return res.status(503).json({
    success: false,
    error: 'All STT providers failed.',
    details: errors,
    hint: 'Set GROQ_API_KEY or SARVAM_API_KEY in your environment.',
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isKey(k) {
  return typeof k === 'string' && k.length > 10 && !k.includes('xxxxx');
}

async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(r) {
  try { return await r.text(); } catch { return '(unreadable)'; }
}

const ALLOWED_CONTENT_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
  'audio/wav', 'audio/flac', 'audio/x-m4a', 'audio/aac',
]);

function contentTypeToExt(ct) {
  const map = {
    'audio/webm': 'webm', 'audio/ogg': 'ogg',  'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',  'audio/wav': 'wav',   'audio/flac': 'flac',
    'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  };
  return map[ct] || 'webm';
}

function toWhisperLang(code) {
  const map = {
    hi: 'hi', bn: 'bn', ta: 'ta', te: 'te', ml: 'ml',
    kn: 'kn', gu: 'gu', mr: 'mr', pa: 'pa', or: 'or',
    ur: 'ur', as: 'as', ne: 'ne', sa: 'sa', en: 'en',
  };
  return map[code] || 'hi';
}

function toSarvamLang(code) {
  const map = {
    hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN',
    ml: 'ml-IN', kn: 'kn-IN', gu: 'gu-IN', mr: 'mr-IN',
    pa: 'pa-IN', or: 'od-IN', ur: 'ur-IN', as: 'as-IN',
    ne: 'ne-NP', sa: 'hi-IN', en: 'en-IN',
  };
  return map[code] || 'hi-IN';
}
