import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SolutionInfo, SolutionComplexity, ScanResponse } from '../../shared/types/Solution.js';
import { validatePathUnderHome } from '../utils/pathValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORE_ROOT = path.resolve(__dirname, '../../..');

export const solutionsRouter = Router();

/**
 * POST /api/solutions/browse - Open native OS folder picker
 */
solutionsRouter.post('/browse', (_req, res) => {
  try {
    let folderPath: string | null = null;

    if (process.platform === 'darwin') {
      const result = execSync(
        `osascript -e 'POSIX path of (choose folder with prompt "Select SPFx project root")'`,
        { encoding: 'utf-8', timeout: 60000 },
      ).trim();
      folderPath = result;
    } else if (process.platform === 'linux') {
      const result = execSync(
        'zenity --file-selection --directory --title="Select SPFx project root" 2>/dev/null',
        { encoding: 'utf-8', timeout: 60000 },
      ).trim();
      folderPath = result;
    } else if (process.platform === 'win32') {
      const psCmd = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select SPFx project root'; if($f.ShowDialog() -eq 'OK'){$f.SelectedPath}`;
      const result = execSync(`powershell -Command "${psCmd}"`, {
        encoding: 'utf-8',
        timeout: 60000,
      }).trim();
      folderPath = result;
    }

    if (folderPath && fs.existsSync(folderPath)) {
      res.json({ path: folderPath });
    } else {
      res.json({ path: null, cancelled: true });
    }
  } catch {
    // User cancelled the dialog or command failed
    res.json({ path: null, cancelled: true });
  }
});

/**
 * POST /api/solutions/scan - Scan a directory for SPFx solutions
 */
solutionsRouter.post('/scan', (req, res) => {
  try {
    const { rootPath } = req.body as { rootPath: string };

    if (!rootPath || typeof rootPath !== 'string') {
      return res.status(400).json({ error: 'rootPath is required' });
    }

    try {
      validatePathUnderHome(rootPath);
    } catch {
      return res.status(400).json({ error: 'rootPath is outside allowed directory' });
    }

    if (!fs.existsSync(rootPath)) {
      return res.status(400).json({ error: `Directory not found: ${rootPath}` });
    }

    const startTime = Date.now();
    const solutions = scanForSolutions(rootPath);

    const response: ScanResponse = {
      solutions,
      scanDurationMs: Date.now() - startTime,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to scan for solutions',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/solutions/analyze - Run complexity analysis on solutions
 *
 * Dynamically imports the core ComplexityAnalyzer and runs it on
 * the provided solutions. Returns simplified complexity data for badges.
 */
solutionsRouter.post('/analyze', async (req, res) => {
  try {
    const { solutions, targetVersion, includeDevDeps } = req.body as {
      solutions: Array<{ path: string; currentVersion: string }>;
      targetVersion: string;
      includeDevDeps?: boolean;
    };

    if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
      return res.status(400).json({ error: 'solutions array is required' });
    }
    if (!targetVersion || typeof targetVersion !== 'string') {
      return res.status(400).json({ error: 'targetVersion is required' });
    }

    // Validate all solution paths
    for (const s of solutions) {
      try {
        validatePathUnderHome(s.path);
      } catch {
        return res.status(400).json({ error: `Solution path outside allowed directory: ${s.path}` });
      }
    }

    // Dynamic import of core ComplexityAnalyzer (same pattern as UpgradeOrchestrator)
    const analyzerMod = await import(
      /* @vite-ignore */ path.join(CORE_ROOT, 'src/core/complexityAnalyzer/index.js')
    );
    const analyzer = new analyzerMod.ComplexityAnalyzer();

    const startTime = Date.now();
    const results: Record<string, SolutionComplexity> = {};

    // Analyze all solutions (batched internally by the analyzer)
    const solInputs = solutions.map((s) => ({
      path: s.path,
      currentVersion: s.currentVersion,
      targetVersion,
    }));
    const complexityMap = await analyzer.analyzeSolutions(solInputs, {
      includeDevDependencies: includeDevDeps ?? false,
    });

    // Map the detailed core types to the simplified webapp SolutionComplexity
    for (const [solPath, detail] of complexityMap.entries()) {
      const levelMap: Record<string, 'Low' | 'Medium' | 'High' | 'Very High'> = {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        'very-high': 'Very High',
      };
      results[solPath] = {
        score: detail.overall.value,
        label: levelMap[detail.overall.level] ?? 'Medium',
        factors: detail.recommendations.slice(0, 5), // Top 5 recommendations as factors
      };
    }

    res.json({
      results,
      analysisDurationMs: Date.now() - startTime,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Complexity analysis failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Scan directory for SPFx solutions (looks for .yo-rc.json with SPFx generator)
 */
function scanForSolutions(rootPath: string, maxDepth = 3): SolutionInfo[] {
  const solutions: SolutionInfo[] = [];
  scanDir(rootPath, 0, maxDepth, solutions);
  return solutions;
}

function scanDir(dir: string, depth: number, maxDepth: number, results: SolutionInfo[]): void {
  if (depth > maxDepth) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Check if this directory is an SPFx solution
    const hasYoRc = entries.some(e => e.name === '.yo-rc.json' && e.isFile());
    const hasPackageJson = entries.some(e => e.name === 'package.json' && e.isFile());

    if (hasYoRc) {
      const yoRcPath = path.join(dir, '.yo-rc.json');
      try {
        const yoRcContent = JSON.parse(fs.readFileSync(yoRcPath, 'utf-8'));
        if (yoRcContent['@microsoft/generator-sharepoint']) {
          const spfxConfig = yoRcContent['@microsoft/generator-sharepoint'];
          const currentVersion = detectCurrentVersion(dir, spfxConfig);

          results.push({
            name: path.basename(dir),
            path: dir,
            currentVersion,
            hasYoRc: true,
            hasPackageJson,
          });
          return; // Don't scan subdirectories of a solution
        }
      } catch {
        // Invalid .yo-rc.json, skip
      }
    }

    // Recurse into subdirectories (skip common non-solution dirs)
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'lib', 'temp', '.heft', 'coverage']);
    for (const entry of entries) {
      if (entry.isDirectory() && !skipDirs.has(entry.name) && !entry.name.startsWith('.')) {
        scanDir(path.join(dir, entry.name), depth + 1, maxDepth, results);
      }
    }
  } catch {
    // Permission error or similar, skip
  }
}

function detectCurrentVersion(solutionDir: string, spfxConfig: Record<string, unknown>): string {
  // Try .yo-rc.json version first
  if (spfxConfig.version && typeof spfxConfig.version === 'string') {
    return spfxConfig.version;
  }

  // Try package.json @microsoft/sp-core-library
  try {
    const pkgPath = path.join(solutionDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const spCoreDep = deps['@microsoft/sp-core-library'];
      if (spCoreDep) {
        // Strip semver range chars
        return spCoreDep.replace(/^[~^>=<]+/, '');
      }
    }
  } catch {
    // Fall through
  }

  return 'unknown';
}
