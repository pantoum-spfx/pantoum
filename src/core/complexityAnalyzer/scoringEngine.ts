// src/core/complexityAnalyzer/scoringEngine.ts
import type { ComplexityScore, ComplexityFactors } from '../../schema/complexityTypes.js';
import { getComplexityLevel, getComplexityLabel } from '../../schema/complexityTypes.js';

interface ScoringWeights {
  versionJump: number;
  components: number;
  codeVolume: number;
  productionDeps: number;
  developmentDeps: number;
  customizations?: number;
}

// Default weights for overall complexity calculation
const DEFAULT_WEIGHTS: ScoringWeights = {
  versionJump: 0.30,      // 30% - Most important factor
  components: 0.15,       // 15% - Number and types of components
  codeVolume: 0.20,       // 20% - Size and complexity of codebase
  productionDeps: 0.25,   // 25% - Production dependency staleness
  developmentDeps: 0.10,  // 10% - Dev dependency staleness
  customizations: 0.00    // 0% - Optional, adds to total if present
};

/**
 * Non-linear scoring function using logarithmic curve
 * Provides smooth progression without extreme jumps
 */
function calculateNonLinearScore(
  value: number,
  maxExpectedValue: number,
  steepness: number = 1
): number {
  if (value <= 0) return 0;
  if (maxExpectedValue <= 0) return 0;

  // Normalize to 0-1 range
  const normalized = value / maxExpectedValue;

  // Apply logarithmic curve
  const logScore = Math.log2(normalized * (2 ** steepness) + 1) / steepness;

  // Scale to 0-100
  return Math.min(100, Math.max(0, logScore * 100));
}

/**
 * Calculate version jump complexity score
 */
export function calculateVersionJumpScore(
  majorJumps: number,
  minorJumps: number,
  patchJumps: number
): number {
  // Weight major jumps heavily, minor jumps moderately, patch jumps lightly
  const weightedJumps = majorJumps * 10 + minorJumps * 3 + patchJumps * 0.5;

  // Use non-linear scoring with max expected value of 50 weighted jumps
  return calculateNonLinearScore(weightedJumps, 50, 1.2);
}

/**
 * Calculate component complexity score
 */
export function calculateComponentScore(
  _totalComponents: number,
  webPartCount: number,
  extensionCount: number,
  libraryCount: number,
  adaptiveCardCount: number
): number {
  // Weight different component types differently
  const weightedComponents =
    webPartCount * 1.5 +        // WebParts are more complex
    extensionCount * 1.3 +      // Extensions are moderately complex
    libraryCount * 1.0 +        // Libraries are standard complexity
    adaptiveCardCount * 0.8;    // Adaptive cards are simpler

  // Use non-linear scoring with max expected value of 20 weighted components
  return calculateNonLinearScore(weightedComponents, 20, 1.3);
}

/**
 * Calculate code volume complexity score
 */
export function calculateCodeVolumeScore(
  totalFiles: number,
  totalLines: number,
  avgFileSize: number
): number {
  // Consider both total size and average file complexity
  const sizeScore = calculateNonLinearScore(totalLines, 50000, 1.1); // 50k lines is very large
  const fileCountScore = calculateNonLinearScore(totalFiles, 200, 1.2); // 200 files is large
  const avgSizeScore = calculateNonLinearScore(avgFileSize, 500, 1.5); // 500 lines per file is large

  // Weighted average
  return sizeScore * 0.5 + fileCountScore * 0.3 + avgSizeScore * 0.2;
}

/**
 * Calculate dependency staleness score
 */
export function calculateDependencyScore(
  outdatedCount: number,
  totalPackages: number,
  majorUpdates: number,
  minorUpdates: number,
  patchUpdates: number
): number {
  if (totalPackages === 0) return 0;

  // Calculate outdated percentage
  const outdatedPercentage = (outdatedCount / totalPackages) * 100;

  // Weight update types differently
  const updateSeverity =
    majorUpdates * 5 +      // Major updates are risky
    minorUpdates * 2 +      // Minor updates are moderate risk
    patchUpdates * 0.5;     // Patch updates are low risk

  // Combine percentage and severity
  const percentScore = calculateNonLinearScore(outdatedPercentage, 80, 1.2); // 80% outdated is severe
  const severityScore = calculateNonLinearScore(updateSeverity, 100, 1.3);

  // Weighted average
  return percentScore * 0.4 + severityScore * 0.6;
}

