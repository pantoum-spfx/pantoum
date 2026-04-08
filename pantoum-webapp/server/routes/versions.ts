import { Router } from 'express';
import { execSync } from 'child_process';

const FALLBACK_VERSIONS = [
  '1.22.1', '1.22.0', '1.21.1', '1.21.0', '1.20.0',
  '1.19.0', '1.18.2', '1.18.1', '1.18.0', '1.17.4',
  '1.17.3', '1.17.2', '1.17.1', '1.17.0',
];

// Cache: versions + timestamp
let versionCache: { versions: string[]; installed: string | null; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const versionsRouter = Router();

/**
 * GET /api/versions - Available SPFx versions from npm
 */
versionsRouter.get('/', (_req, res) => {
  try {
    const now = Date.now();

    // Return cached if fresh
    if (versionCache && (now - versionCache.fetchedAt) < CACHE_TTL_MS) {
      return res.json({
        versions: versionCache.versions,
        installed: versionCache.installed,
        cached: true,
      });
    }

    // Fetch from npm
    const versions = fetchVersions();
    const installed = getInstalledVersion();

    versionCache = { versions, installed, fetchedAt: now };

    res.json({
      versions,
      installed,
      cached: false,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch versions',
      message: error instanceof Error ? error.message : String(error),
      versions: FALLBACK_VERSIONS,
      installed: null,
    });
  }
});

function fetchVersions(): string[] {
  try {
    const output = execSync('npm view @microsoft/generator-sharepoint versions --json', {
      encoding: 'utf-8',
      timeout: 15000,
    });

    const allVersions: string[] = JSON.parse(output);
    return allVersions
      .filter(v => !v.includes('-beta') && !v.includes('-rc') && !v.includes('-alpha'))
      .reverse()
      .slice(0, 20);
  } catch {
    return [...FALLBACK_VERSIONS];
  }
}

function getInstalledVersion(): string | null {
  try {
    const output = execSync('npm list -g --depth=0 @microsoft/generator-sharepoint 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const match = output.match(/@microsoft\/generator-sharepoint@(\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
