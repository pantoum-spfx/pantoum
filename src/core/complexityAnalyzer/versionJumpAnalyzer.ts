// src/core/complexityAnalyzer/versionJumpAnalyzer.ts
import * as semver from 'semver';
import type { VersionJumpComplexity } from '../../schema/complexityTypes.js';
import { getComplexityLevel } from '../../schema/complexityTypes.js';
import { calculateVersionJumpScore } from './scoringEngine.js';
import { logger } from '../../utils/logger.js';

/**
 * Analyzes the complexity of jumping between SPFx versions
 */
export class VersionJumpAnalyzer {
  /**
   * Calculate the complexity of upgrading from one SPFx version to another
   */
  analyzeVersionJump(
    fromVersion: string,
    toVersion: string
  ): VersionJumpComplexity {
    // Clean and validate versions
    const cleanFrom = this.cleanVersion(fromVersion);
    const cleanTo = this.cleanVersion(toVersion);

    if (!cleanFrom || !cleanTo) {
      logger.warn(`Invalid versions for jump analysis: ${fromVersion} -> ${toVersion}`);
      return this.createLowConfidenceResult(fromVersion, toVersion);
    }

    // Calculate version differences
    const { major, minor, patch } = this.calculateVersionDifference(cleanFrom, cleanTo);

    // If downgrading or same version, return minimal complexity
    if (major < 0 || (major === 0 && minor < 0) || (major === 0 && minor === 0 && patch <= 0)) {
      return this.createMinimalComplexityResult(fromVersion, toVersion);
    }

    // Calculate complexity score
    const score = calculateVersionJumpScore(major, minor, patch);
    const level = getComplexityLevel(score);

    // Generate descriptive label
    const label = this.generateLabel(major, minor, patch);

    return {
      value: score,
      level,
      label,
      confidence: 1.0, // High confidence since we have valid versions
      fromVersion,
      toVersion,
      majorJumps: major,
      minorJumps: minor,
      patchJumps: patch
    };
  }

  /**
   * Calculate version difference between two semver versions
   */
  private calculateVersionDifference(
    fromVersion: string,
    toVersion: string
  ): { major: number; minor: number; patch: number } {
    const from = semver.parse(fromVersion);
    const to = semver.parse(toVersion);

    if (!from || !to) {
      return { major: 0, minor: 0, patch: 0 };
    }

    let major = to.major - from.major;
    let minor = to.minor - from.minor;
    let patch = to.patch - from.patch;

    // Adjust for negative minor/patch when major changes
    if (major > 0) {
      // When major version increases, minor and patch differences are less relevant
      if (minor < 0) {
        minor = to.minor; // Count all minor versions in new major
      }
      if (patch < 0) {
        patch = to.patch; // Count all patch versions in new version
      }
    } else if (minor > 0) {
      // When minor version increases, patch differences are less relevant
      if (patch < 0) {
        patch = to.patch; // Count all patch versions in new minor
      }
    }

    return {
      major: Math.max(0, major),
      minor: Math.max(0, minor),
      patch: Math.max(0, patch)
    };
  }

  /**
   * Clean and validate a version string
   */
  private cleanVersion(version: string): string | null {
    if (!version) return null;

    // Remove common prefixes
    let cleaned = version.replace(/^v/i, '').trim();

    // Handle 'latest' or other keywords by returning null
    if (!cleaned.match(/^\d+\.\d+/)) {
      return null;
    }

    // Ensure it's a valid semver
    const parsed = semver.parse(cleaned);
    if (!parsed) {
      // Try to coerce it
      const coerced = semver.coerce(cleaned);
      if (!coerced) return null;
      return coerced.version;
    }

    return parsed.version;
  }

  /**
   * Generate a human-readable label for the version jump
   */
  private generateLabel(major: number, minor: number, patch: number): string {
    // For SPFx, minor versions are the main releases (1.18, 1.19, etc.)
    // Major versions rarely change (still on 1.x)

    if (major > 0) {
      // This would be a huge jump (like SPFx 1.x to 2.x)
      return `Major SPFx upgrade (${major} major version jump)`;
    }

    if (minor > 0) {
      // This is the typical SPFx upgrade (1.18 to 1.19, etc.)
      return `Upgrading ${minor} SPFx version${minor > 1 ? 's' : ''}`;
    }

    if (patch > 0) {
      // Patch versions in SPFx (1.18.0 to 1.18.1)
      return `Patch upgrade (${patch} patch${patch > 1 ? 'es' : ''})`;
    }

    return 'Same version';
  }

  /**
   * Create a low-confidence result when versions can't be parsed
   */
  private createLowConfidenceResult(
    fromVersion: string,
    toVersion: string
  ): VersionJumpComplexity {
    return {
      value: 50, // Assume medium complexity when unknown
      level: 'medium',
      label: 'Version jump complexity unknown',
      confidence: 0.3, // Low confidence
      fromVersion,
      toVersion,
      majorJumps: 0,
      minorJumps: 0,
      patchJumps: 0
    };
  }

  /**
   * Create a minimal complexity result for same/downgrade scenarios
   */
  private createMinimalComplexityResult(
    fromVersion: string,
    toVersion: string
  ): VersionJumpComplexity {
    return {
      value: 0,
      level: 'low',
      label: 'No upgrade needed',
      confidence: 1.0,
      fromVersion,
      toVersion,
      majorJumps: 0,
      minorJumps: 0,
      patchJumps: 0
    };
  }

}