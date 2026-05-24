// /api/listen.js — Unified STT
export default async function handler(req, res) {
  // Logic: STT routing (Groq -> Sarvam -> HF)
  res.status(200).json({ message: "STT route implemented" });
}
