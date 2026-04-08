import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import type { ReportSummary, ReportDetail } from '../../shared/types/Report.js';
import { validatePathUnderHome } from '../utils/pathValidation.js';

export const reportsRouter = Router();

/**
 * Find pantoum_metadata_*.json inside a run directory
 */
function findMetadataFile(dirPath: string): string | null {
  try {
    const files = fs.readdirSync(dirPath);
    const metaFile = files.find((f) => f.startsWith('pantoum_metadata_') && f.endsWith('.json'));
    return metaFile ? path.join(dirPath, metaFile) : null;
  } catch {
    return null;
  }
}

/**
 * Find markdown report inside a run directory
 */
function findMarkdownFile(dirPath: string): string | null {
  try {
    const files = fs.readdirSync(dirPath);
    const mdFile = files.find((f) => f.startsWith('Pantoum_Upgrade_Report_') && f.endsWith('.md'));
    return mdFile ? path.join(dirPath, mdFile) : null;
  } catch {
    return null;
  }
}

/**
 * Recursively find all pantoum_run_* directories under a root path (max depth 2)
 */
function findRunDirectories(rootPath: string): Array<{ dirPath: string; dirName: string; solutionDir: string }> {
  const results: Array<{ dirPath: string; dirName: string; solutionDir: string }> = [];

  // Check for run dirs directly under rootPath (per-solution reports)
  try {
    const topEntries = fs.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of topEntries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('pantoum_run_')) {
        // Run dir directly under rootPath (this IS the solution dir)
        results.push({
          dirPath: path.join(rootPath, entry.name),
          dirName: entry.name,
          solutionDir: rootPath,
        });
      } else {
        // Check one level deeper (solution/pantoum_run_*)
        const subDir = path.join(rootPath, entry.name);
        try {
          const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isDirectory() && sub.name.startsWith('pantoum_run_')) {
              results.push({
                dirPath: path.join(subDir, sub.name),
                dirName: sub.name,
                solutionDir: subDir,
              });
            }
          }
        } catch {
          // Skip unreadable dirs
        }
      }
    }
  } catch {
    // Root path not readable
  }

  return results;
}

/**
 * Parse a run directory into a ReportSummary
 */
function parseRunDir(dirPath: string, dirName: string): ReportSummary | null {
  const metaPath = findMetadataFile(dirPath);
  if (!metaPath) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const runId = dirName.replace('pantoum_run_', '');
    const hasMarkdown = findMarkdownFile(dirPath) !== null;

    return {
      runId,
      dirName,
      solutionName: raw.solutionName || 'unknown',
      solutionPath: raw.solutionPath || '',
      timestamp: raw.timestamp || '',
      targetVersion: raw.targetVersion || 'unknown',
      status: raw.summary?.status || 'unknown',
      totalPatches: raw.summary?.totalPatches ?? 0,
      patchesApplied: raw.summary?.patchesApplied ?? 0,
      buildFixAttempts: raw.summary?.buildFixAttempts ?? 0,
      claudeActionsCount: raw.summary?.claudeActionsCount ?? 0,
      hasMarkdown,
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/reports - List all upgrade run reports
 * Query params: rootPath (defaults to cwd)
 */
reportsRouter.get('/', (req, res) => {
  try {
    const rootPath = (req.query.rootPath as string) || process.cwd();

    if (req.query.rootPath) {
      try {
        validatePathUnderHome(rootPath);
      } catch {
        return res.status(400).json({ error: 'rootPath is outside allowed directory' });
      }
    }

    if (!fs.existsSync(rootPath)) {
      return res.json({ reports: [] });
    }

    const runDirs = findRunDirectories(rootPath);
    const reports: ReportSummary[] = [];

    for (const { dirPath, dirName } of runDirs) {
      const summary = parseRunDir(dirPath, dirName);
      if (summary) reports.push(summary);
    }

    // Sort by timestamp descending (most recent first)
    reports.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    res.json({ reports });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list reports',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reports/:runId - Get a specific report's full detail
 * Query params: rootPath, solutionPath (to locate the run dir)
 */
reportsRouter.get('/:runId', (req, res) => {
  try {
    const rootPath = (req.query.rootPath as string) || process.cwd();

    if (req.query.rootPath) {
      try {
        validatePathUnderHome(rootPath);
      } catch {
        return res.status(400).json({ error: 'rootPath is outside allowed directory' });
      }
    }

    const { runId } = req.params;
    const dirName = `pantoum_run_${runId}`;

    // Search for the run directory
    const runDirs = findRunDirectories(rootPath);
    const match = runDirs.find((r) => r.dirName === dirName);

    if (!match) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const metaPath = findMetadataFile(match.dirPath);
    if (!metaPath) {
      return res.status(404).json({ error: 'Metadata file not found in run directory' });
    }

    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    // Read patch_status.json if available
    const patchStatusPath = path.join(match.dirPath, 'patch_status.json');
    let patchStatus = undefined;
    if (fs.existsSync(patchStatusPath)) {
      try {
        patchStatus = JSON.parse(fs.readFileSync(patchStatusPath, 'utf-8'));
      } catch {
        // ignore
      }
    }

    // Read markdown if available
    const mdPath = findMarkdownFile(match.dirPath);
    let markdown = undefined;
    if (mdPath) {
      try {
        markdown = fs.readFileSync(mdPath, 'utf-8');
      } catch {
        // ignore
      }
    }

    const detail: ReportDetail = {
      timestamp: raw.timestamp,
      solutionName: raw.solutionName,
      solutionPath: raw.solutionPath,
      targetVersion: raw.targetVersion,
      pantoumVersion: raw.pantoumVersion,
      report: raw.report,
      summary: raw.summary,
      patchStatus,
      markdown,
    };

    res.json(detail);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load report',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reports/:runId/markdown - Get markdown report as text
 */
reportsRouter.get('/:runId/markdown', (req, res) => {
  try {
    const rootPath = (req.query.rootPath as string) || process.cwd();

    if (req.query.rootPath) {
      try {
        validatePathUnderHome(rootPath);
      } catch {
        return res.status(400).json({ error: 'rootPath is outside allowed directory' });
      }
    }

    const dirName = `pantoum_run_${req.params.runId}`;

    const runDirs = findRunDirectories(rootPath);
    const match = runDirs.find((r) => r.dirName === dirName);

    if (!match) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const mdPath = findMarkdownFile(match.dirPath);
    if (!mdPath) {
      return res.status(404).json({ error: 'Markdown report not found' });
    }

    const markdown = fs.readFileSync(mdPath, 'utf-8');
    res.type('text/markdown').send(markdown);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load markdown report',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
