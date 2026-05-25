# 🎙️ Indic Voice Hub

Production-ready TTS + STT API for 14 Indian languages. Smart provider fallback chains, 30s serverless timeouts, and a browser UI — deployed on Vercel.

**Live demo:** https://tillu-voice.vercel.app

---

## Quick start

```bash
git clone https://github.com/Heoster/tillu-voice
cd tillu-voice
npm install
cp .env.example .env   # fill in your keys
npm run dev            # http://localhost:3000
```

---

## API reference

Base URL (production): `https://tillu-voice.vercel.app`

All endpoints:
- Accept and return `application/json` (except TTS which returns audio bytes)
- Support `OPTIONS` preflight with `Access-Control-Allow-Origin: *`
- Return structured errors on failure (see [Error format](#error-format))

---

### POST `/api/speak` · `/api/voice/speak`

Convert text to speech. Both paths are identical — `/api/voice/speak` is an alias.

**Fallback chain:** Sarvam AI → Cartesia sonic-3.5 → ElevenLabs

#### Request

```http
POST /api/speak
Content-Type: application/json
```

```json
{
  "text": "नमस्ते दुनिया, आप कैसे हैं?",
  "lang": "hi"
}
```

| Field  | Type   | Required | Default | Notes |
|--------|--------|----------|---------|-------|
| `text` | string | ✅ | — | Max 4 000 characters |
| `lang` | string | ❌ | `"hi"` | ISO 639-1 two-letter code |

Also accepts **GET** with query params:

```
GET /api/speak?text=hello+world&lang=en
```

#### Response

Binary audio stream.

| Header | Value |
|--------|-------|
| `Content-Type` | `audio/wav` (Sarvam / Cartesia) or `audio/mpeg` (ElevenLabs) |
| `X-Provider` | `sarvam` · `cartesia` · `elevenlabs` |
| `Cache-Control` | `no-store` |

#### Supported languages

| Code | Language   | Code | Language  | Code | Language  |
|------|------------|------|-----------|------|-----------|
| `hi` | Hindi      | `ta` | Tamil     | `gu` | Gujarati  |
| `bn` | Bengali    | `te` | Telugu    | `mr` | Marathi   |
| `en` | English    | `ml` | Malayalam | `pa` | Punjabi   |
| `kn` | Kannada    | `or` | Odia      | `ur` | Urdu      |
| `as` | Assamese   | `ne` | Nepali    | `sa` | Sanskrit  |

> **Note:** Cartesia sonic-3.5 natively supports `hi` and `en`. Other Indian language codes fall back to Hindi voice on Cartesia. Sarvam handles all 14 natively.

#### curl example

```bash
# Save to file
curl -X POST https://tillu-voice.vercel.app/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"नमस्ते दुनिया","lang":"hi"}' \
  --output speech.wav

# GET shorthand
curl "https://tillu-voice.vercel.app/api/speak?text=hello&lang=en" --output speech.wav
```

#### JavaScript example

```js
const res = await fetch('https://tillu-voice.vercel.app/api/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'नमस्ते दुनिया', lang: 'hi' }),
});

const blob = await res.blob();
const audio = new Audio(URL.createObjectURL(blob));
audio.play();
```

---

### POST `/api/listen`

Transcribe audio to text.

**Fallback chain:** Groq Whisper-large-v3 → Sarvam saarika:v2.5

#### Request

```http
POST /api/listen
Content-Type: application/json
```

```json
{
  "audio": "<base64-encoded audio>",
  "lang": "hi",
  "contentType": "audio/webm"
}
```

| Field         | Type   | Required | Default        | Notes |
|---------------|--------|----------|----------------|-------|
| `audio`       | string | ✅ | — | Base64-encoded audio data. Max 25 MB decoded. |
| `lang`        | string | ❌ | `"hi"` | ISO 639-1 code (see language table above) |
| `contentType` | string | ❌ | `"audio/webm"` | MIME type of the audio |

**Accepted `contentType` values:**
`audio/webm` · `audio/ogg` · `audio/mp4` · `audio/mpeg` · `audio/wav` · `audio/flac` · `audio/x-m4a` · `audio/aac`

#### Response `200`

```json
{
  "success": true,
  "text": "नमस्ते दुनिया",
  "provider": "groq-whisper",
  "lang": "hi"
}
```

| Field      | Type   | Description |
|------------|--------|-------------|
| `success`  | bool   | Always `true` on 200 |
| `text`     | string | Transcribed text |
| `provider` | string | `groq-whisper` or `sarvam` |
| `lang`     | string | Echo of the requested language |

#### curl example

```bash
# Record with ffmpeg, then transcribe
ffmpeg -i recording.wav -f webm pipe:1 | base64 | \
  jq -Rs '{"audio": ., "lang": "hi", "contentType": "audio/webm"}' | \
  curl -X POST https://tillu-voice.vercel.app/api/listen \
    -H "Content-Type: application/json" -d @-
```

#### JavaScript example (browser microphone)

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
const chunks = [];

recorder.ondataavailable = e => chunks.push(e.data);
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const base64 = await blobToBase64(blob);

  const res = await fetch('https://tillu-voice.vercel.app/api/listen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: base64, lang: 'hi', contentType: 'audio/webm' }),
  });

  const { text } = await res.json();
  console.log('Transcript:', text);
};

recorder.start();
setTimeout(() => recorder.stop(), 5000); // record 5 seconds

