import { create } from 'zustand';
import type { SolutionInfo } from '@shared/types/Solution';
import type {
  WSMessage,
  WSLogMessage,
  WSProgressMessage,
  WSAIActionMessage,
  WSAIMetricsMessage,
  WSAiConsoleMessage,
  WSCompleteMessage,
  WSSolutionStatusMessage,
  WSSolutionCompleteMessage,
  WSQueueUpdateMessage,
  WSBatchCompleteMessage,
  WSErrorMessage,
  WSPipelineEventMessage,
  PipelinePhaseDetail,
} from '@shared/types/WebSocketProtocol';

type BatchStatus = 'idle' | 'starting' | 'running' | 'complete' | 'failed' | 'aborted';
type SolutionRunStatus = 'queued' | 'active' | 'completed' | 'failed' | 'aborted';

const MAX_LOGS_PER_SOLUTION = 2000;

export interface SolutionState {
  solutionId: string;
  solutionPath: string;
  phase: string;
  status: SolutionRunStatus;
  logs: WSLogMessage[];
  progress: WSProgressMessage | null;
  aiAction: WSAIActionMessage | null;
  aiMetrics: WSAIMetricsMessage[];
  completionData: WSSolutionCompleteMessage['data'] | null;
  startedAt: number | null;
  completedAt: number | null;
  pipelinePhases: Record<number, PipelinePhaseDetail>;
}

export interface QueueState {
  queued: string[];
  active: string[];
  completed: string[];
  failed: string[];
  parallelism: number;
}

export interface AggregatedMetrics {
  totalLogs: number;
  totalWarns: number;
  totalErrors: number;
  totalTokens: number;
  totalCostUSD: number;
  aiInvocations: number;
}

interface UpgradeStore {
  sessionId: string | null;
  batchStatus: BatchStatus;

  // Scan/select state (persisted across navigation)
  rootPath: string;
  scannedSolutions: SolutionInfo[];
  selected: string[];
  upgradeSolutions: string[];

  // Per-solution state
  solutions: Map<string, SolutionState>;
  queue: QueueState;

  // Batch-level data
  batchCompletionData: WSCompleteMessage['data'] | null;
  batchError: WSErrorMessage | null;

  // Legacy flat fields (for backward compat during sequential mode)
  globalLogs: WSLogMessage[];
  globalProgress: WSProgressMessage | null;
  globalAiAction: WSAIActionMessage | null;
  globalAiMetrics: WSAIMetricsMessage[];
  globalSolutionStatuses: Map<string, WSSolutionStatusMessage>;

  // AI Console events (used by AiAnalyzePanel and AiConsolePage)
  aiConsoleEvents: WSAiConsoleMessage[];

  // Actions
  startUpgrade: (solutions: string[], parallelism?: number) => Promise<void>;
  stopUpgrade: () => Promise<void>;
  stopSolution: (solutionPath: string) => Promise<void>;
  reset: () => void;

  setRootPath: (path: string) => void;
  setScannedSolutions: (solutions: SolutionInfo[]) => void;
  setSelected: (paths: string[]) => void;
  setUpgradeSolutions: (paths: string[]) => void;

  // Reconnection
  reconnectSession: () => Promise<void>;

  // Central WS message dispatch
  dispatchWSMessage: (msg: WSMessage) => void;
  dispatchWSMessageBatch: (msgs: WSMessage[]) => void;

  // Computed helpers
  getAggregatedMetrics: () => AggregatedMetrics;
}

function createSolutionState(solutionPath: string): SolutionState {
  return {
    solutionId: solutionPath,
    solutionPath,
    phase: 'queued',
    status: 'queued',
    logs: [],
    progress: null,
    aiAction: null,
    aiMetrics: [],
    completionData: null,
    startedAt: null,
    completedAt: null,
    pipelinePhases: {},
  };
}

