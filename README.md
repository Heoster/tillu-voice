# Tillu-Voice

Tillu-Voice is a unified, dead-simple voice API service. You give it text or audio, and it handles the messy reality of TTS, STT, translation, and voice intelligence across 14+ Indian languages. One API, zero provider lock-in, smart fallbacks.

## Features
- **Unified API:** Simplified endpoints for listening, speaking, translating, and unified workflows.
- **Auto-Selection:** Intelligent routing to the best provider for each language.
- **Smart Fallback:** Health-based switching if a primary provider fails.
- **Cost Optimizer:** Uses free tiers when no keys are configured.
- **Vercel Ready:** Edge-fast deployment.

## API Endpoints
- `/api/listen`: Unified STT.
- `/api/speak`: Unified TTS.
- `/api/translate`: Speech-to-Speech Translation.
- `/api/unified`: The full magic pipeline.

## Getting Started
1. Clone the repository.
2. Install [Vercel CLI](https://vercel.com/cli).
3. Deploy: `vercel`.
4. Add your API keys via Vercel dashboard or CLI.
