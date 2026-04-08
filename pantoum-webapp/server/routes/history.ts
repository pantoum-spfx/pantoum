import { Router } from 'express';
import type { HistoryService } from '../services/HistoryService.js';

export function historyRouter(historyService: HistoryService): Router {
  const router = Router();

  /**
   * GET /api/history?page=1&limit=20 - Paginated list (newest first)
   */
  router.get('/', (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const search = (req.query.search as string) || undefined;
      const sortBy = (req.query.sortBy as string) || 'timestamp';
      const sortOrder = (req.query.sortOrder as string) || 'desc';
      const result = historyService.listEntries(
        page, limit, search,
        sortBy as any, sortOrder as any,
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to list history',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/history/:runId - Get single entry
   */
  router.get('/:runId', (req, res) => {
    try {
      const entry = historyService.getEntry(req.params.runId);
      if (!entry) {
        return res.status(404).json({ error: 'History entry not found' });
      }
      res.json(entry);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get history entry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/history/:runId - Delete single entry
   */
  router.delete('/:runId', (req, res) => {
    try {
      const deleted = historyService.deleteEntry(req.params.runId);
      if (!deleted) {
        return res.status(404).json({ error: 'History entry not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to delete history entry',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/history - Clear all history
   */
  router.delete('/', (_req, res) => {
    try {
      historyService.clearAll();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to clear history',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
