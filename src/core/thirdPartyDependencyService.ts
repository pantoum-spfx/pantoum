// src/core/thirdPartyDependencyService.ts
import * as fs from 'fs/promises';
import * as semver from 'semver';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import type { ThirdPartyUpdate, ThirdPartyReport } from '../schema/thirdPartySchema.js';
import type { PatchObject } from '../schema/patchSchema.js';
import { TIMEOUTS, DEFAULTS } from '../constants.js';
import { loadExcludedPackages } from '../utils/manualLoader.js';

/**
 * Convert glob-style patterns from YAML into RegExp or string matchers.
 * Patterns like "@microsoft/*" become /^@microsoft\//, "gulp-*" becomes /^gulp-/.
 */
function patternToMatcher(pattern: string): string | RegExp {
  if (pattern.endsWith('*')) {
    // Convert glob wildcard to regex
    const prefix = pattern.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${prefix}`);
  }
  return pattern;
}

/**
 * Service for managing third-party (non-SPFx) dependency updates
 */
export class ThirdPartyDependencyService {
  /**
   * Excluded packages loaded from pantoum.patches.yml (single source of truth)
   */
  private readonly EXCLUDED_PACKAGES: (string | RegExp)[];

  constructor() {
    const yamlPatterns = loadExcludedPackages(DEFAULTS.PATCHES_FILE);
    this.EXCLUDED_PACKAGES = yamlPatterns.map(patternToMatcher);
  }

  /**
   * Analyze package.json and identify packages eligible for update
   */
  async analyzeDependencies(
    packageJsonPath: string,
    depStrategy: 'none' | 'patch' | 'minor' | 'major',
    devDepStrategy: 'none' | 'patch' | 'minor' | 'major'
  ): Promise<ThirdPartyUpdate[]> {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const updates: ThirdPartyUpdate[] = [];
    
    const totalDeps = Object.keys(packageJson.dependencies || {}).length;
    const totalDevDeps = Object.keys(packageJson.devDependencies || {}).length;
    
    logger.info(`   → Analyzing ${totalDeps} dependencies and ${totalDevDeps} devDependencies...`);
    
    // Analyze regular dependencies
    if (depStrategy !== 'none' && packageJson.dependencies) {
      for (const [name, currentVersion] of Object.entries(packageJson.dependencies)) {
        if (!this.isExcluded(name)) {
          const latestVersion = await this.fetchLatestVersion(name, currentVersion as string, depStrategy);
          if (latestVersion && latestVersion !== currentVersion) {
            const updateType = this.getUpdateType(currentVersion as string, latestVersion);
            
            // Skip if update type exceeds strategy
            if (this.shouldSkipUpdate(updateType, depStrategy)) {
              updates.push({
                name,
                currentVersion: currentVersion as string,
                latestVersion,
                updateType,
                isDevDependency: false,
                skipped: true,
                skipReason: `${updateType} update exceeds ${depStrategy} strategy`
              });
            } else {
              updates.push({
                name,
                currentVersion: currentVersion as string,
                latestVersion,
                updateType,
                isDevDependency: false
              });
            }
          }
        }
      }
    }
    
    // Analyze devDependencies (more conservative)
    if (devDepStrategy !== 'none' && packageJson.devDependencies) {
      for (const [name, currentVersion] of Object.entries(packageJson.devDependencies)) {
        // Extra conservative for @types packages
        if (!this.isExcluded(name) && !name.startsWith('@types/')) {
          const latestVersion = await this.fetchLatestVersion(name, currentVersion as string, devDepStrategy);
          if (latestVersion && latestVersion !== currentVersion) {
            const updateType = this.getUpdateType(currentVersion as string, latestVersion);
            
            // Skip if update type exceeds strategy
            if (this.shouldSkipUpdate(updateType, devDepStrategy)) {
              updates.push({
                name,
                currentVersion: currentVersion as string,
                latestVersion,
                updateType,
                isDevDependency: true,
                skipped: true,
                skipReason: `${updateType} update exceeds ${devDepStrategy} strategy`
              });
            } else {
              updates.push({
                name,
                currentVersion: currentVersion as string,
                latestVersion,
                updateType,
                isDevDependency: true
              });
            }
          }
        }
      }
    }
    
    const eligibleCount = updates.filter(u => !u.skipped).length;
    const totalPackages = totalDeps + totalDevDeps;
    
    logger.info(`   → Found ${eligibleCount} packages eligible for update (out of ${totalPackages} total)`);
    
    return updates;
  }

  /**
   * Generate patch objects for the updates
   */
  async generateUpdatePatches(updates: ThirdPartyUpdate[]): Promise<PatchObject[]> {
    const patches: PatchObject[] = [];
    
    for (const update of updates.filter(u => !u.skipped)) {
      patches.push({
        id: `third-party-update-${update.name}`,
        type: 'updateDependency',
        title: `Update ${update.name} from ${update.currentVersion} to ${update.latestVersion}`,
        description: `Third-party ${update.updateType} update for ${update.name}`,
        file: 'package.json',
        packageName: update.name,
        newVersion: update.latestVersion,
        depType: update.isDevDependency ? 'devDependencies' : 'dependencies'
      });
    }
    
    return patches;
  }

  /**
   * Check if a package should be excluded from updates
   */
  private isExcluded(packageName: string): boolean {
    return this.EXCLUDED_PACKAGES.some(pattern => {
      if (typeof pattern === 'string') {
        return packageName === pattern;
      }
      return pattern.test(packageName);
    });
  }

  /**
   * Fetch the latest version of a package from npm registry
   */
  private async fetchLatestVersion(
    packageName: string, 
    currentVersion: string,
    strategy: 'patch' | 'minor' | 'major'
  ): Promise<string | null> {
    try {
      // Clean the current version (remove ^, ~, etc.)
      const cleanCurrent = semver.clean(currentVersion.replace(/^[\^~]/, ''));
      if (!cleanCurrent) {
        // Skip unparseable versions
        return null;
      }

      // Get package info from npm
      const { stdout } = await execa('npm', ['view', packageName, 'versions', '--json'], {
        timeout: TIMEOUTS.THIRD_PARTY_TIMEOUT
      });
      
      const versions = JSON.parse(stdout);
      if (!Array.isArray(versions) || versions.length === 0) {
        return null;
      }

      // Filter versions based on strategy
      let targetVersion: string | null = null;
      
      switch (strategy) {
        case 'patch':
          // Get latest patch version within same minor
          targetVersion = semver.maxSatisfying(versions, `~${cleanCurrent}`);
          break;
        case 'minor':
          // Get latest minor version within same major
          targetVersion = semver.maxSatisfying(versions, `^${cleanCurrent}`);
          break;
        case 'major':
          // Get absolute latest stable version
          targetVersion = semver.maxSatisfying(versions, '*', {
            includePrerelease: false
          });
          break;
      }

      // Only return if it's actually newer
      if (targetVersion && semver.gt(targetVersion, cleanCurrent)) {
        return targetVersion;
      }
      
      return null;
    } catch (error) {
      logger.warn('   → Failed to fetch latest version for %s: %s', packageName, error);
      return null;
    }
  }

  /**
   * Determine the type of update (patch, minor, major)
   */
  private getUpdateType(currentVersion: string, newVersion: string): 'patch' | 'minor' | 'major' {
    const current = semver.clean(currentVersion.replace(/^[\^~]/, ''));
    const next = semver.clean(newVersion.replace(/^[\^~]/, ''));
    
    if (!current || !next) {
      return 'major'; // Conservative default
    }

    const diff = semver.diff(current, next);
    
    switch (diff) {
      case 'patch':
      case 'prepatch':
        return 'patch';
      case 'minor':
      case 'preminor':
        return 'minor';
      default:
        return 'major';
    }
  }

  /**
   * Check if an update should be skipped based on strategy
   */
  private shouldSkipUpdate(
    updateType: 'patch' | 'minor' | 'major',
    strategy: 'patch' | 'minor' | 'major'
  ): boolean {
    const strategyLevel = { patch: 0, minor: 1, major: 2 };
    return strategyLevel[updateType] > strategyLevel[strategy];
  }

  /**
   * Create a summary report of the updates
   */
  createReport(
    updates: ThirdPartyUpdate[],
    patches: PatchObject[],
    buildErrors: string[],
    claudeFixes: PatchObject[],
    finalBuildSuccess: boolean,
    totalPackages: number
  ): ThirdPartyReport {
    const applied = updates.filter(u => !u.skipped);
    const skipped = updates.filter(u => u.skipped);
    
    return {
      eligiblePackages: applied.length,
      totalPackages,
      updates: applied,
      skipped,
      patches,
      buildErrors,
      claudeFixes,
      finalBuildSuccess,
      finalBuildErrors: finalBuildSuccess ? [] : buildErrors
    };
  }
}