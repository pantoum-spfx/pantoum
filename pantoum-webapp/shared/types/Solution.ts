/**
 * Solution discovery types
 */

export interface SolutionInfo {
  name: string;
  path: string;
  currentVersion: string;
  hasYoRc: boolean;
  hasPackageJson: boolean;
  complexity?: SolutionComplexity;
}

export interface SolutionComplexity {
  score: number;
  label: 'Low' | 'Medium' | 'High' | 'Very High';
  factors: string[];
}

interface ScanRequest {
  rootPath: string;
}

export interface ScanResponse {
  solutions: SolutionInfo[];
  scanDurationMs: number;
}
