// server.js — Local dev server for TTS & STT
// Mirrors the Vercel serverless environment locally.
// NOT used in production — Vercel runs api/*.js directly.

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env files (dev only) ───────────────────────────────────────────────
function loadEnv(file) {
  try {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch { /* file may not exist */ }
}
loadEnv('.env');
loadEnv('.env.local');

// ── Config ───────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT || '3000', 10);
const MAX_BODY_BYTES = 30 * 1024 * 1024; // 30 MB — covers base64-encoded 25 MB audio

// ── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

// ── Module cache — avoids re-importing the same handler on every request ─────
const handlerCache = new Map();

async function loadHandler(handlerPath) {
  if (handlerCache.has(handlerPath)) return handlerCache.get(handlerPath);
  const fileUrl = `file:///${handlerPath.replace(/\\/g, '/')}`;
  const mod = await import(fileUrl);
  handlerCache.set(handlerPath, mod.default);
  return mod.default;
}

// ── Body parser with size limit ───────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        return reject(Object.assign(new Error('Request body too large'), { status: 413 }));
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({}); // non-JSON body — handlers will validate
      }
    });

    req.on('error', reject);
  });
}

// ── Query string parser ───────────────────────────────────────────────────────
function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const out = {};
  for (const [k, v] of new URLSearchParams(url.slice(idx + 1))) out[k] = v;
  return out;
}

// ── Minimal res shim — matches Vercel handler signature ──────────────────────
function makeRes(nodeRes) {
  let sent = false;
  return {
    get headersSent() { return sent || nodeRes.headersSent; },
    setHeader(k, v)  { nodeRes.setHeader(k, v); },
    status(code)     { nodeRes.statusCode = code; return this; },
    json(obj) {
      if (sent) return;
      sent = true;
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.end(JSON.stringify(obj));
    },
    send(data) {
      if (sent) return;
      sent = true;
      nodeRes.end(data);
    },
    end(data) {
      if (sent) return;
      sent = true;
      nodeRes.end(data);
    },
  };
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, nodeRes) => {
  const start    = Date.now();
  const url      = req.url || '/';
  const pathname = url.split('?')[0];
  const method   = req.method || 'GET';

  // Global CORS — mirrors vercel.json headers block
  const origin = process.env.CORS_ORIGIN || '*';
  nodeRes.setHeader('Access-Control-Allow-Origin',  origin);
  nodeRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  nodeRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    nodeRes.writeHead(204);
    nodeRes.end();
    return;
  }

  // ── API routes ─────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const name        = pathname.replace('/api/', '').split('/')[0];
    const handlerPath = path.join(__dirname, 'api', `${name}.js`);

    if (!fs.existsSync(handlerPath)) {
      nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: `Unknown API route: /api/${name}` }));
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (err) {
      const status = err.status || 400;
      nodeRes.writeHead(status, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: err.message }));
      return;
    }

    const req2 = Object.assign(req, { body, query: parseQuery(url) });
    const res2 = makeRes(nodeRes);

    try {
      const handler = await loadHandler(handlerPath);
      await handler(req2, res2);
    } catch (err) {
      console.error(`[${name}] Unhandled error:`, err);
      if (!res2.headersSent) {
        nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: 'Internal server error', detail: err.message }));
      }
    }

    console.log(`${method} /api/${name} → ${nodeRes.statusCode} (${Date.now() - start}ms)`);
    return;
  }

  // ── Static files ───────────────────────────────────────────────────────────
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);

  // Directory traversal guard
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    nodeRes.writeHead(403);
    nodeRes.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html'); // SPA fallback
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    nodeRes.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    nodeRes.end(content);
  } catch {
    nodeRes.writeHead(404);
    nodeRes.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`
🎙️  Indic Voice Hub  →  http://localhost:${PORT}

  API
  ├─ POST /api/speak      TTS  (Sarvam → Cartesia → ElevenLabs)
  ├─ POST /api/listen     STT  (Groq Whisper → Sarvam)
  └─ POST /api/translate  STT + translate  (Groq/Sarvam → Sarvam)

  Press Ctrl+C to stop.
`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT=<other> and retry.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
