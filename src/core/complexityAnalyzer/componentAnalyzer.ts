// src/core/complexityAnalyzer/componentAnalyzer.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ComponentComplexity } from '../../schema/complexityTypes.js';
import { getComplexityLevel } from '../../schema/complexityTypes.js';
import { calculateComponentScore } from './scoringEngine.js';
import { logger } from '../../utils/logger.js';

interface ConfigJson {
  version?: string;
  bundles?: Record<string, {
    components: Array<{
      entrypoint: string;
      manifest: string;
    }>;
  }>;
  entries?: Array<{
    entry: string;
    manifest: string;
    outputPath: string;
  }>;
  localizedResources?: Record<string, {
    [locale: string]: string;
  }>;
}

interface ComponentManifest {
  id?: string;
  alias?: string;
  componentType?: string;
  extensionType?: string;
  manifestVersion?: number;
  version?: string;
  preconfiguredEntries?: Array<{
    groupId?: string;
    group?: { default: string };
    title?: { default: string };
    description?: { default: string };
    officeFabricIconFontName?: string;
    properties?: Record<string, any>;
  }>;
}

/**
 * Analyzes SPFx solution components and their complexity
 */
export class ComponentAnalyzer {
  /**
   * Analyze components in an SPFx solution
   */
  async analyzeComponents(solutionPath: string): Promise<ComponentComplexity> {
    try {
      // Read config.json
      const configPath = path.join(solutionPath, 'config', 'config.json');
      const configExists = await this.fileExists(configPath);

      if (!configExists) {
        return this.createLowConfidenceResult();
      }

      const configContent = await fs.readFile(configPath, 'utf-8');
      const config: ConfigJson = JSON.parse(configContent);

      // Count different types of components
      const componentCounts = await this.countComponents(solutionPath, config);

      // Calculate complexity score
      const score = calculateComponentScore(
        componentCounts.total,
        componentCounts.webParts,
        componentCounts.extensions,
        componentCounts.libraries,
        componentCounts.adaptiveCards
      );

      const level = getComplexityLevel(score);
      const label = this.generateLabel(componentCounts);

      return {
        value: score,
        level,
        label,
        confidence: 1.0,
        webPartCount: componentCounts.webParts,
        extensionCount: componentCounts.extensions,
        libraryCount: componentCounts.libraries,
        adaptiveCardCount: componentCounts.adaptiveCards,
        totalComponents: componentCounts.total
      };
    } catch (error) {
      logger.warn(`Failed to analyze components in ${solutionPath}: ${error}`);
      return this.createLowConfidenceResult();
    }
  }

  /**
   * Count different types of components
   */
  private async countComponents(
    solutionPath: string,
    config: ConfigJson
  ): Promise<{
    total: number;
    webParts: number;
    extensions: number;
    libraries: number;
    adaptiveCards: number;
  }> {
    const counts = {
      total: 0,
      webParts: 0,
      extensions: 0,
      libraries: 0,
      adaptiveCards: 0
    };

    // Parse bundles from config.json
    if (config.bundles) {
      for (const [_bundleName, bundle] of Object.entries(config.bundles)) {
        if (!bundle.components) continue;

        for (const component of bundle.components) {
          counts.total++;

          // Try to read the manifest to determine type
          const manifestPath = path.join(solutionPath, component.manifest);
          const componentType = await this.getComponentType(manifestPath);

          switch (componentType) {
            case 'WebPart':
              counts.webParts++;
              break;
            case 'Extension':
            case 'ApplicationCustomizer':
            case 'FieldCustomizer':
            case 'CommandSet':
              counts.extensions++;
              break;
            case 'Library':
              counts.libraries++;
              break;
            case 'AdaptiveCardExtension':
              counts.adaptiveCards++;
              break;
            default:
              // Try to infer from entrypoint path
              if (component.entrypoint.includes('WebPart')) {
                counts.webParts++;
              } else if (component.entrypoint.includes('Extension') ||
                         component.entrypoint.includes('Customizer') ||
                         component.entrypoint.includes('CommandSet')) {
                counts.extensions++;
              } else if (component.entrypoint.includes('Library')) {
                counts.libraries++;
              } else if (component.entrypoint.includes('Adaptive')) {
                counts.adaptiveCards++;
              }
          }
        }
      }
    }

    // Also check entries if present (alternative config format)
    if (config.entries && counts.total === 0) {
      for (const entry of config.entries) {
        counts.total++;

        // Infer type from entry path
        if (entry.entry.includes('WebPart')) {
          counts.webParts++;
        } else if (entry.entry.includes('Extension') ||
                   entry.entry.includes('Customizer') ||
                   entry.entry.includes('CommandSet')) {
          counts.extensions++;
        } else if (entry.entry.includes('Library')) {
          counts.libraries++;
        } else if (entry.entry.includes('Adaptive')) {
          counts.adaptiveCards++;
        }
      }
    }

    return counts;
  }

  /**
   * Get component type from manifest file
   */
  private async getComponentType(manifestPath: string): Promise<string | null> {
    try {
      const manifestExists = await this.fileExists(manifestPath);
      if (!manifestExists) return null;

      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      // SPFx manifests allow JS-style // comments — strip them before parsing
      const cleaned = manifestContent.replace(/^\s*\/\/.*$/gm, '');
      const manifest: ComponentManifest = JSON.parse(cleaned);

      // Check componentType field
      if (manifest.componentType) {
        return manifest.componentType;
      }

      // Check extensionType field (for extensions)
      if (manifest.extensionType) {
        return manifest.extensionType;
      }

      // Try to infer from manifest structure
      if (manifest.preconfiguredEntries && manifest.preconfiguredEntries.length > 0) {
        const entry = manifest.preconfiguredEntries[0];
        if (entry.groupId || entry.group) {
          // Likely a web part (has group for toolbox)
          return 'WebPart';
        }
      }

      return null;
    } catch (error) {
      logger.warn('Failed to read or parse manifest: %s', error);
      return null;
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a human-readable label for component counts
   */
  private generateLabel(counts: {
    total: number;
    webParts: number;
    extensions: number;
    libraries: number;
    adaptiveCards: number;
  }): string {
    if (counts.total === 0) {
      return 'No components found';
    }

    const parts: string[] = [];

    if (counts.webParts > 0) {
      parts.push(`${counts.webParts} web part${counts.webParts > 1 ? 's' : ''}`);
    }
    if (counts.extensions > 0) {
      parts.push(`${counts.extensions} extension${counts.extensions > 1 ? 's' : ''}`);
    }
    if (counts.libraries > 0) {
      parts.push(`${counts.libraries} librar${counts.libraries > 1 ? 'ies' : 'y'}`);
    }
    if (counts.adaptiveCards > 0) {
      parts.push(`${counts.adaptiveCards} ACE${counts.adaptiveCards > 1 ? 's' : ''}`);
    }

    if (parts.length === 0) {
      return `${counts.total} component${counts.total > 1 ? 's' : ''}`;
    }

    return parts.join(', ');
  }

  /**
   * Create a low-confidence result when analysis fails
   */
  private createLowConfidenceResult(): ComponentComplexity {
    return {
      value: 10, // Assume minimal complexity
      level: 'low',
      label: 'Component analysis unavailable',
      confidence: 0.3,
      webPartCount: 0,
      extensionCount: 0,
      libraryCount: 0,
      adaptiveCardCount: 0,
      totalComponents: 0
    };
  }
}