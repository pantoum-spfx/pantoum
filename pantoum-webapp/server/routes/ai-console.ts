import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { query as agentQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SessionManager } from '../services/SessionManager.js';
import type { AiConsoleRequest, AiConsoleSession, AiConsoleSkill } from '../../shared/types/AiConsole.js';
import type { WSAiConsoleMessage } from '../../shared/types/WebSocketProtocol.js';
import { validatePathUnderHome } from '../utils/pathValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** PANTOUM project root (two levels up from server/routes/) */
const PANTOUM_ROOT = path.resolve(__dirname, '../../..');

/** Active Agent SDK sessions */
interface ActiveSession {
  session: AiConsoleSession;
  abortController: AbortController;
}
const activeSessions = new Map<string, ActiveSession>();

/** Per-session event buffer — replayed when a WS client subscribes */
const sessionBuffers = new Map<string, WSAiConsoleMessage[]>();

/** Sessions that already emitted a 'done' event (prevents duplicates) */
const doneSessions = new Set<string>();

/** Available skills mapped to their .claude/commands files */
const SKILL_FILES: Record<string, string> = {
  doctor: 'pantoum-doctor.md',
  analyze: 'pantoum-analyze.md',
};

// ============================================================================
// Settings loader (dynamic import — same pattern as UpgradeOrchestrator)
// ============================================================================

interface AiConsoleSettings {
  claudeModel: string;
  thinkingEffort: string;
}

async function loadAiConsoleSettings(): Promise<AiConsoleSettings> {
  try {
    const mod = await import(/* @vite-ignore */ path.join(PANTOUM_ROOT, 'src/settingsLoader.js'));
    const fileSettings = mod.loadSettingsFile(PANTOUM_ROOT);
    const resolved = mod.resolveSettings(fileSettings);
    const claudeModel: string = resolved.agent_model || 'sonnet';
    const thinkingEffort: string = resolved.thinking_effort || 'high';
    return { claudeModel, thinkingEffort };
  } catch {
    // Fallback if settings can't be loaded
    return { claudeModel: 'sonnet', thinkingEffort: 'high' };
  }
}

// ============================================================================
// Adapter import (dynamic — same pattern as settingsLoader)
// ============================================================================

/**
 * Build validated Agent SDK options via ClaudeAgentSdkAdapter.
 * Eliminates duplicated model-mapping and option-assembly logic.
 */
async function buildAgentOptions(
  settings: AiConsoleSettings,
  abortController: AbortController,
): Promise<{ options: any; modelName: string }> {
  const { claude } = await import(/* @vite-ignore */ path.join(PANTOUM_ROOT, 'src/adapters/claudeAgentSdkAdapter.js'));
  const builder = claude()
    .withModel(settings.claudeModel)
    .allowTools('Bash', 'Read', 'Grep', 'Glob')
    .skipPermissions()
    .withAbortController(abortController)
    .withPersistSession(false);
  if (settings.thinkingEffort && settings.thinkingEffort !== 'off') {
    builder.withThinkingEffort(settings.thinkingEffort);
  }
  return builder.buildOptions();
}

// ============================================================================
// Skill prompt loader
// ============================================================================

/**
 * Read a skill's prompt content from .claude/commands/
 */
