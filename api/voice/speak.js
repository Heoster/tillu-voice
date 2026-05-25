// /api/voice/speak — alias for /api/speak (text → audio stream)
// Delegates to the canonical handler to avoid code duplication.
export { default } from '../speak.js';
