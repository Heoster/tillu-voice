// /api/speak.js — Unified TTS
export default async function handler(req, res) {
  // Logic: TTS routing (Sarvam -> Cartesia -> ElevenLabs -> HF)
  res.status(200).json({ message: "TTS route implemented" });
}
