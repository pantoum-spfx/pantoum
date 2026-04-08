/**
 * UpgradeOrchestrator - Bridges the webapp to the PANTOUM core engine.
 *
 * Responsibilities:
 * - Load settings from pantoum.settings.yml
 * - Map PantoumSettings → UpgradeOptions (same pattern as CLI settingsService)
 * - Set Logger.onLog callback to intercept all core output
 * - Call upgradeRepo(options) from the core engine
 * - Parse log messages to extract structured events via LogParser
 * - Broadcast WS messages via SessionManager
 * - Support abort via AbortController (between solutions)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { SessionManager } from './SessionManager.js';
import { LogParserStateful } from './LogParser.js';
import { ParallelUpgradeOrchestrator } from './ParallelUpgradeOrchestrator.js';
import { loadDefaultSettings } from './defaultsLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Dynamic import helper to load core engine modules at runtime.
 * Uses path.resolve to prevent TypeScript from statically resolving the imports,
 * which would fail due to rootDir constraints in tsconfig.server.json.
 */
const CORE_ROOT = path.resolve(__dirname, '../../..');
async function importLogger(): Promise<{ logger: { onLog: ((level: string, message: string) => void) | null } }> {
  const mod = await import(/* @vite-ignore */ path.join(CORE_ROOT, 'src/utils/logger.js'));
  return mod;
}
async function importUpgradeRepo(): Promise<{ upgradeRepo: (options: any) => Promise<{ success: boolean; reportPath: string }> }> {
  const mod = await import(/* @vite-ignore */ path.join(CORE_ROOT, 'src/index.js'));
  return mod;
}
async function importSettingsLoader(): Promise<{
  loadSettingsFile: (searchDir: string, cwd?: string) => Partial<Record<string, unknown>>;
  resolveSettings: (fileSettings: Partial<Record<string, unknown>>, overrides?: Partial<Record<string, unknown>>) => Record<string, unknown>;
  settingsToCamelCase: (settings: Record<string, unknown>) => Record<string, unknown>;
  resolveModelId: (model: string) => string;
}> {
  const mod = await import(/* @vite-ignore */ path.join(CORE_ROOT, 'src/settingsLoader.js'));
  return mod;
}

/**
 * Load settings using the shared loader from the core engine.
 * Merges: defaults < pantoum.settings.yml < settingsOverrides
 */
async function loadSettings(settingsOverrides?: Record<string, unknown>) {
  const { loadSettingsFile, resolveSettings, settingsToCamelCase, resolveModelId } = await importSettingsLoader();
  const fileSettings = loadSettingsFile(CORE_ROOT);
  const resolved = resolveSettings(fileSettings, settingsOverrides as any);
  if ((resolved.agent_provider as string) !== 'claude') {
    throw new Error(`Unsupported agent provider "${String(resolved.agent_provider)}". This public release supports only "claude".`);
  }
  const cliArgs = settingsToCamelCase(resolved);
  const claudeModel = resolveModelId((resolved.agent_model as string) || 'sonnet');
  const thinkingEffort = (resolved.thinking_effort as string) || 'high';
  return { cliArgs, claudeModel, thinkingEffort };
}

export class UpgradeOrchestrator {
  private sessionManager: SessionManager;
  private abortControllers = new Map<string, AbortController>();
  private parallelOrchestrators = new Map<string, ParallelUpgradeOrchestrator>();

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Run the upgrade for a session. Dispatches to sequential or parallel mode.
   */
  async run(
    sessionId: string,
    solutions: string[],
    settingsOverrides?: Record<string, unknown>,
    parallelism = 1,
  ): Promise<void> {
    if (parallelism > 1 && solutions.length > 1) {
      return this.runParallel(sessionId, solutions, settingsOverrides, parallelism);
    }
    return this.runSequential(sessionId, solutions, settingsOverrides);
  }

  /**
   * Sequential upgrade — existing behavior, runs all solutions in one process.
   */
  private async runSequential(
    sessionId: string,
    solutions: string[],
    settingsOverrides?: Record<string, unknown>,
  ): Promise<void> {
    const startTime = Date.now();
    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);

    let currentSolutionPath = solutions.length === 1 ? solutions[0] : solutions[0] || '';
    let currentIndex = 0;
    const totalSolutions = solutions.length;
    let succeededCount = 0;
    let failedCount = 0;

    // Build name→path lookup so we can map log-parsed solution names back to full paths
    const nameToPath = new Map<string, string>();
    for (const sol of solutions) {
      const name = path.basename(sol);
      nameToPath.set(name, sol);
    }
    const resolvePath = (name: string): string => nameToPath.get(name) || name;

