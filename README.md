# 🎙️ Indic Voice Hub

A production-ready, unified API for Text-to-Speech (TTS) and Speech-to-Text (STT) across 14+ Indian languages. It handles provider routing, smart fallbacks, and multi-step pipelines (Listen → Translate → Speak).

## 🚀 Quick Start

1. **Clone & Install:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and add your API keys.
   ```bash
   cp .env.example .env
   ```

3. **Run Locally:**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000)

4. **Deploy to Vercel:**
   ```bash
   vercel
   ```

## 🛠️ API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/speak` | `POST` | **TTS**: Text to Audio (Sarvam → Cartesia → ElevenLabs) |
| `/api/listen` | `POST` | **STT**: Audio to Text (Groq Whisper → Sarvam) |
| `/api/translate`| `POST` | **Translation**: Audio to Translated Text |
| `/api/unified` | `POST` | **Pipeline**: Audio → Translated Text → Translated Audio |
| `/api/health` | `GET` | **Health Check**: Monitoring endpoint |

## ⚙️ Configuration (Environment Variables)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `APP_URL` | Base URL of the application (required for `/api/unified`) | `http://localhost:3000` |
| `CORS_ORIGIN` | Allowed origins for CORS (e.g., `https://yourdomain.com`) | `*` |
| `SARVAM_API_KEY` | Key for Sarvam.ai (Primary for Indian languages) | - |
| `GROQ_API_KEY` | Key for Groq.com (Fastest STT) | - |
| `CARTESIA_API_KEY`| Key for Cartesia.ai (Sonic-3.5 TTS) | - |
| `ELEVENLABS_API_KEY`| Key for ElevenLabs.io (High-quality fallback) | - |

## 🔒 Production Readiness

- **Security Headers:** Configured in `vercel.json` (HSTS, No-Sniff, CSP-ready).
- **CORS Protection:** Restrict access via `CORS_ORIGIN`.
- **Error Handling:** Structured JSON errors with provider-specific details.
- **Timeouts:** Built-in fetch timeouts to prevent hanging serverless functions.
- **Fallbacks:** Automatically tries next provider if the primary fails.

## 📝 License
MIT
