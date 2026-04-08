/**
 * ParallelUpgradeOrchestrator — Manages concurrent solution upgrades.
 *
 * Uses child_process.fork() to run each solution in isolation.
 * Implements a semaphore pattern: fills up to maxParallel active workers,
 * when one completes the next queued solution starts.
 */

import { fork, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SessionManager } from './SessionManager.js';
import { LogParserStateful } from './LogParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORE_ROOT = path.resolve(__dirname, '../../..');

interface SolutionSlot {
  solutionPath: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'aborted';
  process: ChildProcess | null;
  logParser: LogParserStateful;
  startedAt: number | null;
  completedAt: number | null;
  reportPath?: string;
}

export class ParallelUpgradeOrchestrator {
  private sessionManager: SessionManager;
  private slots = new Map<string, SolutionSlot>();
  private sessionId: string;
  private maxParallel: number;
  private upgradeOptions: any;
  private batchStartTime: number;

  private queued: string[] = [];
  private active = new Set<string>();
  private completed = new Set<string>();
  private failed = new Set<string>();

  private resolveAll: (() => void) | null = null;
  private aborted = false;

  constructor(
    sessionManager: SessionManager,
    sessionId: string,
    solutions: string[],
    maxParallel: number,
    upgradeOptions: any,
  ) {
    this.sessionManager = sessionManager;
    this.sessionId = sessionId;
    this.maxParallel = maxParallel;
    this.upgradeOptions = upgradeOptions;
    this.batchStartTime = Date.now();

    // Initialize all solutions as queued
    this.queued = [...solutions];
    for (const sol of solutions) {
      this.slots.set(sol, {
        solutionPath: sol,
        status: 'queued',
        process: null,
        logParser: new LogParserStateful(),
        startedAt: null,
        completedAt: null,
      });
    }
  }

  /**
   * Start the parallel upgrade. Returns when all solutions are done.
   */
  async run(): Promise<{ success: boolean; succeededCount: number; failedCount: number }> {
    // Fill initial slots
    this.fillSlots();
    this.broadcastQueueUpdate();

    // Wait for all to finish
    await new Promise<void>((resolve) => {
      this.resolveAll = resolve;
      // Edge case: no solutions
      if (this.queued.length === 0 && this.active.size === 0) {
        resolve();
      }
    });

    return {
      success: this.failed.size === 0 && !this.aborted,
      succeededCount: this.completed.size,
      failedCount: this.failed.size,
    };
  }

  /**
   * Abort all active workers and drain the queue.
   */
  abortAll(): void {
    this.aborted = true;
    this.queued = [];

    for (const [, slot] of this.slots) {
      if (slot.process && slot.status === 'active') {
        // Keep status as "active" until exit/error so the existing
        // completion path can release semaphore slots consistently.
        slot.process.kill('SIGTERM');
      }
    }

    this.broadcastQueueUpdate();
  }

  /**
   * Abort a single solution.
   */
  abortSolution(solutionPath: string): boolean {
    const slot = this.slots.get(solutionPath);
    if (!slot) return false;

    if (slot.status === 'active' && slot.process) {
      // Do not pre-mark as aborted here; letting the process exit path
      // call onWorkerComplete avoids leaving stale entries in active set.
      slot.process.kill('SIGTERM');
      return true;
    }

    // Remove from queue
    const qIdx = this.queued.indexOf(solutionPath);
    if (qIdx !== -1) {
      this.queued.splice(qIdx, 1);
      slot.status = 'aborted';

      // If we removed a queued item while capacity is available, immediately
      // backfill from the remaining queue.
      this.fillSlots();
      this.broadcastQueueUpdate();
      return true;
    }

    return false;
  }

  private fillSlots(): void {
    while (this.active.size < this.maxParallel && this.queued.length > 0 && !this.aborted) {
      const solutionPath = this.queued.shift()!;
      this.startWorker(solutionPath);
    }
  }

  private startWorker(solutionPath: string): void {
    const slot = this.slots.get(solutionPath)!;
    slot.status = 'active';
    slot.startedAt = Date.now();
    this.active.add(solutionPath);

    // Resolve the worker script path
    // Production uses compiled .js, dev uses .ts via tsx watch.
    const workerPathJs = path.join(__dirname, 'SolutionWorker.js');
    const workerPathTs = path.join(__dirname, 'SolutionWorker.ts');
    const workerPath = fs.existsSync(workerPathJs) ? workerPathJs : workerPathTs;

    const child = fork(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: CORE_ROOT,
    });

