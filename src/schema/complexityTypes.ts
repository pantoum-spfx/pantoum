// src/schema/complexityTypes.ts
// Type definitions for SPFx solution complexity analysis

export interface ComplexityScore {
  value: number;           // 0-100
  level: 'low' | 'medium' | 'high' | 'very-high';
  label: string;           // Human-readable label
  confidence: number;      // 0-1, based on data availability
}

export interface VersionJumpComplexity extends ComplexityScore {
  fromVersion: string;
  toVersion: string;
  majorJumps: number;
  minorJumps: number;
  patchJumps: number;
}

export interface ComponentComplexity extends ComplexityScore {
  webPartCount: number;
  extensionCount: number;
  libraryCount: number;
  adaptiveCardCount: number;
  totalComponents: number;
}

export interface CodeVolumeComplexity extends ComplexityScore {
  totalFiles: number;
  totalLines: number;
  avgFileSize: number;
  largestFile: {
    path: string;
    lines: number;
  } | null;
}

export interface DependencyComplexity extends ComplexityScore {
  totalPackages: number;
  outdatedCount: number;
  majorUpdatesNeeded: number;
  minorUpdatesNeeded: number;
  patchUpdatesNeeded: number;
  criticalPackages: string[];
  stalenessDetails: Array<{
    package: string;
    current: string;
    latest: string;
    updateType: 'major' | 'minor' | 'patch';
    daysBehind?: number;
  }>;
}

interface CustomizationComplexity extends ComplexityScore {
  hasCustomWebpack: boolean;
  hasCustomGulp: boolean;
  customBuildSteps: number;
  usesDeprecatedAPIs: boolean;
}

export interface ComplexityFactors {
  versionJump: VersionJumpComplexity;
  components: ComponentComplexity;
  codeVolume: CodeVolumeComplexity;
  dependencies: {
    production: DependencyComplexity;
    development: DependencyComplexity;
  };
  customizations?: CustomizationComplexity;
}

export interface SolutionComplexity {
  solutionPath: string;
  solutionName: string;
  timestamp: Date;
  overall: ComplexityScore;
  factors: ComplexityFactors;
  recommendations: string[];
  suggestedSettings?: {
    updateThirdPartyDeps: 'none' | 'patch' | 'minor' | 'major';
    updateThirdPartyDevDeps: 'none' | 'patch';
    aiFixThirdPartyErrors: boolean;
    claudeModel?: 'haiku' | 'sonnet' | 'opus';
  };
}

export interface ComplexityAnalysisOptions {
  includeDevDependencies?: boolean;
  deepCodeAnalysis?: boolean;
  includeCustomizations?: boolean;
  cacheTTL?: number; // NPM cache TTL in seconds
  verbose?: boolean;
}

export interface PackageVersionInfo {
  name: string;
  current: string;
  latest: string;
  versions: string[];
  time?: Record<string, string>; // version -> release date
  deprecated?: boolean;
}

// Helper function to determine complexity level based on score
export function getComplexityLevel(score: number): 'low' | 'medium' | 'high' | 'very-high' {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'very-high';
}

// Helper function to format complexity label
export function getComplexityLabel(level: 'low' | 'medium' | 'high' | 'very-high'): string {
  const labels = {
    'low': 'Low Complexity',
    'medium': 'Medium Complexity',
    'high': 'High Complexity',
    'very-high': 'Very High Complexity'
  };
  return labels[level];
}