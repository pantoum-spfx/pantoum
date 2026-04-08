// src/core/complexityAnalyzer/index.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  SolutionComplexity,
  ComplexityAnalysisOptions,
  ComplexityFactors
} from '../../schema/complexityTypes.js';
import { VersionJumpAnalyzer } from './versionJumpAnalyzer.js';
import { ComponentAnalyzer } from './componentAnalyzer.js';
import { CodeVolumeAnalyzer } from './codeVolumeAnalyzer.js';
import { DependencyAnalyzer } from './dependencyAnalyzer.js';
import {
  calculateOverallScore,
  generateRecommendations,
  suggestUpgradeSettings
} from './scoringEngine.js';
import { logger } from '../../utils/logger.js';

/**
 * Main orchestrator for SPFx solution complexity analysis
 */
export class ComplexityAnalyzer {
  private versionAnalyzer: VersionJumpAnalyzer;
  private componentAnalyzer: ComponentAnalyzer;
  private codeAnalyzer: CodeVolumeAnalyzer;
  private dependencyAnalyzer: DependencyAnalyzer;
  private cache: Map<string, SolutionComplexity>;

  constructor(options?: { cacheTTL?: number }) {
    this.versionAnalyzer = new VersionJumpAnalyzer();
    this.componentAnalyzer = new ComponentAnalyzer();
    this.codeAnalyzer = new CodeVolumeAnalyzer();
    this.dependencyAnalyzer = new DependencyAnalyzer(options?.cacheTTL);
    this.cache = new Map();
  }

  /**
   * Analyze a solution's complexity
   */
  async analyzeSolution(
    solutionPath: string,
    currentVersion: string,
    targetVersion: string,
    options?: ComplexityAnalysisOptions
  ): Promise<SolutionComplexity> {
    // Check cache first
    const cacheKey = `${solutionPath}:${currentVersion}:${targetVersion}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    try {
      logger.info(`Analyzing complexity for ${solutionPath}`);

      // Ensure solution exists
      const solutionExists = await this.verifySolutionPath(solutionPath);
      if (!solutionExists) {
        throw new Error(`Solution path does not exist: ${solutionPath}`);
      }

      // Get solution name
      const solutionName = await this.getSolutionName(solutionPath);

      // Run all analyzers in parallel
      const [
        versionJump,
        components,
        codeVolume,
        prodDeps,
        devDeps
      ] = await Promise.all([
        // Version jump analysis
        this.versionAnalyzer.analyzeVersionJump(currentVersion, targetVersion),

        // Component analysis
        this.componentAnalyzer.analyzeComponents(solutionPath),

        // Code volume analysis
        this.codeAnalyzer.analyzeCodeVolume(solutionPath, {
          includeTests: false
        }),

        // Production dependencies
        this.dependencyAnalyzer.analyzeDependencies(
          path.join(solutionPath, 'package.json'),
          false
        ),

        // Development dependencies
        options?.includeDevDependencies === true
          ? this.dependencyAnalyzer.analyzeDependencies(
              path.join(solutionPath, 'package.json'),
              true
            )
          : this.createEmptyDependencyResult()
      ]);

      // Combine all factors
      const factors: ComplexityFactors = {
        versionJump,
        components,
        codeVolume,
        dependencies: {
          production: prodDeps,
          development: devDeps
        }
        // customizations
      };

      // Calculate overall score
      const overall = calculateOverallScore(factors);

      // Generate recommendations
      const recommendations = generateRecommendations(factors);

      // Suggest settings
      const suggestedSettings = suggestUpgradeSettings(overall, factors);

      // Create final result
      const result: SolutionComplexity = {
        solutionPath,
        solutionName,
        timestamp: new Date(),
        overall,
        factors,
        recommendations,
        suggestedSettings
      };

      // Cache the result
      this.cache.set(cacheKey, result);

      logger.info(`Complexity analysis complete: ${overall.level} (${overall.value}/100)`);

      return result;
    } catch (error) {
      logger.error(`Failed to analyze solution complexity: ${error}`);
      throw error;
    }
  }

  /**
   * Analyze multiple solutions
   */
  async analyzeSolutions(
    solutions: Array<{
      path: string;
      currentVersion: string;
      targetVersion: string;
    }>,
    options?: ComplexityAnalysisOptions
  ): Promise<Map<string, SolutionComplexity>> {
    const results = new Map<string, SolutionComplexity>();

    // Analyze in batches to avoid overwhelming the system
    const batchSize = 3;
    for (let i = 0; i < solutions.length; i += batchSize) {
      const batch = solutions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(sol =>
          this.analyzeSolution(
            sol.path,
            sol.currentVersion,
            sol.targetVersion,
            options
          )
        )
      );

      batch.forEach((sol, index) => {
        results.set(sol.path, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Verify solution path exists and contains package.json
   */
  private async verifySolutionPath(solutionPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(solutionPath);
      if (!stats.isDirectory()) return false;

      // Check for package.json
      const packageJsonPath = path.join(solutionPath, 'package.json');
      await fs.access(packageJsonPath);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get solution name from package.json
   */
  private async getSolutionName(solutionPath: string): Promise<string> {
    try {
      const packageJsonPath = path.join(solutionPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      return packageJson.name || path.basename(solutionPath);
    } catch {
      return path.basename(solutionPath);
    }
  }

  /**
   * Create empty dependency result for when dev deps are skipped
   */
  private createEmptyDependencyResult() {
    return {
      value: 0,
      level: 'low' as const,
      label: 'Not analyzed',
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
   * Check if cached result is still valid
   */
  private isCacheValid(cached: SolutionComplexity): boolean {
    const cacheAge = Date.now() - cached.timestamp.getTime();
    const maxAge = 3600000; // 1 hour
    return cacheAge < maxAge;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Types available directly from '../../schema/complexityTypes.js'