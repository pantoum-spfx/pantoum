/**
 * HistoryService - reads/deletes per-run history files from pantoum_history/
 */

import fs from 'fs';
import path from 'path';
import type { HistoryEntry } from '../../shared/types/History.js';

const HISTORY_DIR = 'pantoum_history';

export class HistoryService {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  private get historyDir(): string {
    return path.join(this.rootPath, HISTORY_DIR);
  }

  listEntries(
    page = 1,
    limit = 20,
    search?: string,
    sortBy: 'timestamp' | 'solutions' | 'run' | 'version' | 'duration' = 'timestamp',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): { entries: HistoryEntry[]; total: number } {
    const dir = this.historyDir;
    if (!fs.existsSync(dir)) {
      return { entries: [], total: 0 };
    }

    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('pantoum_run_') && f.endsWith('.json'));

    // Read all entries (needed for search/sort across full dataset)
    let all: HistoryEntry[] = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        all.push(JSON.parse(content));
      } catch {
        // Skip corrupt files
      }
    }

    // Filter by search term
    if (search) {
      const q = search.toLowerCase();
      all = all.filter((e) =>
        e.runId.toLowerCase().includes(q) ||
        e.targetVersion.toLowerCase().includes(q) ||
        e.solutions.some((s) => s.name.toLowerCase().includes(q)),
      );
    }

    // Sort
    const dir_ = sortOrder === 'asc' ? 1 : -1;
    all.sort((a, b) => {
      switch (sortBy) {
        case 'solutions': {
          const nameA = a.solutions[0]?.name || '';
          const nameB = b.solutions[0]?.name || '';
          return nameA.localeCompare(nameB) * dir_;
        }
        case 'run':
          return a.runId.localeCompare(b.runId) * dir_;
        case 'version':
          return a.targetVersion.localeCompare(b.targetVersion) * dir_;
        case 'duration':
          return (a.durationMs - b.durationMs) * dir_;
        case 'timestamp':
        default:
          return a.timestamp.localeCompare(b.timestamp) * dir_;
      }
    });

    const total = all.length;
    const start = (page - 1) * limit;
    const entries = all.slice(start, start + limit);

    return { entries, total };
  }

  getEntry(runId: string): HistoryEntry | null {
    const filePath = path.join(this.historyDir, `pantoum_run_${runId}.json`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  deleteEntry(runId: string): boolean {
    const filePath = path.join(this.historyDir, `pantoum_run_${runId}.json`);
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  clearAll(): void {
    const dir = this.historyDir;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
  }
}
