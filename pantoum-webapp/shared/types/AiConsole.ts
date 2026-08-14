/**
 * AI Console types — invoke Pantoum AI runtime skills from the webapp
 */

export type AiConsoleSkill = 'doctor' | 'analyze';

export interface AiConsoleRequest {
  skill: AiConsoleSkill;
  context?: {                    // Upgrade context for analyze skill
    solutionPaths?: string[];
    reportPath?: string;
    rootPath?: string;
  };
  model?: 'sonnet' | 'opus' | 'gpt-5' | 'gpt-5-mini' | 'mai-code-1.1-flash' | 'mai-code-1-flash-picker';
  maxBudgetUsd?: number;    // Cost cap for USD-billed runtimes
}

export interface AiConsoleSession {
  id: string;
  skill: AiConsoleSkill;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startedAt: string;
  completedAt?: string;
}
