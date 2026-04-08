/**
 * WebSocket message protocol for real-time upgrade streaming
 */

type WSMessageType =
  | 'log'
  | 'progress'
  | 'solution:status'
  | 'patch:applied'
  | 'ai:action'
  | 'ai:metrics'
  | 'ai:console'
  | 'pipeline:event'
  | 'complete'
  | 'solution:complete'
  | 'queue:update'
  | 'batch:complete'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  timestamp: string;
  sessionId: string;
  solutionId?: string;
  data: unknown;
}

export interface WSLogMessage extends WSMessage {
  type: 'log';
  data: {
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
  };
}

export interface WSProgressMessage extends WSMessage {
  type: 'progress';
  data: {
    phase: string;
    current: number;
    total: number;
    solutionName?: string;
  };
}

export interface WSSolutionStatusMessage extends WSMessage {
  type: 'solution:status';
  data: {
    solutionName: string;
    status: 'pending' | 'upgrading' | 'building' | 'fixing' | 'success' | 'failed' | 'skipped';
    message?: string;
  };
}

interface WSPatchAppliedMessage extends WSMessage {
  type: 'patch:applied';
  data: {
    patchId: string;
    description: string;
    file: string;
    success: boolean;
  };
}

export interface WSAIActionMessage extends WSMessage {
  type: 'ai:action';
  data: {
    action: 'analyzing' | 'fixing' | 'verifying' | 'complete';
    description: string;
    model?: string;
  };
}

export interface WSAIMetricsMessage extends WSMessage {
  type: 'ai:metrics';
  data: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens?: number;
    costUSD: number;
    durationMs: number;
    turns: number;
    toolExecutions: number;
    model: string;
  };
}

export interface WSCompleteMessage extends WSMessage {
  type: 'complete';
  data: {
    success: boolean;
    summary: {
      total: number;
      succeeded: number;
      failed: number;
      durationMs: number;
    };
    reportPath?: string;
  };
}

export interface WSErrorMessage extends WSMessage {
  type: 'error';
  data: {
    message: string;
    code?: string;
  };
}

export interface WSAiConsoleMessage extends WSMessage {
  type: 'ai:console';
  data: {
    eventType: 'init' | 'text' | 'tool_use' | 'metrics' | 'done' | 'error';
    content: string;
    toolName?: string;
    metrics?: {
      durationMs: number;
      totalTokens: number;
      costUSD: number;
    };
  };
}

export interface WSSolutionCompleteMessage extends WSMessage {
  type: 'solution:complete';
  data: {
    solutionPath: string;
    success: boolean;
    durationMs: number;
    reportPath?: string;
  };
}

type QueueSolutionStatus = 'queued' | 'active' | 'completed' | 'failed' | 'aborted';

export interface WSQueueUpdateMessage extends WSMessage {
  type: 'queue:update';
  data: {
    queued: string[];
    active: string[];
    completed: string[];
    failed: string[];
  };
}

export interface WSBatchCompleteMessage extends WSMessage {
  type: 'batch:complete';
  data: {
    success: boolean;
    summary: {
      total: number;
      succeeded: number;
      failed: number;
      durationMs: number;
    };
    reportPath?: string;
  };
}

export interface PipelinePhaseDetail {
  // Phase 1: M365 CLI
  m365CliSuccess?: boolean;
  m365ErrorTemplateUsed?: boolean;

  // Phase 2: Patches
  fnPatchCount?: number;
  deterministicPatches?: string[];

  // Phase 3: Migrations
  aiContextsTriggered?: { key: string; template: string; package: string }[];
  aiContextsSkipped?: { key: string; reason: string }[];
  templatesRendered?: string[];
  verificationRan?: boolean;

  // Phase 4: Post-Upgrade
  manualStepsRan?: number;
  manualStepsSkipped?: number;

  // Phase 5: Build Fix
  buildSuccess?: boolean;
  buildErrorTemplateUsed?: boolean;
  eslintTemplateUsed?: boolean;
  buildFixAttempts?: number;

  // Phase 6: Third-Party
  thirdPartyTemplateUsed?: boolean;
  packagesUpdated?: number;

  // Phase 7: Success
  checksRun?: number;
  checksPassed?: number;
}

export interface WSPipelineEventMessage extends WSMessage {
  type: 'pipeline:event';
  data: {
    phase: number;
    event: 'start' | 'skip' | 'complete';
    detail: PipelinePhaseDetail;
  };
}
