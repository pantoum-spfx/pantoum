import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { WSMessage } from '../../shared/types/WebSocketProtocol.js';
import type { UpgradeSession } from '../../shared/types/Upgrade.js';

/** Message types worth replaying when a client subscribes late */
const REPLAY_TYPES = new Set([
  'log',
  'progress', 'solution:status', 'solution:complete', 'complete', 'batch:complete', 'error',
  'queue:update', 'pipeline:event', 'ai:action', 'ai:metrics',
]);

/** Maximum number of buffered messages per session to prevent unbounded memory growth */
const MAX_BUFFER_SIZE = 5000;

export class SessionManager {
  private sessions = new Map<string, UpgradeSession>();
  private messageBuffers = new Map<string, WSMessage[]>();
  private wss: WebSocketServer;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
  }

  createSession(solutions: string[], parallelism = 1): UpgradeSession {
    const session: UpgradeSession = {
      id: uuidv4(),
      status: 'pending',
      startedAt: new Date().toISOString(),
      solutions,
      parallelism,
      progress: { current: 0, total: solutions.length, phase: 'initializing' },
      solutionProgress: {},
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): UpgradeSession | undefined {
    return this.sessions.get(id);
  }

  updateSession(id: string, update: Partial<UpgradeSession>): void {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, update);
    }
  }

  /** Broadcast a message to all connected WebSocket clients */
  broadcast(message: WSMessage): void {
    // Buffer key messages for late-connecting clients
    if (message.sessionId && REPLAY_TYPES.has(message.type)) {
      let buf = this.messageBuffers.get(message.sessionId);
      if (!buf) {
        buf = [];
        this.messageBuffers.set(message.sessionId, buf);
      }
      buf.push(message);
      // Cap buffer size — drop oldest messages first (FIFO)
      if (buf.length > MAX_BUFFER_SIZE) {
        buf.splice(0, buf.length - MAX_BUFFER_SIZE);
      }
    }

    const payload = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  /** Replay buffered upgrade messages to a newly-subscribed client */
  replayMessages(ws: WebSocket, sessionId: string): void {
    const buf = this.messageBuffers.get(sessionId);
    if (!buf || buf.length === 0) return;
    for (const msg of buf) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
  }

  /** Send a typed log message */
  sendLog(sessionId: string, level: 'error' | 'warn' | 'info' | 'debug', message: string, solutionId?: string): void {
    this.broadcast({
      type: 'log',
      timestamp: new Date().toISOString(),
      sessionId,
      solutionId,
      data: { level, message },
    });
  }

  /** Send a log scoped to a specific solution */
  sendSolutionLog(sessionId: string, solutionId: string, level: 'error' | 'warn' | 'info' | 'debug', message: string): void {
    this.sendLog(sessionId, level, message, solutionId);
  }

  /** Check whether a session has buffered replay data */
  hasReplayData(sessionId: string): boolean {
    const buf = this.messageBuffers.get(sessionId);
    return !!buf && buf.length > 0;
  }

  listSessions(): UpgradeSession[] {
    return Array.from(this.sessions.values());
  }
}
