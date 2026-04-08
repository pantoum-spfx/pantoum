/**
 * Upgrade History Types (core engine)
 *
 * These types are also defined in pantoum-webapp/shared/types/History.ts
 * for the webapp. Both must be kept in sync.
 */

export interface HistoryEntrySolution {
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
