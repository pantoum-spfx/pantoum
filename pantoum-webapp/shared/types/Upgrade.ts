/**
 * Upgrade session types
 */

export interface UpgradeRequest {
  solutions: string[];
  settingsOverrides?: Record<string, unknown>;
  parallelism?: number;
}

interface SolutionProgress {
  status: 'queued' | 'active' | 'completed' | 'failed' | 'aborted';
  phase?: string;
  startedAt?: string;
  completedAt?: string;
  reportPath?: string;
}

export interface UpgradeSession {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  startedAt: string;
  completedAt?: string;
  solutions: string[];
  parallelism: number;
  progress: {
    current: number;
    total: number;
    phase: string;
  };
  solutionProgress: Record<string, SolutionProgress>;
  reportPath?: string;
  error?: string;
}
