// src/schema/patchSchema.ts

/**
 * Centralized patch stage definitions
 */
const PATCH_STAGES = ['upgrade', 'post-upgrade', 'build-fix', 'self', 'migration'] as const;
type PatchStage = typeof PATCH_STAGES[number];

/**
 * Claude action tracking for audit and reporting
 */
export interface ClaudeAction {
  timestamp: string;
  tool: string;
  action: string;
  target?: string;
  details?: string;
  result?: 'success' | 'error';
}

/**
 * Claude execution metrics for cost and performance tracking
 */
export interface ClaudeMetrics {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalTokens: number;
  costUSD: number;
  durationMs: number;
  durationApiMs?: number;
  turns: number;
  toolExecutions?: Array<{
    name: string;
    input: unknown;
    timestamp: string;
    durationMs?: number;
  }>;
  sessionId?: string;
  model: string;
  errors?: Array<{
    message: string;
    timestamp: string;
  }>;
  permissionDenials?: Array<{
    tool_name: string;
    tool_input: unknown;
  }>;
}

/**
 * Migration verification result (from Claude Self-Verification)
 */
interface MigrationVerification {
  /** Final status: PASSED if all checks verified, FAILED otherwise */
  status: 'PASSED' | 'FAILED';
  /** Number of verification/fix iterations performed */
  iterations: number;
  /** Total checks performed */
  totalChecks: number;
  /** Checks that passed verification */
  passedChecks: number;
  /** Individual check results */
  checks: Array<{
    instruction: string;
    pattern: string;
    status: 'VERIFIED' | 'NOT_VERIFIED';
    /** Remaining file:line locations if NOT_VERIFIED */
    findings?: string[];
  }>;
  /** Issues that remain unfixed after max iterations */
  remainingIssues?: Array<{
    pattern: string;
    locations: string[];
  }>;
}

/**
 * Migration details for third-party package migrations
 */
export interface MigrationDetails {
  filesModified: string[];
  changes: string[];
  fromVersion: string;
  toVersion: string;
  packageName: string;
  timestamp?: string;
  /** Verification results from Claude Self-Verification */
  verification?: MigrationVerification;
  metrics?: {
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
    toolUsage?: Array<{ name: string; input: unknown; timestamp: string; durationMs?: number }>;
    sessionId?: string;
  };
}

/**
 * Base fields carried by every patch, for traceability back to the original report.
 */
interface BasePatch {
  /** The unique id from the upgrade report (e.g. "FN001001") */
  id: string;
  /** The human-readable title from the report */
  title: string;
  /** The human-readable description from the report */
  description: string;
  /** Stage when this patch should be applied */
  stage?: PatchStage;
  /** True if this patch fixes an error */
  isErrorFix?: boolean;
  /** The error message this patch is fixing */
  sourceError?: string;
  /** Migration step name if this patch is part of a migration */
  migrationStep?: string;
}

/**
 * One discrete change to apply to a project.
 *
 * - updateDependency: change an existing dependency’s version in package.json
 * - removeDependency: remove a named dependency from package.json
 * - updateJsonSnippet: apply a JSON snippet to update/merge a JSON file (e.g. tsconfig.json, .yo-rc.json)
 * - runShellCommand:   run an arbitrary shell command (e.g. "npm dedupe")
 * - addFile:           create a new file with given content
 * - removeFile:        delete an existing file
 * - renameFile:        rename or move a file
 * - updateTextSnippet: apply a line-based text patch to a file
 */
export type PatchObject = BasePatch & (
  | {
    type: "updateDependency";
    file: string;                  // path to package.json
    depType: "dependencies" | "devDependencies";
    packageName: string;           // e.g. "@microsoft/sp-core-library"
    newVersion: string;            // e.g. "1.21.1"
  }
  | {
    type: "removeDependency";
    file: string;                  // path to package.json
    depType: "dependencies" | "devDependencies";
    packageName: string;
  }
  | {
    type: "updateJsonSnippet";
    file: string;                  // path to JSON file
    jsonSnippet: object;           // parsed JSON object to merge
  }
  | {
    type: "runShellCommand";
    command: string;               // shell command to run
     file?: string;               // optional file context (not used in this schema)
  }
  | {
    type: "addFile";
    file: string;                  // path of new file
    content: string;               // full file contents
  }
  | {
    type: "removeFile";
    file: string;                  // path of file to delete
  }
  | {
    type: "renameFile";
    file: string;                  // current path
    newFileName: string;           // new path or name
  }
  | {
    type: "updateTextSnippet";
    file: string;
    fromLine: number;              // 1-based start line
    toLine: number;                // 1-based end line
    patchLines: string[];          // replacement lines to insert
  }
  | {
    type: "removeJsonArrayElement";
    file: string;           // e.g. "tsconfig.json"
    // path down into the JSON to find the array:
    jsonPath: string[];     // e.g. ["compilerOptions","types"]
    // the single value you want to delete:
    value: string;
    skipIfMissing?: boolean; // if true, don't throw if the element is not found
  }
  | {
    type: "regexReplace";
    file: string;
    rules: Array<{
      pattern: string;
      replacement: string;
      flags?: string;
    }>;
    postRules?: Array<{
      pattern: string;
      replacement: string;
      flags?: string;
    }>;
    jsonPath?: string[];
    onlyIfContains?: string;
  }
  | {
    type: "claudeActions";
    file: string;                  // context file (e.g. "MIGRATION_SUMMARY.md")
    claudeActions: ClaudeAction[]; // detailed action log
    claudeSummary?: string;        // AI-generated summary of changes
    errorPrompt?: string;          // original error that triggered the fix
    claudeMetrics?: ClaudeMetrics; // execution metrics
    migrationDetails?: MigrationDetails; // third-party migration info
  }
);

/**
 * Wrapper object for LLM output.
 */
interface PatchObjectList {
  patches: PatchObject[];
}