/**
 * Calculate customization complexity score
 */
function calculateCustomizationScore(
  hasCustomWebpack: boolean,
  hasCustomGulp: boolean,
  customBuildSteps: number,
  usesDeprecatedAPIs: boolean
): number {
  let score = 0;

  // Each customization adds to complexity
  if (hasCustomWebpack) score += 30;
  if (hasCustomGulp) score += 25;
  if (usesDeprecatedAPIs) score += 40; // Deprecated APIs are high risk

  // Add score for custom build steps
  score += calculateNonLinearScore(customBuildSteps, 10, 1.5);

  return Math.min(100, score);
}

/**
 * Calculate overall complexity score from all factors
 */
export function calculateOverallScore(
  factors: ComplexityFactors,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ComplexityScore {
  // Normalize weights to ensure they sum to 1
  const totalWeight =
    weights.versionJump +
    weights.components +
    weights.codeVolume +
    weights.productionDeps +
    weights.developmentDeps +
    (weights.customizations || 0);

  const normalizedWeights = {
    versionJump: weights.versionJump / totalWeight,
    components: weights.components / totalWeight,
    codeVolume: weights.codeVolume / totalWeight,
    productionDeps: weights.productionDeps / totalWeight,
    developmentDeps: weights.developmentDeps / totalWeight,
    customizations: (weights.customizations || 0) / totalWeight
  };

  // Calculate weighted score
  let weightedScore =
    factors.versionJump.value * normalizedWeights.versionJump +
    factors.components.value * normalizedWeights.components +
    factors.codeVolume.value * normalizedWeights.codeVolume +
    factors.dependencies.production.value * normalizedWeights.productionDeps +
    factors.dependencies.development.value * normalizedWeights.developmentDeps;

  // Add customizations if present
  if (factors.customizations) {
    weightedScore += factors.customizations.value * normalizedWeights.customizations;
  }

  // Calculate confidence based on data availability
  const confidenceFactors = [
    factors.versionJump.confidence,
    factors.components.confidence,
    factors.codeVolume.confidence,
    factors.dependencies.production.confidence,
    factors.dependencies.development.confidence
  ];

  if (factors.customizations) {
    confidenceFactors.push(factors.customizations.confidence);
  }

  const avgConfidence =
    confidenceFactors.reduce((sum, conf) => sum + conf, 0) / confidenceFactors.length;

  const finalScore = Math.round(weightedScore);
  const level = getComplexityLevel(finalScore);

  return {
    value: finalScore,
    level,
    label: getComplexityLabel(level),
    confidence: avgConfidence
  };
}

/**
 * Generate recommendations based on complexity analysis
 */
export function generateRecommendations(factors: ComplexityFactors): string[] {
  const recommendations: string[] = [];

  // Version jump recommendations
  if (factors.versionJump.value > 70 && factors.versionJump.majorJumps > 0) {
    recommendations.push(
      `Major version jump detected (${factors.versionJump.majorJumps} major version${factors.versionJump.majorJumps > 1 ? 's' : ''}). Consider a phased upgrade approach.`
    );
  } else if (factors.versionJump.value > 40 && factors.versionJump.minorJumps > 0) {
    recommendations.push(
      `Significant version jump. Review breaking changes carefully and allocate extra testing time.`
    );
  }

  // Component recommendations
  if (factors.components.totalComponents > 10) {
    recommendations.push(
      `Solution has ${factors.components.totalComponents} components. Consider testing each component type separately.`
    );
  }

  // Code volume recommendations
  if (factors.codeVolume.totalLines > 10000) {
    recommendations.push(
      `Large codebase (${factors.codeVolume.totalLines.toLocaleString()} lines). Consider code review and refactoring opportunities.`
    );
  }
  if (factors.codeVolume.largestFile &&
      factors.codeVolume.largestFile.lines > 500 &&
      !factors.codeVolume.largestFile.path.includes('package-lock.json') &&
      !factors.codeVolume.largestFile.path.includes('.json')) {
    recommendations.push(
      `Large source file detected (${factors.codeVolume.largestFile.path}: ${factors.codeVolume.largestFile.lines} lines). Consider splitting into smaller modules.`
    );
  }

  // Dependency recommendations
  if (factors.dependencies.production.majorUpdatesNeeded > 5) {
    recommendations.push(
      `${factors.dependencies.production.majorUpdatesNeeded} major dependency updates needed. Update dependencies before SPFx upgrade.`
    );
  }
  if (factors.dependencies.production.outdatedCount > factors.dependencies.production.totalPackages * 0.5) {
    recommendations.push(
      `Over 50% of dependencies are outdated. Consider a dependency audit and gradual update strategy.`
    );
  }

  // PANTOUM settings recommendations based on dependency complexity
  if (factors.dependencies.production.outdatedCount > 0 ||
      (factors.dependencies.development && factors.dependencies.development.outdatedCount > 0)) {

    const prodMajor = factors.dependencies.production.majorUpdatesNeeded;
    const devMajor = factors.dependencies.development?.majorUpdatesNeeded || 0;

    if (prodMajor > 3 || devMajor > 5) {
      recommendations.push(
        `High dependency complexity detected. Consider using 'update_production_deps: patch' and 'update_dev_deps: patch' in PANTOUM settings to minimize risk (faster, uses less AI tokens).`
      );
    } else if (prodMajor > 0 || devMajor > 0) {
      recommendations.push(
        `Moderate dependency updates needed. Consider 'update_production_deps: minor' for balanced safety and updates. Note: Higher update levels increase upgrade time and AI token usage.`
      );
    } else {
      recommendations.push(
        `Dependencies are relatively up-to-date. You can safely use 'update_production_deps: major' if desired, though this will increase processing time and AI token usage.`
      );
    }
  }

  // Customization recommendations
  if (factors.customizations) {
    if (factors.customizations.hasCustomWebpack || factors.customizations.hasCustomGulp) {
      recommendations.push(
        `Custom build configuration detected. Verify compatibility with new SPFx version.`
      );
    }
    if (factors.customizations.usesDeprecatedAPIs) {
      recommendations.push(
        `Deprecated APIs detected. Update to modern alternatives before upgrade.`
      );
    }
  }

  return recommendations;
}

/**
 * Suggest upgrade settings based on complexity
 */
export function suggestUpgradeSettings(overall: ComplexityScore, factors: ComplexityFactors) {
  const settings: any = {};

  // Suggest third-party dependency update strategy
  if (factors.dependencies.production.value < 30) {
    settings.updateThirdPartyDeps = 'major'; // Low risk, can do major updates
  } else if (factors.dependencies.production.value < 60) {
    settings.updateThirdPartyDeps = 'minor'; // Medium risk, stick to minor
  } else {
    settings.updateThirdPartyDeps = 'patch'; // High risk, only patches
  }

  // Dev dependencies are less risky
  if (factors.dependencies.development.value < 50) {
    settings.updateThirdPartyDevDeps = 'patch';
  } else {
    settings.updateThirdPartyDevDeps = 'none';
  }

  // Suggest error fixing based on complexity
  settings.aiFixThirdPartyErrors = overall.value > 30; // Fix errors for complex upgrades

  // Suggest Claude model based on overall complexity
  if (overall.value > 70) {
    settings.claudeModel = 'opus'; // Use most capable model for complex upgrades
  } else if (overall.value > 40) {
    settings.claudeModel = 'sonnet'; // Use balanced model for medium complexity
  } else {
    settings.claudeModel = 'haiku'; // Use fast model for simple upgrades
  }

  return settings;
}