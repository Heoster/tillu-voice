// /api/speak.js — TTS  Sarvam → Cartesia sonic-3.5 → ElevenLabs
// Production-hardened: input validation, timeouts, structured errors, CORS

const MAX_TEXT_LENGTH = 4000; // chars — safe for all providers
const FETCH_TIMEOUT_MS = 15000;

export default async function handler(req, res) {
  // ── CORS preflight ────────────────────────────────────────────────────────
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ── Parse input ───────────────────────────────────────────────────────────
  let text, lang;

  if (req.method === 'GET') {
    text = (req.query?.text || '').trim();
    lang = (req.query?.lang || 'hi').trim();
  } else if (req.method === 'POST') {
    text = (req.body?.text || '').trim();
    lang = (req.body?.lang || 'hi').trim();
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!text) {
    return res.status(400).json({ error: '`text` is required' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({
      error: `Text too long. Maximum ${MAX_TEXT_LENGTH} characters, got ${text.length}.`,
    });
  }
  if (!/^[a-z]{2}$/.test(lang)) {
    lang = 'hi'; // sanitise — fall back to Hindi
  }

  const SARVAM_KEY   = process.env.SARVAM_API_KEY;
  const CARTESIA_KEY = process.env.CARTESIA_API_KEY;
  const ELEVEN_KEY   = process.env.ELEVENLABS_API_KEY;

  const errors = []; // collect provider errors for the final 503

  // ── 1. Sarvam AI — best for all 14 Indian languages ──────────────────────
  if (isKey(SARVAM_KEY)) {
    try {
      const sarvamLang = toSarvamLang(lang);
      const r = await fetchWithTimeout('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': SARVAM_KEY,
        },
        body: JSON.stringify({
          inputs: [text],
          target_language_code: sarvamLang,
          speaker: getSarvamSpeaker(sarvamLang),
          pitch: 0,
          pace: 0.85,
          loudness: 1.5,
          speech_sample_rate: 22050,
          enable_preprocessing: true,
          model: 'bulbul:v1',
        }),
      });

      if (r.ok) {
        const data = await r.json();
        if (data.audios?.[0]) {
          const buf = Buffer.from(data.audios[0], 'base64');
          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('X-Provider', 'sarvam');
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).send(buf);
        }
        errors.push('sarvam: empty audio response');
      } else {
        const msg = await safeText(r);
        errors.push(`sarvam: ${r.status} ${msg}`);
        console.error('[speak] Sarvam failed:', r.status, msg);
      }
    } catch (e) {
      errors.push(`sarvam: ${e.message}`);
      console.error('[speak] Sarvam error:', e.message);
    }
  }

  // ── 2. Cartesia sonic-3.5 — multilingual incl. Hindi ─────────────────────
  if (isKey(CARTESIA_KEY)) {
    try {
      const r = await fetchWithTimeout('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CARTESIA_KEY,
          'Cartesia-Version': '2026-03-01',
        },
        body: JSON.stringify({
          model_id: 'sonic-3.5',
          transcript: text,
          voice: {
            mode: 'id',
            id: '2904ccd0-3707-45dc-9c18-0c2dd4b8481d',
          },
          output_format: {
            container: 'wav',
            encoding: 'pcm_s16le',
            sample_rate: 44100,
          },
          language: toCartesiaLang(lang),
          generation_config: { speed: 0.8, volume: 1 },
        }),
      });

      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('X-Provider', 'cartesia');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(buf);
      } else {
        const msg = await safeText(r);
        errors.push(`cartesia: ${r.status} ${msg}`);
        console.error('[speak] Cartesia failed:', r.status, msg);
      }
    } catch (e) {
      errors.push(`cartesia: ${e.message}`);
      console.error('[speak] Cartesia error:', e.message);
    }
  }

  // ── 3. ElevenLabs — multilingual fallback ────────────────────────────────
  if (isKey(ELEVEN_KEY)) {
    try {
      // Use the user's own first voice (always available on any plan)
      // GET /v1/voices returns the account's voices; first one is always accessible
      let voiceId = 'cgSgspJ2msm6clMCkdW9'; // "Jessica" — free tier default
      try {
        const vr = await fetchWithTimeout('https://api.elevenlabs.io/v1/voices', {
          method: 'GET',
          headers: { 'xi-api-key': ELEVEN_KEY },
        });
        if (vr.ok) {
          const vdata = await vr.json();
          if (vdata.voices?.length > 0) voiceId = vdata.voices[0].voice_id;
        }
      } catch { /* use default voiceId */ }

      const r = await fetchWithTimeout(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': ELEVEN_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.85 },
          }),
        }
      );

      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Provider', 'elevenlabs');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(buf);
      } else {
        const msg = await safeText(r);
        errors.push(`elevenlabs: ${r.status} ${msg}`);
        console.error('[speak] ElevenLabs failed:', r.status, msg);
      }
    } catch (e) {
      errors.push(`elevenlabs: ${e.message}`);
      console.error('[speak] ElevenLabs error:', e.message);
    }
  }

  // ── All providers failed ──────────────────────────────────────────────────
  return res.status(503).json({
    error: 'All TTS providers failed.',
    details: errors,
    hint: 'Set SARVAM_API_KEY, CARTESIA_API_KEY, or ELEVENLABS_API_KEY in your environment.',
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true only for a non-empty, non-placeholder key */
function isKey(k) {
  return typeof k === 'string' && k.length > 10 && !k.includes('xxxxx');
}

/** fetch() with an AbortController timeout */
async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Safely read response text without throwing */
async function safeText(r) {
  try { return await r.text(); } catch { return '(unreadable)'; }
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

function getSarvamSpeaker(langCode) {
  // Sarvam bulbul:v2 available speakers (meera removed)
  const map = {
    'hi-IN': 'anushka', 'bn-IN': 'anushka', 'ta-IN': 'anushka',
    'te-IN': 'anushka', 'ml-IN': 'anushka', 'kn-IN': 'anushka',
    'gu-IN': 'anushka', 'mr-IN': 'anushka', 'pa-IN': 'anushka',
    'od-IN': 'anushka', 'ur-IN': 'anushka', 'as-IN': 'anushka',
    'ne-NP': 'anushka', 'en-IN': 'anushka',
  };
  return map[langCode] || 'anushka';
}

function toCartesiaLang(code) {
  // sonic-3.5 natively supports these codes
  const supported = new Set([
    'en', 'hi', 'fr', 'de', 'es', 'pt', 'zh', 'ja',
    'ko', 'nl', 'pl', 'ru', 'sv', 'tr', 'it',
  ]);
  // Indian languages not in sonic-3.5 → use Hindi
  return supported.has(code) ? code : 'hi';
}