function blobToBase64(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
```

---

### POST `/api/translate`

Transcribe audio and translate the result to another language.

**Pipeline:** Audio → Groq/Sarvam STT → Sarvam Mayura translation

#### Request

```http
POST /api/translate
Content-Type: application/json
```

```json
{
  "audio": "<base64-encoded audio>",
  "sourceLang": "hi",
  "targetLang": "en",
  "contentType": "audio/webm"
}
```

| Field        | Type   | Required | Default        | Notes |
|--------------|--------|----------|----------------|-------|
| `audio`      | string | ✅ | — | Base64-encoded audio. Max 25 MB decoded. |
| `sourceLang` | string | ❌ | `"hi"` | Language spoken in the audio |
| `targetLang` | string | ❌ | `"en"` | Language to translate into |
| `contentType`| string | ❌ | `"audio/webm"` | MIME type of the audio |

#### Response `200`

```json
{
  "success": true,
  "originalText": "नमस्ते दुनिया",
  "translatedText": "Hello world",
  "sourceLang": "hi",
  "targetLang": "en",
  "sttProvider": "groq-whisper",
  "translateProvider": "sarvam"
}
```

| Field               | Type   | Description |
|---------------------|--------|-------------|
| `success`           | bool   | Always `true` on 200 |
| `originalText`      | string | Transcribed text in source language |
| `translatedText`    | string | Translated text (equals `originalText` if `sourceLang === targetLang`) |
| `sourceLang`        | string | Echo of source language |
| `targetLang`        | string | Echo of target language |
| `sttProvider`       | string | `groq-whisper` or `sarvam` |
| `translateProvider` | string | `sarvam` or `passthrough` (when no translation needed) |

#### curl example

```bash
curl -X POST https://tillu-voice.vercel.app/api/translate \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "'$(base64 -w0 recording.webm)'",
    "sourceLang": "hi",
    "targetLang": "en",
    "contentType": "audio/webm"
  }'
```

---

### GET `/api/health`

Deployment diagnostic. Shows which API keys are configured without exposing their values.

```http
GET /api/health
```

#### Response `200`

```json
{
  "ok": true,
  "runtime": "v24.14.1",
  "env": "production",
  "keys": {
    "CARTESIA_API_KEY":   "✅ set (29 chars, starts: sk_car…)",
    "ELEVENLABS_API_KEY": "✅ set (51 chars, starts: sk_974…)",
    "GROQ_API_KEY":       "✅ set (56 chars, starts: gsk_5p…)",
    "SARVAM_API_KEY":     "✅ set (36 chars, starts: sk_q4q…)"
  }
}
```

Use this to verify your deployment has all keys set before going live.

---

## Error format

All errors return JSON with a consistent shape:

```json
{
  "error": "Human-readable message",
  "details": ["provider-a: 400 ...", "provider-b: timeout"],
  "hint": "Set SOME_API_KEY in your environment."
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — missing or invalid field |
| `405` | Method not allowed |
| `413` | Audio payload exceeds 25 MB |
| `503` | All providers in the fallback chain failed |

---

## Environment variables

Copy `.env.example` to `.env` and fill in your keys. All providers have free tiers.

| Variable | Used by | Get key at |
|----------|---------|------------|
| `CARTESIA_API_KEY` | TTS (primary) | https://cartesia.ai |
| `SARVAM_API_KEY` | TTS + STT + translate | https://sarvam.ai |
| `ELEVENLABS_API_KEY` | TTS (fallback) | https://elevenlabs.io |
| `GROQ_API_KEY` | STT (primary) | https://console.groq.com |
| `CORS_ORIGIN` | All endpoints | Set to your domain in production |

At least one TTS key (`CARTESIA_API_KEY`, `SARVAM_API_KEY`, or `ELEVENLABS_API_KEY`) and one STT key (`GROQ_API_KEY` or `SARVAM_API_KEY`) are required.

---

## Provider details

### TTS fallback chain

```
Request
  │
  ├─ 1. Sarvam AI  bulbul:v1  ── best for all 14 Indian languages
  │      pace: 0.85 · speaker: anushka
  │
  ├─ 2. Cartesia  sonic-3.5  ── multilingual, native Hindi support
  │      speed: 0.8 · WAV pcm_s16le 44100 Hz
  │      voice: 2904ccd0-3707-45dc-9c18-0c2dd4b8481d
  │
  └─ 3. ElevenLabs  eleven_multilingual_v2  ── high-quality fallback
         uses first voice on your account
```

### STT fallback chain

```
Request
  │
  ├─ 1. Groq  whisper-large-v3  ── fastest, free, 30s timeout
  │
  └─ 2. Sarvam  saarika:v2.5  ── Indian language specialist
```

---

## Project structure

```
.
├── api/
│   ├── speak.js          # TTS — POST/GET text → audio
│   ├── listen.js         # STT — POST audio → text
│   ├── translate.js      # STT + translate — POST audio → translated text
│   ├── health.js         # GET — deployment diagnostic
│   ├── unified.js        # (reserved)
│   └── voice/
│       └── speak.js      # Alias → ../speak.js
├── public/
│   └── index.html        # Browser UI
├── server.js             # Local dev server (not used in production)
├── vercel.json           # Routing + function timeouts
├── .env.example          # Environment variable template
└── package.json
```

---

## Local development

```bash
npm run dev   # starts http://localhost:3000
```

The local server (`server.js`) mirrors Vercel's routing — `api/*.js` and `api/**/*.js` are auto-discovered. It loads `.env` and `.env.local` automatically.

---

## Deploy to Vercel

```bash
# First time
npx vercel

# Production deploy
npx vercel --prod
```

After deploying, verify all keys are set:

```bash
curl https://your-app.vercel.app/api/health
```

---

## License

MIT
