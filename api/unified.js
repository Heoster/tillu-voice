// /api/unified.js — STT → Translate → TTS Pipeline
// Takes audio, transcribes it, translates it, and returns both text and audio.

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60000; // Longer timeout for full pipeline

export default async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    audio,
    sourceLang = 'hi',
    targetLang = 'en',
    contentType = 'audio/webm',
  } = req.body || {};

  if (!audio) return res.status(400).json({ error: '`audio` (base64) is required' });

  const APP_URL = process.env.APP_URL || `http://${req.headers.host}`;

  try {
    // 1. Transcribe & Translate via /api/translate
    // We call our own API to keep logic DRY. 
    // In production, we'd prefer internal function calls, but on Vercel,
    // calling the sibling endpoint via fetch is a simple way to orchestrate.
    const transRes = await fetch(`${APP_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio, sourceLang, targetLang, contentType }),
    });

    if (!transRes.ok) {
      const err = await transRes.json();
      throw new Error(err.error || 'Translation step failed');
    }

    const transData = await transRes.json();
    const translatedText = transData.translatedText;

    // 2. Synthesize via /api/speak
    const speakRes = await fetch(`${APP_URL}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: translatedText, lang: targetLang }),
    });

    if (!speakRes.ok) {
      const err = await speakRes.json();
      throw new Error(err.error || 'Synthesis step failed');
    }

    const audioBuffer = await speakRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    res.status(200).json({
      success: true,
      input: transData.originalText,
      output: translatedText,
      sourceLang,
      targetLang,
      audio: audioBase64,
      contentType: speakRes.headers.get('Content-Type') || 'audio/mpeg',
      provider: {
        stt: transData.sttProvider,
        translate: transData.translateProvider,
        tts: speakRes.headers.get('X-Provider'),
      }
    });

  } catch (err) {
    console.error('[unified] Pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
