/**
 * Report types for the report viewer
 * Matches the actual PANTOUM report files:
 *   pantoum_metadata_*.json  — main report with patches, summary, AI metrics
 *   patch_status.json        — applied/failed/skipped patch IDs
 *   Pantoum_Upgrade_Report_*.md — markdown report
 */

/** Report summary shown in the list view */
export interface ReportSummary {
  runId: string;
  dirName: string;
  solutionName: string;
  solutionPath: string;
  timestamp: string;
  targetVersion: string;
  status: string;
  totalPatches: number;
  patchesApplied: number;
  buildFixAttempts: number;
  claudeActionsCount: number;
  hasMarkdown: boolean;
}

/** Full report detail (from pantoum_metadata_*.json) */
export interface ReportDetail {
  timestamp: string;
  solutionName: string;
  solutionPath: string;
  targetVersion: string;
  pantoumVersion: string;
  report: {
    patches: ReportPatch[];
    applyResults?: PatchApplyResult[];
    buildErrors?: string[];
    buildFixPatches?: ReportPatch[];
    thirdPartyUpdates?: ThirdPartyUpdates;
    skipped?: boolean;
    skipReason?: string;
  };
  summary: {
    totalPatches: number;
    patchesApplied: number;
    hasM365CliError: boolean;
    hasBuildErrors: boolean;
    buildFixAttempts: number;
    claudeActionsCount: number;
    status: string;
  };
  patchStatus?: {
    applied: string[];
    failed: string[];
    skipped: string[];
  };
  markdown?: string;
}

/** Patch as stored in the report */
export interface ReportPatch {
  id: string;
  title: string;
  description: string;
  type: string;
  file: string;
  stage?: string;
  // Dependency update fields
  depType?: string;
  packageName?: string;
  newVersion?: string;
  // Text snippet fields
  fromLine?: number;
  toLine?: number;
  patchLines?: string[];
  // Claude AI fields
  claudeActions?: ClaudeAction[];
  claudeSummary?: string;
  errorPrompt?: string;
  claudeMetrics?: ClaudeMetrics;
  migrationDetails?: MigrationDetails;
}

interface PatchApplyResult {
  patchId: string;
  success: boolean;
  error?: string;
  message?: string;
}

interface ClaudeAction {
  timestamp: string;
  tool: string;
  action: string;
  target?: string;
  details?: string;
  result?: string;
}

export interface ClaudeMetrics {
  tokens: {
    input: number;
    output: number;
    total: number;
    cacheRead?: number;
    cacheCreation?: number;
  };
  cost: number;
  performance: {
    durationMs: number;
    durationApiMs?: number;
    turns: number;
  };
  toolUsage?: ToolUsageEntry[];
}

interface ToolUsageEntry {
  name: string;
  input?: Record<string, unknown>;
  timestamp?: string;
  durationMs?: number;
  count?: number;
}

interface MigrationDetails {
  filesModified?: string[];
  changes?: string[];
  fromVersion?: string;
  toVersion?: string;
  packageName?: string;
  verification?: {
    status: string;
    iterations?: number;
    totalChecks?: number;
    passedChecks?: number;
    checks?: Array<{
      instruction?: string;
      pattern?: string;
      status: string;
    }>;
  };
}

interface ThirdPartyUpdates {
  totalPackages: number;
  eligiblePackages: number;
  updates: Array<{
    name: string;
    isDevDependency: boolean;
    currentVersion: string;
    latestVersion: string;
  }>;
  skipped: Array<{
    name: string;
    latestVersion: string;
    skipReason: string;
  }>;
  buildErrors?: string[];
  claudeFixes?: number | unknown[];
  finalBuildSuccess?: boolean;
}