    // Drain stdout/stderr to prevent pipe buffer deadlock.
    // All structured logging goes via IPC; these pipes only carry
    // incidental output (npm, heft, Claude SDK).  Without draining,
    // the 64 KB OS pipe buffer fills up on heavy-output solutions
    // and the child process blocks on write → appears to crash.
    child.stdout?.resume();
    child.stderr?.resume();

    slot.process = child;

    // Handle IPC messages from worker
    child.on('message', (msg: any) => {
      if (this.aborted && msg.type !== 'complete' && msg.type !== 'error') return;

      switch (msg.type) {
        case 'log': {
          const wsLevel = msg.level === 'error' ? 'error' : msg.level === 'warn' ? 'warn' : 'info';
          this.sessionManager.sendSolutionLog(
            this.sessionId,
            solutionPath,
            wsLevel as 'error' | 'warn' | 'info',
            msg.message,
          );

          // Parse for structured events
          const events = slot.logParser.parse(msg.message);
          for (const parsed of events) {
            this.sessionManager.broadcast({
              type: parsed.type,
              timestamp: new Date().toISOString(),
              sessionId: this.sessionId,
              solutionId: solutionPath,
              data: parsed.data,
            });
          }
          break;
        }

        case 'complete': {
          this.onWorkerComplete(solutionPath, msg.success, msg.reportPath);
          break;
        }

        case 'error': {
          this.sessionManager.sendSolutionLog(
            this.sessionId,
            solutionPath,
            'error',
            msg.message,
          );
          this.onWorkerComplete(solutionPath, false);
          break;
        }
      }
    });

    child.on('exit', (code, signal) => {
      // If worker exits without sending 'complete', treat as failure
      if (slot.status === 'active') {
        const reason = signal ? `killed by ${signal}` : `exit code ${code}`;
        this.sessionManager.sendSolutionLog(
          this.sessionId,
          solutionPath,
          'error',
          `Worker process died unexpectedly (${reason})`,
        );
        this.onWorkerComplete(solutionPath, false);
      }
    });

    child.on('error', (err) => {
      this.sessionManager.sendSolutionLog(
        this.sessionId,
        solutionPath,
        'error',
        `Worker error: ${err.message}`,
      );
      if (slot.status === 'active') {
        this.onWorkerComplete(solutionPath, false);
      }
    });

    // Send start command to worker
    child.send({
      type: 'start',
      solutionPath,
      upgradeOptions: this.upgradeOptions,
    });
  }

  private onWorkerComplete(solutionPath: string, success: boolean, reportPath?: string): void {
    const slot = this.slots.get(solutionPath);
    if (!slot || slot.status === 'completed' || slot.status === 'failed') return;

    slot.status = success ? 'completed' : 'failed';
    slot.completedAt = Date.now();
    slot.reportPath = reportPath;
    slot.process = null;

    this.active.delete(solutionPath);
    if (success) {
      this.completed.add(solutionPath);
    } else {
      this.failed.add(solutionPath);
    }

    // Broadcast solution:complete
    this.sessionManager.broadcast({
      type: 'solution:complete',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      solutionId: solutionPath,
      data: {
        solutionPath,
        success,
        durationMs: (slot.completedAt || Date.now()) - (slot.startedAt || this.batchStartTime),
        reportPath,
      },
    });

    // Update progress
    const totalDone = this.completed.size + this.failed.size;
    const totalSolutions = this.slots.size;
    this.sessionManager.broadcast({
      type: 'progress',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        phase: totalDone === totalSolutions ? 'complete' : 'upgrading',
        current: totalDone,
        total: totalSolutions,
      },
    });

    // Fill next slot BEFORE broadcasting — ensures the queue:update includes
    // the newly started solution (fixes stale active/queued counts)
    this.fillSlots();
    this.broadcastQueueUpdate();

    // Check if all done
    if (this.active.size === 0 && this.queued.length === 0) {
      this.resolveAll?.();
    }
  }

  private broadcastQueueUpdate(): void {
    this.sessionManager.broadcast({
      type: 'queue:update',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        queued: [...this.queued],
        active: [...this.active],
        completed: [...this.completed],
        failed: [...this.failed],
      },
    });
  }
}
