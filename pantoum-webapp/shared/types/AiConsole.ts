/**
 * AI Console types — invoke Claude Code skills from the webapp
 */

export type AiConsoleSkill = 'doctor' | 'analyze';

export interface AiConsoleRequest {
  skill: AiConsoleSkill;
  context?: {                    // Upgrade context for analyze skill
    solutionPaths?: string[];
    reportPath?: string;
    rootPath?: string;
  };
  model?: 'sonnet' | 'opus'; // Default: sonnet
  maxBudgetUsd?: number;    // Cost cap (default: 0.50)
}

export interface AiConsoleSession {
  id: string;
  skill: AiConsoleSkill;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startedAt: string;
  completedAt?: string;
}
