// src/core/complexityAnalyzer/dependencyAnalyzer.ts
import * as fs from 'fs/promises';
import * as semver from 'semver';
import type { DependencyComplexity } from '../../schema/complexityTypes.js';
import { getComplexityLevel } from '../../schema/complexityTypes.js';
import { calculateDependencyScore } from './scoringEngine.js';
import { NpmRegistryService } from '../npmRegistryService.js';
import { logger } from '../../utils/logger.js';
import { DEFAULTS } from '../../constants.js';
import { loadExcludedPackages } from '../../utils/manualLoader.js';

interface DependencyAnalysis {
  package: string;
  current: string;
  latest: string;
  updateType: 'major' | 'minor' | 'patch' | 'none';
  daysBehind?: number;
  isExcluded: boolean;
}

/**
 * Analyzes npm dependency staleness and complexity
 */
/**
 * Convert glob-style patterns from YAML into RegExp or string matchers.
 */
function patternToMatcher(pattern: string): string | RegExp {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${prefix}`);
  }
  return pattern;
}

export class DependencyAnalyzer {
  private npmRegistry: NpmRegistryService;
  private excludedMatchers: (string | RegExp)[];

  constructor(cacheTTL?: number) {
    this.npmRegistry = new NpmRegistryService(cacheTTL);
    const yamlPatterns = loadExcludedPackages(DEFAULTS.PATCHES_FILE);
    this.excludedMatchers = yamlPatterns.map(patternToMatcher);
  }

  /**
   * Analyze dependencies for complexity
   */
  async analyzeDependencies(
    packageJsonPath: string,
    isDevDependencies: boolean = false
  ): Promise<DependencyComplexity> {
    try {
      const packageJson = await this.readPackageJson(packageJsonPath);
      if (!packageJson) {
        return this.createLowConfidenceResult();
      }

      const deps = isDevDependencies
        ? (packageJson.devDependencies || {})
        : (packageJson.dependencies || {});

      if (Object.keys(deps).length === 0) {
        return this.createEmptyResult();
      }





      // Analyze each dependency
      const analyses = await this.analyzeDependencySet(deps);

      // Calculate metrics
      const metrics = this.calculateMetrics(analyses);

      // Calculate complexity score
      const score = calculateDependencyScore(
        metrics.outdatedCount,
        metrics.totalPackages,
        metrics.majorUpdates,
        metrics.minorUpdates,
        metrics.patchUpdates
      );

      const level = getComplexityLevel(score);
      const label = this.generateLabel(metrics, isDevDependencies);

      // Identify critical packages (non-excluded, major updates needed)
      const criticalPackages = analyses
        .filter(a => !a.isExcluded && a.updateType === 'major')
        .map(a => a.package)
        .slice(0, 5); // Limit to top 5

      return {
        value: score,
        level,
        label,
        confidence: metrics.confidence,
        totalPackages: metrics.totalPackages,
        outdatedCount: metrics.outdatedCount,
        majorUpdatesNeeded: metrics.majorUpdates,
        minorUpdatesNeeded: metrics.minorUpdates,
        patchUpdatesNeeded: metrics.patchUpdates,
        criticalPackages,
        stalenessDetails: analyses
          .filter(a => !a.isExcluded && a.updateType !== 'none')
          .sort((a, b) => {
            // Sort by update type severity, then by days behind
            const severityOrder = { major: 0, minor: 1, patch: 2 };
            const severityDiff = severityOrder[a.updateType as 'major' | 'minor' | 'patch'] - severityOrder[b.updateType as 'major' | 'minor' | 'patch'];
            if (severityDiff !== 0) return severityDiff;
            return (b.daysBehind || 0) - (a.daysBehind || 0);
          })
          // Include all packages for full transparency
          .map(a => ({
            package: a.package,
            current: a.current,
            latest: a.latest,
            updateType: a.updateType as 'major' | 'minor' | 'patch', // Filter ensures no 'none' here
            daysBehind: a.daysBehind
          }))
      };
    } catch (error) {
      logger.warn(`Failed to analyze dependencies: ${error}`);
      return this.createLowConfidenceResult();
    }
  }

  /**
   * Read and parse package.json
   */
  private async readPackageJson(packageJsonPath: string): Promise<any | null> {
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn(`Failed to read package.json: ${error}`);
      return null;
    }
  }

  /**
   * Analyze a set of dependencies
   */
  private async analyzeDependencySet(
    deps: Record<string, string>
  ): Promise<DependencyAnalysis[]> {
    const analyses: DependencyAnalysis[] = [];

    // Process in batches to avoid overwhelming npm registry
    const entries = Object.entries(deps);
    const batchSize = 10;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(([pkg, version]) => this.analyzeSingleDependency(pkg, version))
      );
      analyses.push(...batchResults);
    }

    return analyses;
  }

  /**
   * Analyze a single dependency
   */
  private async analyzeSingleDependency(
    packageName: string,
    currentVersion: string
  ): Promise<DependencyAnalysis> {
    // Check if package should be excluded
    const isExcluded = this.isExcludedPackage(packageName);

    if (isExcluded) {
      return {
        package: packageName,
        current: currentVersion,
        latest: currentVersion,
        updateType: 'none',
        isExcluded: true
      };
    }

    try {
      // Clean current version
      const cleanCurrent = semver.clean(currentVersion.replace(/^[\^~]/, ''));
      if (!cleanCurrent) {
        return {
          package: packageName,
          current: currentVersion,
          latest: currentVersion,
          updateType: 'none',
          isExcluded: false
        };
      }

      // Get latest version
      const latest = await this.npmRegistry.getLatestVersion(packageName);
      if (!latest) {
        return {
          package: packageName,
          current: currentVersion,
          latest: currentVersion,
          updateType: 'none',
          isExcluded: false
        };
      }

      // Determine update type
      const updateType = this.getUpdateType(cleanCurrent, latest);

      // Get days behind (optional)
      const daysBehind = await this.npmRegistry.getDaysBehind(packageName, cleanCurrent);

      return {
        package: packageName,
        current: cleanCurrent,
        latest,
        updateType,
        daysBehind: daysBehind || undefined,
        isExcluded: false
      };
    } catch (error) {
      logger.warn('Failed to analyze dependency %s: %s', packageName, error);
      return {
        package: packageName,
        current: currentVersion,
        latest: currentVersion,
        updateType: 'none',
        isExcluded: false
      };
    }
  }

  /**
   * Check if package should be excluded (SPFx/Microsoft packages)
   * Loads excluded patterns from pantoum.patches.yml (single source of truth)
   */
  private isExcludedPackage(packageName: string): boolean {
    return this.excludedMatchers.some(pattern => {
      if (typeof pattern === 'string') {
        return packageName === pattern;
      }
      return pattern.test(packageName);
    });
  }

  /**
   * Determine update type between versions
   */
  private getUpdateType(
    currentVersion: string,
    latestVersion: string
  ): 'major' | 'minor' | 'patch' | 'none' {
    if (currentVersion === latestVersion) {
      return 'none';
    }

    const diff = semver.diff(currentVersion, latestVersion);

    switch (diff) {
      case 'major':
      case 'premajor':
        return 'major';
      case 'minor':
      case 'preminor':
        return 'minor';
      case 'patch':
      case 'prepatch':
      case 'prerelease':
        return 'patch';
      default:
        return 'none';
    }
  }

  /**
   * Calculate metrics from dependency analyses
   */
  private calculateMetrics(analyses: DependencyAnalysis[]) {
    const nonExcluded = analyses.filter(a => !a.isExcluded);




    const totalPackages = nonExcluded.length;
    const outdated = nonExcluded.filter(a => a.updateType !== 'none');
    const majorUpdates = outdated.filter(a => a.updateType === 'major').length;
    const minorUpdates = outdated.filter(a => a.updateType === 'minor').length;
    const patchUpdates = outdated.filter(a => a.updateType === 'patch').length;

    // Calculate confidence based on successful analyses
    const successfulAnalyses = nonExcluded.filter(a => a.latest !== a.current || a.updateType === 'none');
    const confidence = totalPackages > 0
      ? successfulAnalyses.length / totalPackages
      : 0;

    return {
      totalPackages,
      outdatedCount: outdated.length,
      majorUpdates,
      minorUpdates,
      patchUpdates,
      confidence
    };
  }

  /**
   * Generate a human-readable label
   */
  private generateLabel(
    metrics: {
      totalPackages: number;
      outdatedCount: number;
      majorUpdates: number;
    },
    isDevDependencies: boolean
  ): string {
    const depType = isDevDependencies ? 'dev' : 'production';

    if (metrics.outdatedCount === 0) {
      return `All ${metrics.totalPackages} ${depType} dependencies up to date`;
    }

    const percentage = Math.round((metrics.outdatedCount / metrics.totalPackages) * 100);
    const majorWarning = metrics.majorUpdates > 0
      ? ` (${metrics.majorUpdates} major)`
      : '';

    return `${metrics.outdatedCount}/${metrics.totalPackages} ${depType} deps outdated (${percentage}%)${majorWarning}`;
  }

  /**
   * Create result for no dependencies
   */
  private createEmptyResult(): DependencyComplexity {
    return {
      value: 0,
      level: 'low',
      label: 'No dependencies',
      confidence: 1.0,
      totalPackages: 0,
      outdatedCount: 0,
      majorUpdatesNeeded: 0,
      minorUpdatesNeeded: 0,
      patchUpdatesNeeded: 0,
      criticalPackages: [],
      stalenessDetails: []
    };
  }

  /**
   * Create low-confidence result
   */
  private createLowConfidenceResult(): DependencyComplexity {
    return {
      value: 30,
      level: 'medium',
      label: 'Dependency analysis unavailable',
      confidence: 0.3,
      totalPackages: 0,
      outdatedCount: 0,
      majorUpdatesNeeded: 0,
      minorUpdatesNeeded: 0,
      patchUpdatesNeeded: 0,
      criticalPackages: [],
      stalenessDetails: []
    };
  }
}