    // Queue tracking for sequential mode
    const queued = new Set(solutions);
    const activeSet = new Set<string>();
    const completedSet = new Set<string>();
    const failedSet = new Set<string>();

    const broadcastQueueUpdate = () => {
      this.sessionManager.broadcast({
        type: 'queue:update',
        timestamp: new Date().toISOString(),
        sessionId,
        data: {
          queued: [...queued],
          active: [...activeSet],
          completed: [...completedSet],
          failed: [...failedSet],
        },
      });
    };

    const markActive = (solPath: string) => {
      if (queued.has(solPath) || (!activeSet.has(solPath) && !completedSet.has(solPath) && !failedSet.has(solPath))) {
        queued.delete(solPath);
        activeSet.add(solPath);
        broadcastQueueUpdate();
      }
    };

    const markDone = (solPath: string, success: boolean) => {
      queued.delete(solPath);
      activeSet.delete(solPath);
      if (success) completedSet.add(solPath); else failedSet.add(solPath);
      broadcastQueueUpdate();
    };

    try {
      const { cliArgs, claudeModel, thinkingEffort } = await loadSettings(settingsOverrides);
      const localPath = this.computeLocalPath(solutions);

      const upgradeOptions = await this.buildUpgradeOptions(solutions, cliArgs, claudeModel, localPath, thinkingEffort);

      this.sessionManager.updateSession(sessionId, { status: 'running' });
      this.sessionManager.broadcast({
        type: 'progress',
        timestamp: new Date().toISOString(),
        sessionId,
        data: { phase: 'initializing', current: 0, total: totalSolutions },
      });

      // Mark the first solution as active immediately — sequential mode
      // processes solutions in order, so the first one starts right away.
      // Without this, solutions stay "queued" until the log parser detects
      // the "[X/Y] Processing solution:" line, leaving the progress view empty.
      if (solutions.length > 0) {
        markActive(solutions[0]);
      } else {
        broadcastQueueUpdate();
      }

      const { logger } = await importLogger();
      const logParser = new LogParserStateful();

      // For single solution, use the path directly
      const singleSolutionId = solutions.length === 1 ? solutions[0] : undefined;

      logger.onLog = (level: string, message: string) => {
        if (controller.signal.aborted) return;

        const wsLevel = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
        this.sessionManager.sendLog(sessionId, wsLevel as 'error' | 'warn' | 'info', message, singleSolutionId || currentSolutionPath);

        const events = logParser.parse(message);
        for (const parsed of events) {
          if (parsed.type === 'progress') {
            if (parsed.data.current > 0) {
              currentIndex = Math.min(parsed.data.current, totalSolutions);
              if (parsed.data.solutionName) {
                currentSolutionPath = resolvePath(parsed.data.solutionName);
                markActive(currentSolutionPath);
              }
            }
            this.sessionManager.updateSession(sessionId, {
              progress: {
                current: currentIndex,
                total: totalSolutions,
                phase: parsed.data.phase,
              },
            });
            this.sessionManager.broadcast({
              type: 'progress',
              timestamp: new Date().toISOString(),
              sessionId,
              solutionId: singleSolutionId || currentSolutionPath,
              data: {
                phase: parsed.data.phase,
                current: currentIndex,
                total: totalSolutions,
                solutionName: parsed.data.solutionName,
              },
            });
          } else if (parsed.type === 'solution:status') {
            const solName = parsed.data.solutionName || path.basename(currentSolutionPath);
            const solPath = resolvePath(solName);
            if (parsed.data.status === 'success') {
              succeededCount++;
              // Don't move last solution to 'completed' yet — keep it active so the
              // live log panel stays visible during report generation. It will be
              // marked done after upgradeRepo() returns and the batch completes.
              const isLast = succeededCount + failedCount >= totalSolutions;
              if (!isLast) markDone(solPath, true);
            } else if (parsed.data.status === 'failed') {
              failedCount++;
              const isLast = succeededCount + failedCount >= totalSolutions;
              if (!isLast) markDone(solPath, false);
            } else { markActive(solPath); }

            this.sessionManager.broadcast({
              type: 'solution:status',
              timestamp: new Date().toISOString(),
              sessionId,
              solutionId: singleSolutionId || solPath,
              data: { ...parsed.data, solutionName: solName },
            });
          } else if (parsed.type === 'ai:action') {
            this.sessionManager.broadcast({
              type: 'ai:action',
              timestamp: new Date().toISOString(),
              sessionId,
              solutionId: singleSolutionId || currentSolutionPath,
              data: parsed.data,
            });
          } else if (parsed.type === 'ai:metrics') {
            this.sessionManager.broadcast({
              type: 'ai:metrics',
              timestamp: new Date().toISOString(),
              sessionId,
              solutionId: singleSolutionId || currentSolutionPath,
              data: parsed.data,
            });
          } else if (parsed.type === 'pipeline:event') {
            this.sessionManager.broadcast({
              type: 'pipeline:event',
              timestamp: new Date().toISOString(),
              sessionId,
              solutionId: singleSolutionId || currentSolutionPath,
              data: parsed.data,
            });
          }
        }
      };

      if (controller.signal.aborted) {
        throw new Error('Upgrade aborted before start');
      }

      const { upgradeRepo } = await importUpgradeRepo();
      const result = await upgradeRepo(upgradeOptions);

      logger.onLog = null;

      // Mark any solutions still in 'active' as done (the last solution was kept
      // active during report generation so its log panel stayed visible)
      for (const solPath of activeSet) {
        markDone(solPath, result.success);
      }

      const durationMs = Date.now() - startTime;
      this.sessionManager.updateSession(sessionId, {
        status: result.success ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
      });
      this.sessionManager.broadcast({
        type: 'complete',
        timestamp: new Date().toISOString(),
        sessionId,
        data: {
          success: result.success,
          summary: {
            total: totalSolutions,
            succeeded: succeededCount || (result.success ? totalSolutions : totalSolutions - 1),
            failed: failedCount || (result.success ? 0 : 1),
            durationMs,
          },
          reportPath: result.reportPath,
        },
      });
    } catch (err) {
      try {
        const { logger } = await importLogger();
        logger.onLog = null;
      } catch {
        // Ignore cleanup errors
      }

      const isAborted = controller.signal.aborted;
      const status = isAborted ? 'aborted' : 'failed';
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.sessionManager.updateSession(sessionId, {
        status,
        completedAt: new Date().toISOString(),
      });

      if (isAborted) {
        this.sessionManager.broadcast({
          type: 'complete',
          timestamp: new Date().toISOString(),
          sessionId,
          data: {
            success: false,
            summary: {
              total: totalSolutions,
              succeeded: succeededCount,
              failed: failedCount,
              durationMs: Date.now() - startTime,
            },
          },
        });
      } else {
        this.sessionManager.broadcast({
          type: 'error',
          timestamp: new Date().toISOString(),
          sessionId,
          data: { message: errorMessage },
        });
        this.sessionManager.broadcast({
          type: 'complete',
          timestamp: new Date().toISOString(),
          sessionId,
          data: {
            success: false,
            summary: {
              total: totalSolutions,
              succeeded: succeededCount,
              failed: failedCount || 1,
              durationMs: Date.now() - startTime,
            },
          },
        });
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  /**
   * Parallel upgrade — each solution runs in an isolated child process.
   */
  private async runParallel(
    sessionId: string,
    solutions: string[],
    settingsOverrides?: Record<string, unknown>,
    parallelism = 2,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const { cliArgs, claudeModel, thinkingEffort } = await loadSettings(settingsOverrides);
      const localPath = this.computeLocalPath(solutions);

      const upgradeOptions = await this.buildUpgradeOptions(solutions, cliArgs, claudeModel, localPath, thinkingEffort);

      this.sessionManager.updateSession(sessionId, { status: 'running' });
      this.sessionManager.broadcast({
        type: 'progress',
        timestamp: new Date().toISOString(),
        sessionId,
        data: { phase: 'initializing', current: 0, total: solutions.length },
      });

      const orchestrator = new ParallelUpgradeOrchestrator(
        this.sessionManager,
        sessionId,
        solutions,
        parallelism,
        upgradeOptions,
      );
      this.parallelOrchestrators.set(sessionId, orchestrator);

      const result = await orchestrator.run();

      const durationMs = Date.now() - startTime;
      this.sessionManager.updateSession(sessionId, {
        status: result.success ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
      });

      // Broadcast batch:complete for parallel, and 'complete' for backward compat
      const completionData = {
        success: result.success,
        summary: {
          total: solutions.length,
          succeeded: result.succeededCount,
          failed: result.failedCount,
          durationMs,
        },
      };

      this.sessionManager.broadcast({
        type: 'batch:complete',
        timestamp: new Date().toISOString(),
        sessionId,
        data: completionData,
      });
      this.sessionManager.broadcast({
        type: 'complete',
        timestamp: new Date().toISOString(),
        sessionId,
        data: completionData,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.sessionManager.updateSession(sessionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
      this.sessionManager.broadcast({
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId,
        data: { message: errorMessage },
      });
      this.sessionManager.broadcast({
        type: 'complete',
        timestamp: new Date().toISOString(),
        sessionId,
        data: {
          success: false,
          summary: {
            total: solutions.length,
            succeeded: 0,
            failed: solutions.length,
            durationMs: Date.now() - startTime,
          },
        },
      });
    } finally {
      this.parallelOrchestrators.delete(sessionId);
    }
  }

  /**
   * Abort a running upgrade session (handles both sequential and parallel).
   */
  abort(sessionId: string): boolean {
    // Check parallel first
    const parallel = this.parallelOrchestrators.get(sessionId);
    if (parallel) {
      parallel.abortAll();
      return true;
    }

    // Fall back to sequential
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Abort a single solution in a parallel session.
   */
  abortSolution(sessionId: string, solutionPath: string): boolean {
    const parallel = this.parallelOrchestrators.get(sessionId);
    if (parallel) {
      return parallel.abortSolution(solutionPath);
    }
    return false;
  }

  /**
   * Check if a session is currently running.
   */
  isRunning(sessionId: string): boolean {
    return this.abortControllers.has(sessionId) || this.parallelOrchestrators.has(sessionId);
  }

  /**
   * Build the UpgradeOptions object from CLI args.
   */
  private async buildUpgradeOptions(
    solutions: string[],
    cliArgs: Record<string, unknown>,
    claudeModel: string,
    localPath: string,
    thinkingEffort?: string,
  ): Promise<any> {
    return {
      localPath,
      includeSolutions: solutions,
      excludeSolutions: [] as string[],
      excludePatchIds: (cliArgs.excludePatchIds as string[]) || [],
      targetVersion: (cliArgs.targetVersion as string) || (await loadDefaultSettings()).target_version,
      flags: {
        onSingleSolutionFail: (cliArgs.onSingleSolutionFail as 'halt' | 'continue') || 'halt',
        silent: false,
        aiFixM365Errors: cliArgs.aiFixM365Errors as boolean ?? false,
        aiFixBuildErrors: cliArgs.aiFixBuildErrors as boolean ?? false,
        claudeModel,
        thinkingEffort,
        updateThirdPartyDeps: cliArgs.updateThirdPartyDeps as 'none' | 'patch' | 'minor' | 'major',
        updateThirdPartyDevDeps: cliArgs.updateThirdPartyDevDeps as 'none' | 'patch',
        cleanInstallAfterDepUpdate: cliArgs.cleanInstallAfterDepUpdate as boolean,
        aiFixThirdPartyErrors: cliArgs.aiFixThirdPartyErrors as boolean,
        aiFixEslintProperly: cliArgs.aiFixEslintProperly as boolean,
        aiFixTypeScriptWarnings: cliArgs.aiFixTypeScriptWarnings as boolean,
        aiMaxRetries: cliArgs.aiMaxRetries as number,
        envInjectionStrategy: cliArgs.envInjectionStrategy as 'webpack-patch' | 'none',
      },
      versionUpdateOptions: (cliArgs.versionUpdates as boolean) ? {
        enabled: true,
        updatePackageJson: cliArgs.updatePackageJson as boolean,
        updateReadme: cliArgs.updateReadme as boolean,
        updateBadges: cliArgs.updateBadges as boolean,
        updateVersionHistory: cliArgs.updateVersionHistory as boolean,
        versionComment: cliArgs.versionComment as string,
        PnPnvmrc: cliArgs.PnPnvmrc as boolean,
        PnPdevcontainer: cliArgs.PnPdevcontainer as boolean,
      } : undefined,
      outputOptions: {
        perSolutionReports: cliArgs.perSolutionReports as boolean,
        markdown: true,
        writeHistory: (cliArgs.writeHistory as boolean) ?? true,
        historyRoot: CORE_ROOT,
      },
      complexityOptions: {
        enabled: false,
        includeDevDependencies: cliArgs.includeDevDepsComplexity as boolean,
      },
      debugOptions: {},
    };
  }

  /**
   * Compute the common parent directory of all selected solutions.
   * If all solutions are in the same parent, use that parent.
   * Otherwise, find the deepest common ancestor.
   */
  private computeLocalPath(solutions: string[]): string {
    if (solutions.length === 0) return process.cwd();
    if (solutions.length === 1) return path.dirname(solutions[0]);

    const parts = solutions.map((s) => path.dirname(s).split(path.sep));
    const minLen = Math.min(...parts.map((p) => p.length));
    const common: string[] = [];

    for (let i = 0; i < minLen; i++) {
      const segment = parts[0][i];
      if (parts.every((p) => p[i] === segment)) {
        common.push(segment);
      } else {
        break;
      }
    }

    return common.join(path.sep) || '/';
  }
}
