import { Router } from 'express';
import type { SessionManager } from '../services/SessionManager.js';
import type { UpgradeRequest } from '../../shared/types/Upgrade.js';
import { UpgradeOrchestrator } from '../services/UpgradeOrchestrator.js';
import { validatePathUnderHome } from '../utils/pathValidation.js';

/**
 * Upgrade routes - Phase 3 implementation
 * Wires the webapp to the PANTOUM core engine via UpgradeOrchestrator
 */
export function upgradeRouter(sessionManager: SessionManager): Router {
  const router = Router();
  const orchestrator = new UpgradeOrchestrator(sessionManager);

  /**
   * POST /api/upgrade/start - Begin an upgrade session
   */
  router.post('/start', (req, res) => {
    try {
      const { solutions, settingsOverrides, parallelism } = req.body as UpgradeRequest;

      if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
        return res.status(400).json({ error: 'solutions array is required' });
      }

      // Validate all solution paths
      for (const solPath of solutions) {
        try {
          validatePathUnderHome(solPath);
        } catch {
          return res.status(400).json({ error: `Solution path outside allowed directory: ${solPath}` });
        }
      }

      const effectiveParallelism = Math.max(1, Math.min(4, parallelism || 1));
      const session = sessionManager.createSession(solutions, effectiveParallelism);

      // Start upgrade in background (don't await)
      orchestrator.run(session.id, solutions, settingsOverrides, effectiveParallelism)
        .catch((err) => {
          console.error(`[Upgrade] Unhandled error in session ${session.id}:`, err);
        });

      res.json({
        sessionId: session.id,
        status: 'running',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start upgrade',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/upgrade/active - Discover the most recent active or just-completed session
   * Used by the client to reconnect after a tab close/refresh.
   * Must be registered BEFORE /:id to avoid Express matching "active" as an :id param.
   */
  router.get('/active', (_req, res) => {
    const sessions = sessionManager.listSessions();
    // Find the most recent session that is still running, or the latest completed one
    const running = sessions.find((s) => s.status === 'running' || s.status === 'pending');
    const session = running || sessions.at(-1) || null;

    if (!session) {
      return res.json({ session: null, isRunning: false, hasReplayData: false });
    }

    const isRunning = session.status === 'running' || session.status === 'pending';
    const hasReplayData = sessionManager.hasReplayData(session.id);

    res.json({ session, isRunning, hasReplayData });
  });

  /**
   * GET /api/upgrade/:id - Get session status
   */
  router.get('/:id', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  });

  /**
   * POST /api/upgrade/:id/stop - Abort an upgrade
   */
  router.post('/:id/stop', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const aborted = orchestrator.abort(session.id);

    if (aborted) {
      sessionManager.updateSession(session.id, {
        status: 'aborted',
        completedAt: new Date().toISOString(),
      });
      res.json({ success: true, status: 'aborted' });
    } else {
      // Session exists but isn't running (already finished)
      res.json({ success: false, status: session.status, message: 'Session is not running' });
    }
  });

  /**
   * POST /api/upgrade/:id/stop-solution - Abort a single solution in a parallel session
   */
  router.post('/:id/stop-solution', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { solutionPath } = req.body as { solutionPath: string };
    if (!solutionPath) {
      return res.status(400).json({ error: 'solutionPath is required' });
    }

    const aborted = orchestrator.abortSolution(session.id, solutionPath);
    res.json({ success: aborted, solutionPath });
  });

  /**
   * GET /api/upgrade/sessions - List all sessions
   */
  router.get('/', (_req, res) => {
    res.json({ sessions: sessionManager.listSessions() });
  });

  return router;
}
