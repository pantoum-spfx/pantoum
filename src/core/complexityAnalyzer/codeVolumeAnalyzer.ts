// src/core/complexityAnalyzer/codeVolumeAnalyzer.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';
import type { CodeVolumeComplexity } from '../../schema/complexityTypes.js';
import { getComplexityLevel } from '../../schema/complexityTypes.js';
import { calculateCodeVolumeScore } from './scoringEngine.js';
import { logger } from '../../utils/logger.js';

interface FileMetrics {
  path: string;
  lines: number;
  size: number;
  isTest: boolean;
}

/**
 * Analyzes code volume and complexity metrics
 */
export class CodeVolumeAnalyzer {
  // File extensions to analyze
  private readonly CODE_EXTENSIONS = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.scss',
    '.css'
    // Removed .json - we'll only include specific JSON files
  ];

  // Patterns to exclude from analysis
  private readonly EXCLUDE_PATTERNS = [
    '**/node_modules/**',
    '**/lib/**',
    '**/dist/**',
    '**/temp/**',
    '**/*.min.js',
    '**/*.bundle.js',
    '**/coverage/**',
    '**/.git/**',
    '**/package-lock.json',
    '**/npm-shrinkwrap.json',
    '**/yarn.lock',
    '**/.yo-rc.json',
    '**/tsconfig.json',
    '**/tslint.json',
    '**/eslintrc.json',
    '**/*.config.json'
  ];

  /**
   * Analyze code volume and metrics for a solution
   */
  async analyzeCodeVolume(
    solutionPath: string,
    options?: { includeTests?: boolean }
  ): Promise<CodeVolumeComplexity> {
    try {
      // Find all source files
      const files = await this.findSourceFiles(solutionPath);

      if (files.length === 0) {
        return this.createLowConfidenceResult();
      }

      // Analyze each file
      const fileMetrics = await Promise.all(
        files.map(file => this.analyzeFile(file, solutionPath))
      );

      // Filter out test files if requested
      const relevantFiles = options?.includeTests
        ? fileMetrics
        : fileMetrics.filter(f => !f.isTest);

      if (relevantFiles.length === 0) {
        return this.createLowConfidenceResult();
      }

      // Calculate aggregate metrics
      const totalFiles = relevantFiles.length;
      const totalLines = relevantFiles.reduce((sum, f) => sum + f.lines, 0);
      const avgFileSize = Math.round(totalLines / totalFiles);

      // Find largest file
      const largestFile = relevantFiles.reduce((largest, current) =>
        current.lines > (largest?.lines || 0) ? current : largest
      );

      // Calculate complexity score
      const score = calculateCodeVolumeScore(totalFiles, totalLines, avgFileSize);
      const level = getComplexityLevel(score);
      const label = this.generateLabel(totalFiles, totalLines, avgFileSize);

      return {
        value: score,
        level,
        label,
        confidence: 1.0,
        totalFiles,
        totalLines,
        avgFileSize,
        largestFile: largestFile ? {
          path: path.relative(solutionPath, largestFile.path),
          lines: largestFile.lines
        } : null
      };
    } catch (error) {
      logger.warn(`Failed to analyze code volume in ${solutionPath}: ${error}`);
      return this.createLowConfidenceResult();
    }
  }

  /**
   * Find all source files in the solution
   */
  private async findSourceFiles(solutionPath: string): Promise<string[]> {
    // For SPFx solutions, focus on src directory
    // Also include config files in the config directory
    const patterns = [
      ...this.CODE_EXTENSIONS.map(ext => `src/**/*${ext}`),
      'config/*.json'  // Only specific config files, not all JSON
    ];

    const files = await fg(patterns, {
      cwd: solutionPath,
      absolute: true,
      ignore: this.EXCLUDE_PATTERNS,
      onlyFiles: true
    });

    return files;
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(
    filePath: string,
    _solutionPath: string
  ): Promise<FileMetrics> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = this.countLines(content);
      const size = Buffer.byteLength(content, 'utf-8');
      const isTest = this.isTestFile(filePath);

      return {
        path: filePath,
        lines,
        size,
        isTest
      };
    } catch (error) {
      // Failed to read file, return minimal metrics
      return {
        path: filePath,
        lines: 0,
        size: 0,
        isTest: false
      };
    }
  }

  /**
   * Count non-empty, non-comment lines in content
   */
  private countLines(content: string): number {
    const lines = content.split('\n');
    let count = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) continue;

      // Skip single-line comments (basic detection)
      if (trimmed.startsWith('//') ||
          trimmed.startsWith('#') ||
          trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
        continue;
      }

      count++;
    }

    return count;
  }

  /**
   * Check if a file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const filename = path.basename(filePath).toLowerCase();

    return (
      filename.includes('.test.') ||
      filename.includes('.spec.') ||
      filename.includes('.tests.') ||
      filename.includes('.specs.') ||
      filePath.includes('/test/') ||
      filePath.includes('/tests/') ||
      filePath.includes('/__tests__/') ||
      filePath.includes('/spec/')
    );
  }

  /**
   * Generate a human-readable label for code volume
   */
  private generateLabel(
    totalFiles: number,
    totalLines: number,
    avgFileSize: number
  ): string {
    const size = this.categorizeSize(totalLines);
    const avgSize = this.categorizeAvgSize(avgFileSize);

    return `${size} solution (${totalFiles.toLocaleString()} files, ${totalLines.toLocaleString()} lines, ${avgSize} avg)`;
  }

  /**
   * Categorize solution size
   */
  private categorizeSize(totalLines: number): string {
    if (totalLines < 1000) return 'Tiny';
    if (totalLines < 5000) return 'Small';
    if (totalLines < 15000) return 'Medium';
    if (totalLines < 50000) return 'Large';
    return 'Very large';
  }

  /**
   * Categorize average file size
   */
  private categorizeAvgSize(avgLines: number): string {
    if (avgLines < 50) return 'tiny files';
    if (avgLines < 150) return 'small files';
    if (avgLines < 300) return 'moderate files';
    if (avgLines < 500) return 'large files';
    return 'very large files';
  }

  /**
   * Create a low-confidence result when analysis fails
   */
  private createLowConfidenceResult(): CodeVolumeComplexity {
    return {
      value: 10,
      level: 'low',
      label: 'Code volume analysis unavailable',
      confidence: 0.3,
      totalFiles: 0,
      totalLines: 0,
      avgFileSize: 0,
      largestFile: null
    };
  }
}