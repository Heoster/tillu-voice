// /api/translate.js — Speech-to-Speech Translation  STT → Sarvam translate
// Production-hardened: size limits, timeouts, structured errors, CORS

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30000;

export default async function handler(req, res) {
  // ── CORS preflight ────────────────────────────────────────────────────────
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Parse & validate ──────────────────────────────────────────────────────
  const {
    audio,
    sourceLang = 'hi',
    targetLang = 'en',
    contentType = 'audio/webm',
  } = req.body || {};

  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: '`audio` (base64 string) is required' });
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audio, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 in `audio`' });
  }

  if (audioBuffer.length === 0) return res.status(400).json({ error: 'Audio data is empty' });
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: `Audio too large. Max ${MAX_AUDIO_BYTES / 1024 / 1024} MB.` });
  }

  const safeSrc = /^[a-z]{2}$/.test(sourceLang) ? sourceLang : 'hi';
  const safeTgt = /^[a-z]{2}$/.test(targetLang)  ? targetLang  : 'en';
  const safeCT  = contentType || 'audio/webm';

  const GROQ_KEY   = process.env.GROQ_API_KEY;
  const SARVAM_KEY = process.env.SARVAM_API_KEY;

  // ── Step 1: Transcribe ────────────────────────────────────────────────────
  let transcript = null;
  let sttProvider = null;

  if (isKey(GROQ_KEY)) {
    try {
      const ext = contentTypeToExt(safeCT);
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: safeCT }), `audio.${ext}`);
      form.append('model', 'whisper-large-v3');
      form.append('language', toWhisperLang(safeSrc));
      form.append('response_format', 'json');

      const r = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        { method: 'POST', headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: form }
      );

      if (r.ok) {
        const data = await r.json();
        transcript = data.text?.trim() || null;
        if (transcript) sttProvider = 'groq-whisper';
      } else {
        console.error('[translate] Groq STT failed:', r.status, await safeText(r));
      }
    } catch (e) {
      console.error('[translate] Groq STT error:', e.message);
    }
  }

  if (!transcript && isKey(SARVAM_KEY)) {
    try {
      const ext = contentTypeToExt(safeCT);
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: safeCT }), `audio.${ext}`);
      form.append('model', 'saarika:v2.5');
      form.append('language_code', toSarvamLang(safeSrc));

      const r = await fetchWithTimeout('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': SARVAM_KEY },
        body: form,
      });

      if (r.ok) {
        const data = await r.json();
        transcript = data.transcript?.trim() || null;
        if (transcript) sttProvider = 'sarvam';
      } else {
        console.error('[translate] Sarvam STT failed:', r.status, await safeText(r));
      }
    } catch (e) {
      console.error('[translate] Sarvam STT error:', e.message);
    }
  }

  if (!transcript) {
    return res.status(503).json({
      success: false,
      error: 'STT failed — could not transcribe audio.',
      hint: 'Set GROQ_API_KEY or SARVAM_API_KEY in your environment.',
    });
  }

  // ── Step 2: Translate via Sarvam ──────────────────────────────────────────
  let translatedText = transcript;
  let translateProvider = 'passthrough';

  if (safeSrc !== safeTgt && isKey(SARVAM_KEY)) {
    try {
      const r = await fetchWithTimeout('https://api.sarvam.ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': SARVAM_KEY,
        },
        body: JSON.stringify({
          input: transcript,
          source_language_code: toSarvamLang(safeSrc),
          target_language_code: toSarvamLang(safeTgt),
          model: 'mayura:v1',
          enable_preprocessing: true,
        }),
      });

      if (r.ok) {
        const data = await r.json();
        translatedText = data.translated_text?.trim() || transcript;
        translateProvider = 'sarvam';
      } else {
        console.error('[translate] Sarvam translate failed:', r.status, await safeText(r));
      }
    } catch (e) {
      console.error('[translate] Sarvam translate error:', e.message);
    }
  }

  return res.status(200).json({
    success: true,
    originalText: transcript,
    translatedText,
    sourceLang: safeSrc,
    targetLang: safeTgt,
    sttProvider,
    translateProvider,
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
