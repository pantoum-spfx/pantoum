/**
 * Upgrade History Types
 * Per-run history entries written by the core engine and read by the webapp.
 */

interface HistoryEntrySolution {
  path: string;
  name: string;
  success: boolean;
}

export interface HistoryEntry {
  runId: string;
  timestamp: string;
  completedAt: string;
  rootPath: string;
  targetVersion: string;
  status: 'success' | 'partial' | 'failed';
  solutions: HistoryEntrySolution[];
  reportPath: string;
  durationMs: number;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}
