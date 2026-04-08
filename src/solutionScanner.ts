// src/solutionScanner.ts
import fg from 'fast-glob';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger.js';
import { DEFAULTS } from './constants.js';

export async function findSpfxSolutions(
  repoRoot: string,
  excludePatterns: string[]
): Promise<string[]> {
  logger.info(`Scanning for SPFx solutions under ${repoRoot}`);

  // 1. Glob for all package.json and .yo-rc.json files, but ignore node_modules/**
  const patterns = ['**/package.json', '**/.yo-rc.json'];
  const entries = await fg(patterns, {
    cwd: repoRoot,
    absolute: true,
    dot: true,
    ignore: ['**/node_modules/**']
  });
  logger.info(`Found ${entries.length} manifest files to inspect`);

  const candidateDirs = new Set<string>();

  for (const entry of entries) {
    let json: any;
    try {
      json = JSON.parse(fs.readFileSync(entry, DEFAULTS.ENCODING));
    } catch (err: any) {
      logger.warn(`Invalid JSON in ${entry}, skipping… (${err.message})`);
      continue;
    }

    const filename = path.basename(entry).toLowerCase();
    const containingDir = path.dirname(entry);

    if (filename === 'package.json') {
      const deps = { ...json.dependencies, ...json.devDependencies };
      const hasSpfxDep = Object.keys(deps || {})
        .some(d => d.startsWith('@microsoft/sp-'));
      if (hasSpfxDep) {
        logger.info(`→ SPFx dependency detected in ${entry}`);
        candidateDirs.add(containingDir);
      }
    } else if (filename === '.yo-rc.json') {
      if (json['@microsoft/generator-sharepoint']) {
        logger.info(`→ .yo-rc.json SharePoint marker in ${entry}`);
        candidateDirs.add(containingDir);
      }
    }
  }

  let solutions = Array.from(candidateDirs);
  logger.info(`Candidate solution dirs before filtering: ${solutions.length}`);

  // 2. Apply include/exclude filters (simple substring match)
  if (excludePatterns.length > 0) {
    const before = solutions.length;
    solutions = solutions.filter(
      sol => !excludePatterns.some(pat => sol.includes(pat))
    );
    logger.info(`Filtered out ${before - solutions.length} dirs via excludePatterns`);
  }

  logger.info(`🏁 Returning ${solutions.length} SPFx solution(s)`);
  return solutions;
}