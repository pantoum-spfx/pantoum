import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { healthRouter } from './routes/health.js';
import { settingsRouter } from './routes/settings.js';
import { versionsRouter } from './routes/versions.js';
import { solutionsRouter } from './routes/solutions.js';
import { upgradeRouter } from './routes/upgrade.js';
import { reportsRouter } from './routes/reports.js';
import { aiConsoleRouter, replaySessionBuffer } from './routes/ai-console.js';
import { historyRouter } from './routes/history.js';
import { SessionManager } from './services/SessionManager.js';
import { HistoryService } from './services/HistoryService.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ports: { apiPort: number; devPort: number } = require('../shared/ports.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || String(ports.apiPort), 10);
const VITE_DEV_PORT = ports.devPort;

// Allowed origins: the Express server itself + Vite dev server
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  `http://localhost:${VITE_DEV_PORT}`,
];

const app = express();
const server = createServer(app);

// WebSocket server with origin validation
const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: (info: { origin: string; req: import('http').IncomingMessage; secure: boolean }) => {
    // Allow non-browser clients (CLI tools, tests) which don't send Origin headers
    if (!info.origin) return true;
    return ALLOWED_ORIGINS.includes(info.origin);
  },
});

// Session manager (shared across routes)
const sessionManager = new SessionManager(wss);

// History service (reads pantoum_history/ from project root)
const pantoumRoot = path.resolve(__dirname, '../..');
const historyService = new HistoryService(pantoumRoot);

// Middleware
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// API routes
app.use('/api/health', healthRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/solutions', solutionsRouter);
app.use('/api/upgrade', upgradeRouter(sessionManager));
app.use('/api/ai-console', aiConsoleRouter(sessionManager));
app.use('/api/reports', reportsRouter);
app.use('/api/history', historyRouter(historyService));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const appDir = path.join(__dirname, '../app');
  app.use(express.static(appDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(appDir, 'index.html'));
  });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'subscribe' && typeof msg.sessionId === 'string') {
        console.log(`[WS] Client subscribed to session ${msg.sessionId}`);
        // Replay buffered upgrade messages (progress, complete, etc.)
        sessionManager.replayMessages(ws, msg.sessionId);
        // Replay AI console events
        replaySessionBuffer(ws, msg.sessionId);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// Start server — bind to localhost (loopback only, resolves to IPv4 or IPv6 per OS)
server.listen(PORT, 'localhost', () => {
  console.log(`\n  PANTOUM Studio`);
  console.log(`  API:       http://localhost:${PORT}/api/health`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`  Frontend:  http://localhost:${VITE_DEV_PORT}`);
  }
  console.log('');
});
