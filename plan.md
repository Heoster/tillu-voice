# 🎙️ Indic Voice Hub — Service Plan v3.0
# Status: ✅ COMPLETE — Deployed on Vercel

> The voice of TILLU. Converts Tillu's text responses into natural speech across 14 Indian languages, and converts your voice into text. The bridge between the cloud agent and your ears.

---

## Hosting

| Property | Value |
|---|---|
| **Platform** | Vercel (serverless functions) |
| **Status** | ✅ Deployed and working |
| **Base URL** | `https://tillu-voice.vercel.app` |
| **Cost** | Free tiers |

---

## Role in Ecosystem

Indic Voice Hub is called by Tillu-Flow at two points:
1. **Start of pipeline** — convert your browser microphone audio into text (STT)
2. **End of pipeline** — convert Tillu's final text answer into audio (TTS)

The audio plays directly in your browser via the Tillu-UI.

---

## Provider Chains

### TTS Chain
```
Sarvam AI bulbul:v1        ← best for all 14 Indic languages
    ↓ (on failure)
Cartesia sonic-3.5         ← native Hindi + English
    ↓ (on failure)
ElevenLabs eleven_multilingual_v2  ← highest quality fallback
```

### STT Chain
```
Groq whisper-large-v3      ← fastest, free, 30s timeout
    ↓ (on failure)
Sarvam saarika:v2.5        ← Indian language specialist
```

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| `POST/GET` | `/api/speak` | **Primary TTS.** Text → audio stream. |
| `POST/GET` | `/api/voice/speak` | Alias for `/api/speak`. |
| `POST` | `/api/listen` | **Primary STT.** Base64 audio → transcript. |
| `POST` | `/api/translate` | STT + translation in one call. |
| `GET` | `/api/health` | Provider key status check. |

---

## Primary Endpoints

### `POST /api/speak`
```json
{ "text": "नमस्ते, मैं तिल्लू हूँ", "lang": "hi" }
```
Returns: binary audio stream (WAV or MP3)
Header: `X-Provider: sarvam | cartesia | elevenlabs`

### `POST /api/listen`
```json
{ "audio": "<base64>", "lang": "hi", "contentType": "audio/webm" }
```
Returns: `{ "success": true, "text": "transcript", "provider": "groq-whisper" }`

---

## Supported Languages

`hi` Hindi · `bn` Bengali · `ta` Tamil · `te` Telugu · `ml` Malayalam · `kn` Kannada · `gu` Gujarati · `mr` Marathi · `pa` Punjabi · `or` Odia · `ur` Urdu · `as` Assamese · `ne` Nepali · `sa` Sanskrit · `en` English

---

## Terminology

| Term | Definition |
|---|---|
| **TTS** | Text-to-Speech. Text in → audio out. |
| **STT** | Speech-to-Text. Audio in → text out. |
| **Fallback Chain** | Ordered provider list. If one fails, next takes over transparently. |
| **Sarvam AI** | Indian AI company. Best for all 14 Indic languages natively. |
| **Cartesia sonic-3.5** | High-quality multilingual TTS. Native Hindi + English. |
| **Groq Whisper** | `whisper-large-v3` on Groq. Fastest STT. Free. |
| **Sarvam Mayura** | Sarvam's translation model. Used in `/api/translate`. |
| **X-Provider Header** | Response header showing which provider served the request. |
| **Base64 Audio** | Audio encoded as Base64 string for JSON transport. Max 25 MB. |

---

## Integration Map

| Caller | Endpoint | When |
|---|---|---|
| Tillu-UI | `POST /api/listen` | User finishes speaking |
| Tillu-Flow | `POST /api/speak` | After final answer is synthesized |
| Tillu-Flow | `POST /api/translate` | Cross-language voice queries |

---

## Environment Variables

| Variable | Provider |
|---|---|
| `SARVAM_API_KEY` | TTS primary + STT fallback + translate |
| `CARTESIA_API_KEY` | TTS secondary |
| `ELEVENLABS_API_KEY` | TTS tertiary |
| `GROQ_API_KEY` | STT primary |

---

## Files

```
tts & stt/
├── api/
│   ├── speak.js          ← TTS endpoint
│   ├── listen.js         ← STT endpoint
│   ├── translate.js      ← STT + translation
│   ├── health.js         ← Key status check
│   ├── unified.js        ← Reserved
│   └── voice/speak.js    ← Alias
├── public/index.html     ← Test UI
└── server.js             ← Local dev server
```
