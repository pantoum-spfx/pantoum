/**
 * History Writer - writes per-run history files to pantoum_history/
 *
 * Each upgrade run creates a separate JSON file:
 *   pantoum_history/pantoum_run_{runId}.json
 *
 * The filename matches the run directory name exactly, so humans can
 * trivially match history entries to their run output directories.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { HistoryEntry } from '../schema/historyTypes.js';

const HISTORY_DIR = 'pantoum_history';

export function writeHistoryEntry(repoRoot: string, entry: HistoryEntry): void {
  const dir = path.join(repoRoot, HISTORY_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `pantoum_run_${entry.runId}.json`);
  // Atomic write: write to .tmp then rename
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(entry, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}
