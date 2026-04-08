/**
 * SolutionWorker — Child process entry point for parallel upgrades.
 *
 * Forked via child_process.fork(). Receives a single solution path + upgrade options
 * via IPC, hooks Logger.instance.onLog to forward all logs back to the parent,
 * and calls upgradeRepo() in isolation.
 *
 * Each worker has its own Logger, UpgradeService, PatchService — zero shared mutable state.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORE_ROOT = path.resolve(__dirname, '../../..');

async function importLogger(): Promise<{ logger: { onLog: ((level: string, message: string) => void) | null } }> {
  const mod = await import(/* @vite-ignore */ path.join(CORE_ROOT, 'src/utils/logger.js'));
  return mod;
}

async function importUpgradeRepo(): Promise<{ upgradeRepo: (options: any) => Promise<{ success: boolean; reportPath: string }> }> {
  const mod = await import(/* @vite-ignore */ path.join(CORE_ROOT, 'src/index.js'));
  return mod;
}

interface WorkerStartMessage {
  type: 'start';
  solutionPath: string;
  upgradeOptions: any;
}

interface WorkerLogMessage {
  type: 'log';
  level: string;
  message: string;
}

interface WorkerCompleteMessage {
  type: 'complete';
  success: boolean;
  reportPath?: string;
}

interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

type WorkerOutMessage = WorkerLogMessage | WorkerCompleteMessage | WorkerErrorMessage;

function send(msg: WorkerOutMessage): void {
  if (process.send) {
    process.send(msg);
  }
}

process.on('message', async (msg: WorkerStartMessage) => {
  if (msg.type !== 'start') return;

  const { solutionPath, upgradeOptions } = msg;

  try {
    // Hook logger to forward logs to parent
    const { logger } = await importLogger();
    logger.onLog = (level: string, message: string) => {
      send({ type: 'log', level, message });
    };

    // Override includeSolutions to just this one
    const options = {
      ...upgradeOptions,
      localPath: path.dirname(solutionPath),
      includeSolutions: [solutionPath],
    };

    const { upgradeRepo } = await importUpgradeRepo();
    const result = await upgradeRepo(options);

    // Clean up logger
    logger.onLog = null;

    send({
      type: 'complete',
      success: result.success,
      reportPath: result.reportPath,
    });
  } catch (err) {
    // Clean up logger
    try {
      const { logger } = await importLogger();
      logger.onLog = null;
    } catch {
      // Ignore
    }

    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Exit after completion
  process.exit(0);
});

// Handle graceful termination
process.on('SIGTERM', () => {
  send({ type: 'error', message: 'Upgrade aborted' });
  process.exit(1);
});
