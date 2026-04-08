#!/usr/bin/env npx tsx
/**
 * PANTOUM Parallel Upgrade Script (Cross-Platform)
 *
 * Features:
 * - Top-level SPFx solution discovery
 * - Configurable parallel execution slots
 * - Batch processing with resume capability
 * - Real-time progress display
 * - Cross-platform (Windows, macOS, Linux)
 *
 * Usage:
 *   npx tsx scripts/parallel-upgrade.ts [OPTIONS]
 *
 * Options:
 *   --parallel N          Number of parallel upgrades (default: 3)
 *   --solutions-dir       Path to solutions directory
 *   --csv                 Path to CSV file with solution paths
 *   --batch-size N        Process only N solutions, then stop
 *   --include-processed   Also process already upgraded solutions
 *   --target-version      Target SPFx version (default: from defaults.ts)
 *   --claude-model        Claude model: sonnet, opus, haiku (default: from settings file or defaults.ts)
 *   --thinking-effort     Thinking effort: high, medium, low, off (default: from settings file)
 *   --dry-run             Show what would be executed
 *   --help                Show help
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { DEFAULT_TARGET_VERSION } from '../src/defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPES
// ============================================================================

interface Config {
  parallelCount: number;
  solutionsDir: string;
  csvFile: string;
  batchSize: number;
  limit: number;
  includeProcessed: boolean;
  targetVersion: string;
  claudeModel: string;
  thinkingEffort: string;
  excludedPatches: string;
  dryRun: boolean;
}

interface SlotInfo {
  solutionName: string;
  startTime: number;
}

interface Result {
  status: 'SUCCESS' | 'FAILED';
  solutionName: string;
  duration: number;
}

// ============================================================================
// COLORS (ANSI escape codes)
// ============================================================================

const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  cyan: '\x1b[0;36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function colorize(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

function clearScreen(): void {
  process.stdout.write('\x1b[H\x1b[J');
}

function showHelp(): void {
  console.log(`
${colorize('bold', 'PANTOUM Parallel Upgrade Script (Cross-Platform)')}

${colorize('cyan', 'Usage:')} npx tsx scripts/parallel-upgrade.ts [OPTIONS]

${colorize('cyan', 'Options:')}
  --parallel N          Number of parallel upgrades (default: 3)
  --solutions-dir PATH  Path to solutions directory (checks immediate children)
  --csv FILE            Path to CSV file with solution paths (local_path column)
  --batch-size N        Process only N solutions, then stop (default: all)
  --limit N             Select first N solutions (alphabetically sorted, deterministic across runs)
  --include-processed   Also process solutions that already have pantoum-upgrade.log
  --target-version VER  Target SPFx version (default: ${DEFAULT_TARGET_VERSION})
  --claude-model MODEL  Claude model: sonnet, opus, haiku (default: from settings/defaults)
  --thinking-effort LVL Thinking effort: high, medium, low, off (default: from settings)
  --dry-run             Show what would be executed without running
  --help                Show this help message

${colorize('cyan', 'Features:')}
  - Top-level solution discovery (checks immediate children of solutions dir)
  - Detection via .yo-rc.json with @microsoft/generator-sharepoint
  - Real-time progress display with slot tracking
  - Batch processing: skip already processed, resume with next batch
  - Cross-platform: works on Windows, macOS, and Linux

${colorize('cyan', 'Examples:')}
  # Process first 10 solutions
  npx tsx scripts/parallel-upgrade.ts --solutions-dir ~/dev/spfx --batch-size 10

  # Resume: process next 10 (skips already processed)
  npx tsx scripts/parallel-upgrade.ts --solutions-dir ~/dev/spfx --batch-size 10

  # Re-process all including already done
  npx tsx scripts/parallel-upgrade.ts --solutions-dir ~/dev/spfx --include-processed
`);
}

// ============================================================================
// SOLUTION DISCOVERY
// ============================================================================

function findSpfxSolutions(baseDir: string): string[] {
  const solutions: string[] = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const yoRcPath = path.join(baseDir, entry.name, '.yo-rc.json');
    try {
      const content = fs.readFileSync(yoRcPath, 'utf-8');
      if (content.includes('@microsoft/generator-sharepoint')) {
        solutions.push(path.join(baseDir, entry.name));
      }
    } catch {
      // No .yo-rc.json or unreadable — skip
    }
  }

  return solutions;
}

function parseCsvSolutions(csvFile: string): string[] {
  const solutions: string[] = [];
  const content = fs.readFileSync(csvFile, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header

  for (const line of lines) {
    if (!line.trim()) continue;
    const localPath = line.split(',')[0]?.replace(/"/g, '').trim();
    if (localPath && fs.existsSync(localPath) && fs.existsSync(path.join(localPath, '.yo-rc.json'))) {
      solutions.push(localPath);
    }
  }

  return solutions;
}

// ============================================================================
// PARALLEL EXECUTION ENGINE
// ============================================================================

class ParallelUpgradeEngine {
  private config: Config;
  private pantoumDir: string;
  private slots: Map<number, SlotInfo> = new Map();
  private results: Result[] = [];
  private totalSolutions: number = 0;
  private startTime: number = 0;
  private displayInterval: NodeJS.Timeout | null = null;
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor(config: Config) {
    this.config = config;
    this.pantoumDir = path.resolve(__dirname, '..');
  }

  async run(solutions: string[]): Promise<void> {
    this.totalSolutions = solutions.length;
    this.startTime = Date.now();

    // Start display loop
    this.displayInterval = setInterval(() => this.displayStatus(), 2000);
    this.displayStatus();

    // Process solutions with limited parallelism
    const queue = [...solutions];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      // Start new processes up to parallel limit
      while (queue.length > 0 && running.length < this.config.parallelCount) {
        const solution = queue.shift()!;
        const slotId = this.acquireSlot(path.basename(solution));

        const promise = this.upgradeSolution(solution, slotId)
          .finally(() => {
            this.releaseSlot(slotId);
          });

        running.push(promise);
      }

      // Wait for at least one to complete
      if (running.length > 0) {
        // Track settlement per promise before racing
        const withStatus = running.map((p) => {
          let settled = false;
          p.then(() => { settled = true; }, () => { settled = true; });
          return { promise: p, isSettled: () => settled };
        });

        await Promise.race(running);

        // Remove settled promises (their .then callbacks ran before await resumed)
        running.length = 0;
        for (const { promise, isSettled } of withStatus) {
          if (!isSettled()) {
            running.push(promise);
          }
        }
      }
    }

    // Stop display and show final summary
    if (this.displayInterval) {
      clearInterval(this.displayInterval);
    }

    this.displayFinalSummary();
  }

  private acquireSlot(solutionName: string): number {
    for (let i = 1; i <= this.config.parallelCount; i++) {
      if (!this.slots.has(i)) {
        this.slots.set(i, { solutionName, startTime: Date.now() });
        return i;
      }
    }
    return -1; // Should never happen with proper queue management
  }

  private releaseSlot(slotId: number): void {
    this.slots.delete(slotId);
  }

  private async upgradeSolution(solutionPath: string, slotId: number): Promise<void> {
    const solutionName = path.basename(solutionPath);
    const logFile = path.join(solutionPath, 'pantoum-upgrade.log');
    const startTime = Date.now();

    const cliPath = path.join(this.pantoumDir, 'dist', 'cli.js');

    // Only pass flags that are intentionally different for parallel mode.
    // All other settings come from pantoum.settings.yml via the CLI's settings loader.
    const args = [
      cliPath,
      '--localPath', solutionPath,
      '--toVersion', this.config.targetVersion,
      '--excludePatchIds', this.config.excludedPatches,
      '--perSolutionReports', 'true',
      '--onSingleSolutionFail', 'halt',
      '--analyzeComplexity', 'false',
    ];

    // Only forward --claudeModel if the user explicitly passed it to the script
    if (this.config.claudeModel) {
      args.push('--claudeModel', this.config.claudeModel);
    }

    // Only forward --thinkingEffort if the user explicitly passed it to the script
    if (this.config.thinkingEffort) {
      args.push('--thinkingEffort', this.config.thinkingEffort);
    }

    return new Promise<void>((resolve) => {
      const logStream = fs.createWriteStream(logFile);
      const child = spawn('node', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.pantoumDir,
      });

      this.activeProcesses.set(solutionName, child);

      child.stdout?.pipe(logStream);
      child.stderr?.pipe(logStream);

      child.on('close', (code) => {
        this.activeProcesses.delete(solutionName);
        logStream.close();

        const duration = Math.floor((Date.now() - startTime) / 1000);
        this.results.push({
          status: code === 0 ? 'SUCCESS' : 'FAILED',
          solutionName,
          duration,
        });

        resolve();
      });

      child.on('error', () => {
        this.activeProcesses.delete(solutionName);
        logStream.close();

        const duration = Math.floor((Date.now() - startTime) / 1000);
        this.results.push({
          status: 'FAILED',
          solutionName,
          duration,
        });

        resolve();
      });
    });
  }

  private displayStatus(): void {
    clearScreen();

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const completed = this.results.length;
    const success = this.results.filter((r) => r.status === 'SUCCESS').length;
    const failed = this.results.filter((r) => r.status === 'FAILED').length;
    const running = this.slots.size;
    const queued = Math.max(0, this.totalSolutions - completed - running);

    console.log('');
    console.log(colorize('cyan', colorize('bold', '════════════════════════════════════════════════════════════')));
    console.log(colorize('cyan', colorize('bold', '         PANTOUM Parallel Upgrade - Live Progress           ')));
    console.log(colorize('cyan', colorize('bold', '════════════════════════════════════════════════════════════')));
    console.log('');
    console.log(` ${colorize('bold', 'Target:')}  SPFx ${this.config.targetVersion}`);
    console.log(` ${colorize('bold', 'Elapsed:')} ${formatDuration(elapsed)}`);
    console.log('');
    console.log(` ${colorize('bold', `Slots [${this.config.parallelCount}]:`)}`);

    for (let i = 1; i <= this.config.parallelCount; i++) {
      const slot = this.slots.get(i);
      if (slot) {
        const slotElapsed = Math.floor((Date.now() - slot.startTime) / 1000);
        console.log(`   ${colorize('green', `[${i}]`)} ${slot.solutionName} ${colorize('dim', `(${formatDuration(slotElapsed)})`)}`);
      } else {
        console.log(`   ${colorize('dim', `[${i}] (available)`)}`);
      }
    }

    console.log('');
    console.log(` ${colorize('bold', 'Queue:')}     ${queued} remaining`);
    console.log(` ${colorize('bold', 'Completed:')} ${completed}/${this.totalSolutions} ${colorize('dim', `(${colorize('green', `${success} success`)}${colorize('dim', ', ')}${colorize('red', `${failed} failed`)}${colorize('dim', ')')}`)}`);
    console.log('');
    console.log(colorize('cyan', '════════════════════════════════════════════════════════════'));

    // Show recent completions
    const recent = this.results.slice(-3);
    if (recent.length > 0) {
      console.log('');
      console.log(` ${colorize('bold', 'Recent:')}`);
      for (const result of recent) {
        const icon = result.status === 'SUCCESS' ? colorize('green', '\u2713') : colorize('red', '\u2717');
        console.log(`   ${icon} ${result.solutionName} ${colorize('dim', `(${formatDuration(result.duration)})`)}`);
      }
    }
  }

  private displayFinalSummary(): void {
    clearScreen();

    const totalDuration = Math.floor((Date.now() - this.startTime) / 1000);
    const success = this.results.filter((r) => r.status === 'SUCCESS');
    const failed = this.results.filter((r) => r.status === 'FAILED');

    console.log('');
    console.log(colorize('cyan', colorize('bold', '════════════════════════════════════════════════════════════')));
    console.log(colorize('cyan', colorize('bold', '              PANTOUM Parallel Upgrade - Complete           ')));
    console.log(colorize('cyan', colorize('bold', '════════════════════════════════════════════════════════════')));
    console.log('');

    console.log(`  ${colorize('green', colorize('bold', 'Successful:'))} ${success.length}`);
    console.log(`  ${colorize('red', colorize('bold', 'Failed:'))}     ${failed.length}`);
    console.log(`  ${colorize('bold', 'Total time:')} ${formatDuration(totalDuration)}`);
    console.log('');

    if (failed.length > 0) {
      console.log(colorize('red', colorize('bold', 'Failed solutions:')));
      for (const result of failed) {
        console.log(`  ${colorize('red', '\u2717')} ${result.solutionName} (${formatDuration(result.duration)})`);
      }
      console.log('');
    }

    if (success.length > 0) {
      console.log(colorize('green', colorize('bold', 'Successful solutions:')));
      for (const result of success) {
        console.log(`  ${colorize('green', '\u2713')} ${result.solutionName} (${formatDuration(result.duration)})`);
      }
    }

    console.log('');
    console.log(colorize('cyan', '════════════════════════════════════════════════════════════'));
    console.log('');
  }
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    parallelCount: 3,
    solutionsDir: path.join(os.homedir(), 'dev', 'mobi', 'gitlab', 'zuma', 'strk4666'),
    csvFile: '',
    batchSize: 0,
    limit: 0,
    includeProcessed: false,
    targetVersion: DEFAULT_TARGET_VERSION,
    claudeModel: '',
    thinkingEffort: '',
    excludedPatches: 'FN019002,FN012019,FN017001',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--parallel':
        config.parallelCount = parseInt(args[++i], 10);
        break;
      case '--solutions-dir':
        config.solutionsDir = args[++i];
        break;
      case '--csv':
        config.csvFile = args[++i];
        break;
      case '--batch-size':
        config.batchSize = parseInt(args[++i], 10);
        break;
      case '--limit':
        config.limit = parseInt(args[++i], 10);
        break;
      case '--include-processed':
        config.includeProcessed = true;
        break;
      case '--target-version':
        config.targetVersion = args[++i];
        break;
      case '--claude-model':
        config.claudeModel = args[++i];
        break;
      case '--thinking-effort':
        config.thinkingEffort = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
      default:
        console.error(colorize('red', `[ERROR] Unknown option: ${args[i]}`));
        showHelp();
        process.exit(1);
    }
  }

  return config;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs();
  const pantoumDir = path.resolve(__dirname, '..');

  // Check PANTOUM CLI exists
  const cliPath = path.join(pantoumDir, 'dist', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    console.error(colorize('red', "[ERROR] PANTOUM CLI not found. Run 'npm run build' first."));
    process.exit(1);
  }

  // Find SPFx solutions
  console.log(colorize('blue', 'Discovering SPFx solutions...'));

  let solutions: string[] = [];

  if (config.csvFile) {
    if (!fs.existsSync(config.csvFile)) {
      console.error(colorize('red', `[ERROR] CSV file not found: ${config.csvFile}`));
      process.exit(1);
    }
    console.log(`  Using CSV: ${config.csvFile}`);
    solutions = parseCsvSolutions(config.csvFile);
  } else {
    if (!fs.existsSync(config.solutionsDir)) {
      console.error(colorize('red', `[ERROR] Solutions directory not found: ${config.solutionsDir}`));
      process.exit(1);
    }
    console.log(`  Searching in: ${config.solutionsDir}`);
    solutions = findSpfxSolutions(config.solutionsDir);
  }

  if (solutions.length === 0) {
    console.error(colorize('red', '[ERROR] No SPFx solutions found'));
    process.exit(1);
  }

  // Sort alphabetically for deterministic ordering across runs
  solutions.sort((a, b) => a.localeCompare(b));

  const discoveredCount = solutions.length;
  console.log(colorize('green', `Found ${discoveredCount} SPFx solutions`));

  // Apply limit: select a fixed subset before any other filtering
  if (config.limit > 0 && solutions.length > config.limit) {
    console.log(colorize('blue', `Limit mode: selecting first ${config.limit} of ${solutions.length} (deterministic, alphabetical)`));
    solutions = solutions.slice(0, config.limit);
  }

  // Filter out already processed solutions
  if (!config.includeProcessed) {
    const originalCount = solutions.length;
    solutions = solutions.filter((sol) => !fs.existsSync(path.join(sol, 'pantoum-upgrade.log')));
    const skippedCount = originalCount - solutions.length;
    if (skippedCount > 0) {
      console.log(colorize('yellow', `Skipping ${skippedCount} already processed (have pantoum-upgrade.log)`));
    }
  }

  // Apply batch size limit
  if (config.batchSize > 0 && solutions.length > config.batchSize) {
    console.log(colorize('blue', `Batch mode: limiting to first ${config.batchSize} of ${solutions.length} remaining`));
    solutions = solutions.slice(0, config.batchSize);
  }

  if (solutions.length === 0) {
    console.log(colorize('green', 'All solutions already processed! Use --include-processed to re-run.'));
    process.exit(0);
  }

  console.log(colorize('cyan', `Will process ${solutions.length} solutions`));
  console.log('');

  // Dry run mode
  if (config.dryRun) {
    console.log('');
    console.log(colorize('cyan', '\u2554════════════════════════════════════════════════════════════════\u2557'));
    console.log(colorize('cyan', '\u2551') + '           PANTOUM Parallel Upgrade - DRY RUN               ' + colorize('cyan', '\u2551'));
    console.log(colorize('cyan', '\u255a════════════════════════════════════════════════════════════════\u255d'));
    console.log('');
    console.log('Configuration:');
    console.log(`  Solutions dir:    ${config.solutionsDir}`);
    console.log(`  Target version:   ${config.targetVersion}`);
    console.log(`  Claude model:     ${config.claudeModel}`);
    console.log(`  Parallel slots:   ${config.parallelCount}`);
    console.log(`  Limit:            ${config.limit > 0 ? config.limit : 'all'}`);
    console.log(`  Batch size:       ${config.batchSize > 0 ? config.batchSize : 'unlimited'}`);
    console.log(`  Include processed: ${config.includeProcessed}`);
    console.log('');
    console.log(`Would upgrade ${solutions.length} solutions:`);

    for (const sol of solutions) {
      const solName = path.basename(sol);
      let solVersion = 'unknown';
      try {
        const yoRcPath = path.join(sol, '.yo-rc.json');
        const yoRc = JSON.parse(fs.readFileSync(yoRcPath, 'utf-8'));
        solVersion = yoRc['@microsoft/generator-sharepoint']?.version || 'unknown';
      } catch {
        // Ignore
      }
      console.log(`  - ${solName} ${colorize('dim', `(current: ${solVersion})`)}`);
    }

    console.log('');
    process.exit(0);
  }

  // Run parallel upgrades
  const engine = new ParallelUpgradeEngine(config);
  await engine.run(solutions);
}

main().catch((error) => {
  console.error(colorize('red', `[ERROR] ${error.message}`));
  process.exit(1);
});