function loadSkillPrompt(skill: AiConsoleSkill): string | null {
  const filename = SKILL_FILES[skill];
  if (!filename) return null;
  const filePath = path.join(PANTOUM_ROOT, '.claude', 'commands', filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

// ============================================================================
// WebSocket event broadcasting (with buffer + dedup)
// ============================================================================

/**
 * Broadcast an ai:console event via WebSocket and buffer it for late-joining clients
 */
function broadcastEvent(
  sessionManager: SessionManager,
  sessionId: string,
  eventType: WSAiConsoleMessage['data']['eventType'],
  content: string,
  extra?: { toolName?: string; metrics?: WSAiConsoleMessage['data']['metrics'] },
): void {
  // Deduplicate 'done' events — only the first one per session is emitted
  if (eventType === 'done') {
    if (doneSessions.has(sessionId)) return;
    doneSessions.add(sessionId);
  }

  const message: WSAiConsoleMessage = {
    type: 'ai:console',
    timestamp: new Date().toISOString(),
    sessionId,
    data: {
      eventType,
      content,
      ...extra,
    },
  };

  // Buffer for replay
  if (!sessionBuffers.has(sessionId)) {
    sessionBuffers.set(sessionId, []);
  }
  sessionBuffers.get(sessionId)!.push(message);

  sessionManager.broadcast(message);
}

/**
 * Replay all buffered events for a session to a single WebSocket client.
 * Called when a client sends a `subscribe` message after connecting.
 */
export function replaySessionBuffer(ws: import('ws').WebSocket, sessionId: string): void {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return;
  for (const msg of buffer) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

// ============================================================================
// Agent SDK streaming loop
// ============================================================================

/**
 * Run an Agent SDK query in the background and stream events via WebSocket.
 * Options are built by the adapter via buildAgentOptions() — no manual assembly here.
 */
function runAgentSession(
  sessionManager: SessionManager,
  sessionId: string,
  session: AiConsoleSession,
  prompt: string,
  cwd: string,
  options: any,
  modelName: string,
): void {
  broadcastEvent(sessionManager, sessionId, 'init', `Running /pantoum-${session.skill} (model: ${modelName})...`);

  // Match the working adapter pattern: chdir before query, restore in finally
  const originalCwd = process.cwd();
  if (cwd !== originalCwd && fs.existsSync(cwd)) {
    process.chdir(cwd);
  }

  const queryResult = agentQuery({ prompt, options });

  // Iterate the async generator in the background
  (async () => {
    try {
      for await (const message of queryResult) {
        // Stop iterating if the session was aborted
        if (session.status === 'stopped') break;

        // System init message
        if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
          broadcastEvent(sessionManager, sessionId, 'init',
            `Session started (ID: ${(message as any).session_id || 'n/a'})`);
          continue;
        }

        // Assistant messages — extract text and tool_use blocks
        if (message.type === 'assistant' && 'message' in message) {
          const apiMessage = (message as any).message;
          if (apiMessage?.content) {
            for (const block of apiMessage.content) {
              if (block.type === 'text' && block.text) {
                broadcastEvent(sessionManager, sessionId, 'text', block.text);
              } else if (block.type === 'tool_use') {
                broadcastEvent(sessionManager, sessionId, 'tool_use',
                  block.input ? JSON.stringify(block.input).slice(0, 500) : '',
                  { toolName: block.name });
              }
            }
          }
          continue;
        }

        // Result message — metrics + completion
        if (message.type === 'result') {
          const result = message as any;
          const metrics = {
            durationMs: result.duration_ms || 0,
            totalTokens: ((result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)),
            costUSD: result.total_cost_usd || result.cost_usd || 0,
          };
          broadcastEvent(sessionManager, sessionId, 'metrics',
            `Completed in ${(metrics.durationMs / 1000).toFixed(1)}s (model: ${modelName})`,
            { metrics });

          // Note: result.result duplicates content already streamed via assistant messages — skip it

          session.status = 'completed';
          session.completedAt = new Date().toISOString();
          broadcastEvent(sessionManager, sessionId, 'done', 'Session finished');
          continue;
        }
      }

      // Generator ended without a result message (edge case)
      if (session.status === 'running') {
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        broadcastEvent(sessionManager, sessionId, 'done', 'Session finished');
      }
    } catch (error: any) {
      // Don't broadcast error for intentional aborts
      if (session.status !== 'stopped') {
        const msg = error instanceof Error ? error.message : String(error);
        broadcastEvent(sessionManager, sessionId, 'error', `Agent SDK error: ${msg}`);
        session.status = 'failed';
        session.completedAt = new Date().toISOString();
        broadcastEvent(sessionManager, sessionId, 'done', 'Session failed');
      }
    } finally {
      // Restore original working directory
      try { process.chdir(originalCwd); } catch { /* ignore */ }

      // Clean up after a delay (keep session info for status queries)
      setTimeout(() => {
        activeSessions.delete(sessionId);
        sessionBuffers.delete(sessionId);
        doneSessions.delete(sessionId);
      }, 60_000);
    }
  })();
}

// ============================================================================
// Express routes
// ============================================================================

/**
 * AI Console routes
 */
export function aiConsoleRouter(sessionManager: SessionManager): Router {
  const router = Router();

  /**
   * GET /api/ai-console/skills — List available skills
   */
  router.get('/skills', (_req, res) => {
    const skills = Object.entries(SKILL_FILES).map(([id, filename]) => {
      const filePath = path.join(PANTOUM_ROOT, '.claude', 'commands', filename);
      return {
        id,
        name: `pantoum-${id}`,
        available: fs.existsSync(filePath),
      };
    });
    res.json({ skills });
  });

  /**
   * POST /api/ai-console/run — Start a Claude Code skill invocation via Agent SDK
   */
  router.post('/run', async (req, res) => {
    try {
      const { skill, context } = req.body as AiConsoleRequest;

      if (!skill) {
        return res.status(400).json({ error: 'skill is required' });
      }

      // Build the prompt
      const skillContent = loadSkillPrompt(skill);
      if (!skillContent) {
        return res.status(404).json({ error: `Skill '${skill}' not found in .claude/commands/` });
      }

      let prompt = skillContent;

      // Validate and sanitize context paths before using them
      if (context) {
        if (context.solutionPaths?.length) {
          for (const p of context.solutionPaths) {
            try {
              validatePathUnderHome(p);
            } catch {
              return res.status(400).json({ error: `Solution path outside allowed directory: ${p}` });
            }
          }
        }
        if (context.reportPath) {
          try {
            validatePathUnderHome(context.reportPath);
          } catch {
            return res.status(400).json({ error: 'Report path outside allowed directory' });
          }
        }
        if (context.rootPath) {
          try {
            validatePathUnderHome(context.rootPath);
          } catch {
            return res.status(400).json({ error: 'Root path outside allowed directory' });
          }
        }
      }

      // For analyze skill: prepend upgrade context so it knows where to look
      // Only validated filesystem paths are interpolated — no freeform user text
      if (skill === 'analyze' && context) {
        const contextLines: string[] = [];
        if (context.solutionPaths?.length) {
          contextLines.push('The solution(s) to analyze are at:');
          for (const p of context.solutionPaths) {
            // Use only the resolved absolute path (strips any injection attempts)
            contextLines.push(`  - ${path.resolve(PANTOUM_ROOT, p)}`);
          }
        }
        if (context.reportPath) {
          contextLines.push(`The upgrade report is at: ${path.resolve(PANTOUM_ROOT, context.reportPath)}`);
        }
        if (contextLines.length > 0) {
          contextLines.push('');
          contextLines.push('Use these paths directly — do not ask the user for the solution path.');
          contextLines.push('');
          contextLines.push('This is a non-interactive session (webapp). Your output will be rendered as a static report.');
          contextLines.push('Do not include follow-up menus, interactive prompts, or "What would you like to do next?" sections.');
          contextLines.push('End your report after the Recommendations section.');
          contextLines.push('');
          prompt = contextLines.join('\n') + prompt;
        }
      }

      // Set CWD: for analyze with context, use first solution path (or rootPath); otherwise PANTOUM_ROOT
      let cwd = PANTOUM_ROOT;
      if (skill === 'analyze' && context) {
        if (context.solutionPaths?.[0]) {
          cwd = path.resolve(PANTOUM_ROOT, context.solutionPaths[0]);
        } else if (context.rootPath) {
          cwd = path.resolve(PANTOUM_ROOT, context.rootPath);
        }
      }

      // Load model and thinking token settings from pantoum.settings.yml
      const settings = await loadAiConsoleSettings();

      const sessionId = uuidv4();
      const abortController = new AbortController();

      // Build validated SDK options via the shared adapter
      const { options, modelName } = await buildAgentOptions(settings, abortController);

      const session: AiConsoleSession = {
        id: sessionId,
        skill,
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      activeSessions.set(sessionId, { session, abortController });

      // Start the Agent SDK streaming loop in the background
      runAgentSession(sessionManager, sessionId, session, prompt, cwd, options, modelName);

      res.json({ sessionId, status: 'running' });
    } catch (error) {
      console.error('[ai-console] POST /run failed:', error);
      res.status(500).json({
        error: 'Failed to start AI Console session',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/ai-console/:sessionId/stop — Stop a running session
   */
  router.post('/:sessionId/stop', (req, res) => {
    const { sessionId } = req.params;
    const entry = activeSessions.get(sessionId);

    if (!entry) {
      return res.json({ success: false, status: 'ended', message: 'Session already ended' });
    }

    if (entry.session.status !== 'running') {
      return res.json({ success: false, status: entry.session.status, message: 'Session is not running' });
    }

    entry.session.status = 'stopped';
    entry.abortController.abort();

    broadcastEvent(sessionManager, sessionId, 'done', 'Session stopped by user');

    res.json({ success: true, status: 'stopped' });
  });

  /**
   * GET /api/ai-console/:sessionId — Get session status
   */
  router.get('/:sessionId', (req, res) => {
    const entry = activeSessions.get(req.params.sessionId);
    if (!entry) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(entry.session);
  });

  return router;
}