export const useUpgradeStore = create<UpgradeStore>((set, get) => ({
  sessionId: null,
  batchStatus: 'idle',

  rootPath: '',
  scannedSolutions: [],
  selected: [],
  upgradeSolutions: [],

  solutions: new Map(),
  queue: { queued: [], active: [], completed: [], failed: [], parallelism: 1 },

  batchCompletionData: null,
  batchError: null,

  globalLogs: [],
  globalProgress: null,
  globalAiAction: null,
  globalAiMetrics: [],
  globalSolutionStatuses: new Map(),
  aiConsoleEvents: [],

  startUpgrade: async (solutions: string[], parallelism = 1) => {
    console.log('[upgradeStore] startUpgrade() called', { count: solutions.length, parallelism });
    // Pre-compute which solutions start active vs queued based on parallelism.
    // This avoids the race condition where the server broadcasts queue:update
    // before the client's WebSocket is connected.
    const initialActive = solutions.slice(0, parallelism);
    const initialQueued = solutions.slice(parallelism);

    const solutionMap = new Map<string, SolutionState>();
    for (const p of solutions) {
      const state = createSolutionState(p);
      if (initialActive.includes(p)) {
        state.status = 'active';
        state.startedAt = Date.now();
      }
      solutionMap.set(p, state);
    }

    set({
      sessionId: null,
      batchStatus: 'starting',
      solutions: solutionMap,
      queue: {
        queued: initialQueued,
        active: initialActive,
        completed: [],
        failed: [],
        parallelism,
      },
      batchCompletionData: null,
      batchError: null,
      globalLogs: [],
      globalProgress: null,
      globalAiAction: null,
      globalAiMetrics: [],
      globalSolutionStatuses: new Map(),
      aiConsoleEvents: [],
    });
    console.log('[upgradeStore] startUpgrade: set batchStatus=starting');

    try {
      const res = await fetch('/api/upgrade/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solutions, parallelism }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      set({ sessionId: data.sessionId, batchStatus: 'running' });
      console.log('[upgradeStore] startUpgrade: set batchStatus=running, sessionId=', data.sessionId);
      try { localStorage.setItem('pantoum-upgrade-session', data.sessionId); } catch { /* quota/private */ }
    } catch (err) {
      set({ batchStatus: 'failed', sessionId: null });
      console.log('[upgradeStore] startUpgrade: set batchStatus=failed', err);
      try { localStorage.removeItem('pantoum-upgrade-session'); } catch { /* noop */ }
      throw err;
    }
  },

  stopUpgrade: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      await fetch(`/api/upgrade/${sessionId}/stop`, { method: 'POST' });
      set({ batchStatus: 'aborted' });
    } catch {
      // Best effort
    }
  },

  stopSolution: async (solutionPath: string) => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      await fetch(`/api/upgrade/${sessionId}/stop-solution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solutionPath }),
      });
    } catch {
      // Best effort
    }
  },

  reset: () => {
    console.log('[upgradeStore] reset() called\n' + new Error().stack);
    try { localStorage.removeItem('pantoum-upgrade-session'); } catch { /* noop */ }
    set({
      sessionId: null,
      batchStatus: 'idle',
      rootPath: '',
      scannedSolutions: [],
      selected: [],
      upgradeSolutions: [],
      solutions: new Map(),
      queue: { queued: [], active: [], completed: [], failed: [], parallelism: 1 },
      batchCompletionData: null,
      batchError: null,
      globalLogs: [],
      globalProgress: null,
      globalAiAction: null,
      globalAiMetrics: [],
      globalSolutionStatuses: new Map(),
      aiConsoleEvents: [],
    });
  },

  setRootPath: (path) => set({ rootPath: path }),
  setScannedSolutions: (solutions) => set({ scannedSolutions: solutions }),
  setSelected: (paths) => set({ selected: paths }),
  setUpgradeSolutions: (paths) => set({ upgradeSolutions: paths }),

  reconnectSession: async () => {
    const state = get();
    // Only attempt reconnection when the store is idle and has no session
    if (state.batchStatus !== 'idle' || state.sessionId) return;

    try {
      const res = await fetch('/api/upgrade/active');
      if (!res.ok) return;
      const { session, isRunning, hasReplayData } = await res.json();

      // Nothing to reconnect to
      if (!session || (!isRunning && !hasReplayData)) return;

      // Don't reconnect if the store moved out of idle while we were fetching
      if (get().batchStatus !== 'idle') return;

      // Build initial solution map from the session's solution list
      const solutionMap = new Map<string, SolutionState>();
      for (const p of session.solutions) {
        solutionMap.set(p, createSolutionState(p));
      }

      set({
        sessionId: session.id,
        batchStatus: isRunning ? 'running' : 'complete',
        upgradeSolutions: session.solutions,
        solutions: solutionMap,
        queue: {
          queued: [],
          active: isRunning ? [...session.solutions] : [],
          completed: isRunning ? [] : [...session.solutions],
          failed: [],
          parallelism: session.parallelism,
        },
        // Clear stale data
        batchCompletionData: null,
        batchError: null,
        globalLogs: [],
        globalProgress: null,
        globalAiAction: null,
        globalAiMetrics: [],
        globalSolutionStatuses: new Map(),
        aiConsoleEvents: [],
      });

      // Persist session ID so subsequent tab refreshes also reconnect
      try { localStorage.setItem('pantoum-upgrade-session', session.id); } catch { /* noop */ }

      // The useWebSocket hook will detect the sessionId change,
      // subscribe to the WS, and the server will replay all buffered events —
      // rebuilding full solution state (progress, phases, completion, etc.)
    } catch {
      // Network error — stay idle
    }
  },

  dispatchWSMessage: (msg: WSMessage) => {
    get().dispatchWSMessageBatch([msg]);
  },

  dispatchWSMessageBatch: (msgs: WSMessage[]) => {
    if (msgs.length === 0) return;

    const state = get();

    // Clone solutions Map once; track which solution IDs have been cloned
    const solutions = new Map(state.solutions);
    const clonedSolIds = new Set<string>();

    // Helper: get a mutable clone of a solution (clone-on-first-touch)
    const getMutableSol = (id: string): SolutionState | undefined => {
      const sol = solutions.get(id);
      if (!sol) return undefined;
      if (!clonedSolIds.has(id)) {
        const clone = { ...sol };
        solutions.set(id, clone);
        clonedSolIds.add(id);
        return clone;
      }
      return sol;
    };

    // Accumulate changes to flat fields
    let globalLogs = state.globalLogs;
    let globalProgress = state.globalProgress;
    let globalAiAction = state.globalAiAction;
    let globalAiMetrics = state.globalAiMetrics;
    let globalSolutionStatuses = state.globalSolutionStatuses;
    let queue = state.queue;
    let batchStatus = state.batchStatus;
    let batchCompletionData = state.batchCompletionData;
    let batchError = state.batchError;
    let aiConsoleEvents = state.aiConsoleEvents;

    // Track if Maps were cloned
    let globalStatusesCloned = false;

    for (const msg of msgs) {
      const solutionId = msg.solutionId;

      switch (msg.type) {
        case 'log': {
          const logMsg = msg as WSLogMessage;
          if (solutionId) {
            const sol = getMutableSol(solutionId);
            if (sol) {
              // Only clone logs array on first touch for this solution
              if (!clonedSolIds.has(solutionId + ':logs')) {
                sol.logs = [...sol.logs];
                clonedSolIds.add(solutionId + ':logs');
              }
              sol.logs.push(logMsg);
              if (sol.logs.length > MAX_LOGS_PER_SOLUTION) {
                sol.logs = sol.logs.slice(-MAX_LOGS_PER_SOLUTION);
              }
            }
          }
          globalLogs = [...globalLogs, logMsg];
          if (globalLogs.length > MAX_LOGS_PER_SOLUTION) {
            globalLogs = globalLogs.slice(-MAX_LOGS_PER_SOLUTION);
          }
          break;
        }

        case 'progress': {
          const progMsg = msg as WSProgressMessage;
          if (solutionId) {
            const sol = getMutableSol(solutionId);
            if (sol) {
              sol.progress = progMsg;
              sol.phase = progMsg.data.phase;
            }
          }
          globalProgress = progMsg;
          break;
        }

        case 'solution:status': {
          const statusMsg = msg as WSSolutionStatusMessage;
          if (!globalStatusesCloned) {
            globalSolutionStatuses = new Map(globalSolutionStatuses);
            globalStatusesCloned = true;
          }
          globalSolutionStatuses.set(statusMsg.data.solutionName, statusMsg);

          if (solutionId) {
            const sol = getMutableSol(solutionId);
            if (sol) {
              // Only advance to 'active' — never to terminal states.
              // Terminal transitions ('completed'/'failed') come from solution:complete only.
              if (sol.status === 'queued') {
                sol.status = 'active';
                sol.startedAt = sol.startedAt || Date.now();
              }
              sol.phase = statusMsg.data.status;
            }
          }
          break;
        }

        case 'ai:action': {
          const aiMsg = msg as WSAIActionMessage;
          const aiValue = aiMsg.data.action === 'complete' ? null : aiMsg;
          if (solutionId) {
            const sol = getMutableSol(solutionId);
            if (sol) sol.aiAction = aiValue;
          }
          globalAiAction = aiValue;
          break;
        }

        case 'ai:metrics': {
          const metricsMsg = msg as WSAIMetricsMessage;
          if (solutionId) {
            const sol = getMutableSol(solutionId);
            if (sol) {
              if (!clonedSolIds.has(solutionId + ':aiMetrics')) {
                sol.aiMetrics = [...sol.aiMetrics];
                clonedSolIds.add(solutionId + ':aiMetrics');
              }
              sol.aiMetrics.push(metricsMsg);
            }
          }
          globalAiMetrics = [...globalAiMetrics, metricsMsg];
          break;
        }

        case 'queue:update': {
          const queueMsg = msg as WSQueueUpdateMessage;
          const now = Date.now();

          // Update solution statuses (only advance, never regress)
          for (const id of queueMsg.data.active) {
            const sol = getMutableSol(id);
            if (sol && sol.status === 'queued') {
              sol.status = 'active';
              sol.startedAt = now;
            }
          }
          for (const id of queueMsg.data.completed) {
            const sol = getMutableSol(id);
            if (sol && sol.status !== 'completed') {
              sol.status = 'completed';
              sol.completedAt = now;
            }
          }
          for (const id of queueMsg.data.failed) {
            const sol = getMutableSol(id);
            if (sol && sol.status !== 'failed') {
              sol.status = 'failed';
              sol.completedAt = now;
            }
          }

          // Derive queue arrays from solutions Map (single source of truth)
          // instead of blindly accepting server arrays which may be stale
          const derivedQueued: string[] = [];
          const derivedActive: string[] = [];
          const derivedCompleted: string[] = [];
          const derivedFailed: string[] = [];
          for (const [id, sol] of solutions) {
            switch (sol.status) {
              case 'queued': derivedQueued.push(id); break;
              case 'active': derivedActive.push(id); break;
              case 'completed': derivedCompleted.push(id); break;
              case 'failed': derivedFailed.push(id); break;
            }
          }
          // Preserve server's queue ORDER for queued items
          const serverOrder = queueMsg.data.queued;
          derivedQueued.sort((a, b) => {
            const ai = serverOrder.indexOf(a);
            const bi = serverOrder.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });

          queue = {
            ...queue,
            queued: derivedQueued,
            active: derivedActive,
            completed: derivedCompleted,
            failed: derivedFailed,
          };
          break;
        }

        case 'solution:complete': {
          const solCompleteMsg = msg as WSSolutionCompleteMessage;
          const solId = solCompleteMsg.data.solutionPath;
          const sol = getMutableSol(solId);
          if (sol) {
            sol.status = solCompleteMsg.data.success ? 'completed' : 'failed';
            sol.completionData = solCompleteMsg.data;
            sol.completedAt = Date.now();
          }
          // Keep queue arrays in sync — don't wait for queue:update message
          const targetSet = solCompleteMsg.data.success ? 'completed' : 'failed';
          if (!queue[targetSet].includes(solId)) {
            queue = { ...queue };
            queue[targetSet] = [...queue[targetSet], solId];
            queue.active = queue.active.filter(id => id !== solId);
            queue.queued = queue.queued.filter(id => id !== solId);
          }
          break;
        }

        case 'batch:complete':
        case 'complete': {
          // Skip if already aborted — late-arriving complete from server should not overwrite
          if (batchStatus === 'aborted') break;
          const completeMsg = msg as (WSBatchCompleteMessage | WSCompleteMessage);
          batchStatus = completeMsg.data.success ? 'complete' : 'failed';
          batchCompletionData = completeMsg.data;
          globalAiAction = null;
          break;
        }

        case 'pipeline:event': {
          const pipelineMsg = msg as WSPipelineEventMessage;
          const { phase, detail } = pipelineMsg.data;
          const targetSolId = solutionId || pipelineMsg.solutionId;
          if (targetSolId) {
            const sol = getMutableSol(targetSolId);
            if (sol) {
              const existing = sol.pipelinePhases[phase] || {};
              const merged: PipelinePhaseDetail = { ...existing, ...detail };
              if (Array.isArray(existing.aiContextsTriggered) && Array.isArray(detail.aiContextsTriggered)) {
                merged.aiContextsTriggered = [...existing.aiContextsTriggered, ...detail.aiContextsTriggered];
              }
              if (Array.isArray(existing.aiContextsSkipped) && Array.isArray(detail.aiContextsSkipped)) {
                merged.aiContextsSkipped = [...existing.aiContextsSkipped, ...detail.aiContextsSkipped];
              }
              if (Array.isArray(existing.templatesRendered) && Array.isArray(detail.templatesRendered)) {
                merged.templatesRendered = [...existing.templatesRendered, ...detail.templatesRendered];
              }
              sol.pipelinePhases = { ...sol.pipelinePhases, [phase]: merged };
            }
          }
          break;
        }

        case 'ai:console': {
          const consoleMsg = msg as WSAiConsoleMessage;
          aiConsoleEvents = [...aiConsoleEvents, consoleMsg];
          break;
        }

        case 'error': {
          batchError = msg as WSErrorMessage;
          break;
        }
      }
    }

    // Single set() call for the entire batch
    set({
      solutions,
      globalLogs,
      globalProgress,
      globalAiAction,
      globalAiMetrics,
      globalSolutionStatuses,
      queue,
      batchStatus,
      batchCompletionData,
      batchError,
      aiConsoleEvents,
    });
  },

  getAggregatedMetrics: (): AggregatedMetrics => {
    const state = get();
    let totalLogs = 0, totalWarns = 0, totalErrors = 0;
    let totalTokens = 0, totalCostUSD = 0, aiInvocations = 0;

    // If we have per-solution state, aggregate from there
    if (state.solutions.size > 0) {
      for (const sol of state.solutions.values()) {
        for (const log of sol.logs) {
          totalLogs++;
          if (log.data.level === 'warn') totalWarns++;
          if (log.data.level === 'error') totalErrors++;
        }
        for (const m of sol.aiMetrics) {
          totalTokens += m.data.totalTokens;
          totalCostUSD += m.data.costUSD;
          aiInvocations++;
        }
      }
    }

    // Fall back to global logs if no per-solution data
    if (totalLogs === 0 && state.globalLogs.length > 0) {
      for (const log of state.globalLogs) {
        totalLogs++;
        if (log.data.level === 'warn') totalWarns++;
        if (log.data.level === 'error') totalErrors++;
      }
      for (const m of state.globalAiMetrics) {
        totalTokens += m.data.totalTokens;
        totalCostUSD += m.data.costUSD;
        aiInvocations++;
      }
    }

    return { totalLogs, totalWarns, totalErrors, totalTokens, totalCostUSD, aiInvocations };
  },
}));

// DEBUG: log every batchStatus transition with previous value.
// TODO: remove once flicker bug is diagnosed.
useUpgradeStore.subscribe((state, prev) => {
  if (state.batchStatus !== prev.batchStatus) {
    console.log('[upgradeStore] batchStatus:', prev.batchStatus, '→', state.batchStatus,
      'sessionId:', state.sessionId,
      'upgradeSolutions.length:', state.upgradeSolutions.length);
  }
});
