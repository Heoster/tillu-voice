// /api/health.js — Deployment diagnostic endpoint
// Shows which env vars are present (never exposes values)
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const check = (key, minLen = 10) => {
    const v = process.env[key];
    if (!v)                          return '❌ missing';
    if (v.includes('xxxxx'))         return '❌ placeholder';
    if (v.length < minLen)           return '❌ too short';
    return `✅ set (${v.length} chars, starts: ${v.slice(0, 6)}…)`;
  };

  res.status(200).json({
    ok: true,
    runtime: process.version,
    env: process.env.VERCEL_ENV || 'local',
    keys: {
      CARTESIA_API_KEY:   check('CARTESIA_API_KEY'),
      ELEVENLABS_API_KEY: check('ELEVENLABS_API_KEY'),
      GROQ_API_KEY:       check('GROQ_API_KEY'),
      SARVAM_API_KEY:     check('SARVAM_API_KEY'),
    },
  });
}
