// src/schema/manualConfig.ts

export type When = "deterministic" | "post" | "success";

export interface Defaults {
  excludePatchIds?: string[];
  targetVersion?: string;
  onSingleSolutionFail?: 'halt' | 'continue';
  perSolutionReports?: boolean;
  aiFixM365Errors?: boolean;
  aiFixBuildErrors?: boolean;
  claudeModel?: string;
  updateThirdPartyDeps?: 'none' | 'patch' | 'minor' | 'major';
  updateThirdPartyDevDeps?: 'none' | 'patch';
  aiFixThirdPartyErrors?: boolean;
  aiFixEslintProperly?: boolean;
  aiFixTypeScriptWarnings?: boolean;
  cleanInstallAfterDepUpdate?: boolean;
}

// ─────────── Condition Types ───────────

export interface AlwaysCondition {
  type: "always";
}
export interface PackageCondition {
  type: "packageVersion";
  packageName: string;
  comparator: "<" | "<=" | "=" | ">=" | ">";
  version: string;
}
interface InstructionCondition {
  type: "instructionPresent" | "instructionAbsent";
  instructionId: string;  // M365 CLI instruction ID, e.g., "FN015010"
}
interface FileExistsCondition {
  type: "fileExists" | "fileAbsent";
  path: string;  // relative to solution root
}
interface FileContainsCondition {
  type: "fileContains";
  path: string;     // file path or glob pattern
  pattern: string;  // regex pattern
  glob?: boolean;   // if true, path is a glob — match in ANY matching file
}
interface CompoundCondition {
  type: "all" | "any";  // AND / OR
  conditions: Condition[];
}

export type Condition =
  | AlwaysCondition
  | PackageCondition
  | InstructionCondition
  | FileExistsCondition
  | FileContainsCondition
  | CompoundCondition;

/**
 * A "success" step runs a command, scans its stdout/stderr for a regex
 * and optionally invokes your reasoning engine on each match.
 */
export interface SuccessStep {
  id: string;
  enabled?: boolean;
  description: string;
  title?: string;
  when: "success";
  condition: Condition;

  /** the shell command to run (cwd = solution root) */
  runCommand: string;

  /** a JS‐regexp string to match each line of the command's output */
  pattern: string;

  /** whether to invoke LLM-based "reasoning" per match */
  reasoning?: boolean;
}

/**
 * Manual steps that happen during or after the main patching process.
 */
export type ManualStep =
  // ─────────── deterministic or post- patch steps ───────────
  | ({
    // base
    id: string;
    enabled?: boolean;
    description: string;
    title?: string;
    when: "deterministic" | "post";
    condition: Condition;
    file: string;
  } & (
      // dependency‐style
      | {
        type: "updateDependency" | "removeDependency";
        depType: "dependencies" | "devDependencies";
        packageName: string;
        newVersion?: string;
        requiresMigrationAnalysis?: boolean;
        /** Reference to an AI context key in aiContexts for Claude to use */
        aiContext?: string;
      }
      // direct shell commands
      | { type: "runShellCommand"; command: string; file?: string }
      // JSON merges
      | { type: "updateJsonSnippet"; jsonSnippet: object }
      // file operations
      | { type: "addFile"; content: string }
      | { type: "removeFile" }
      | { type: "renameFile"; newFileName: string }
      // in-place text patch
      | {
        type: "updateTextSnippet";
        fromLine: number;
        toLine: number;
        patchLines: string[];
      }
      // remove one element from a JSON array
      | {
        type: "removeJsonArrayElement";
        jsonPath: string[];
        value: string;
        skipIfMissing?: boolean;
      }
      // regex-based text replacement (for gulp-to-heft script translations)
      | {
        type: "regexReplace";
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
        // For JSON files: optional jsonPath to target a specific section
        jsonPath?: string[];
        // Only process values matching this filter
        onlyIfContains?: string;
      }
      // file creation from template (leverages templateLoader.ts)
      | {
        type: "addFileFromTemplate";
        template: string;
        variables?: Record<string, string>;
      }
    ))
  // ─────────── success‐scanning steps ───────────
  | SuccessStep;

// ─────────── AI Context Types ───────────
// These provide context/instructions for Claude AI to perform migrations
export interface AIContext {
  description: string;
  targetVersion: string;
  template?: string;  // Template file name in src/templates/ (e.g. "pnp-v4-migration")
  verificationPatterns?: { pattern: string; description: string }[];
}

/** Version update configuration */
interface VersionUpdateConfig {
  enabled?: boolean;
  updatePackageJson?: boolean;
  updateReadme?: boolean;
  updateBadges?: boolean;
  updateVersionHistory?: boolean;
  versionComment?: string;
  PnPnvmrc?: boolean;
  PnPdevcontainer?: boolean;
}

// ─────────── New Top-Level Config Sections ───────────

/** Filter to exclude or modify specific M365 CLI patches */
export interface PatchFilter {
  id: string;
  description: string;
  targetPatchId: string;
  action: "exclude";
  condition: Condition;
}

/** Fix for invalid versions recommended by M365 CLI */
export interface VersionCorrection {
  packageName: string;
  badVersion: string;
  correctedVersion: string;
  description: string;
}

/** Named detection pattern for config-driven detection */
export interface DetectionPattern {
  name: string;
  pattern: string;
  flags?: string;
}

/** Top‐level config */
export interface ManualConfig {
  defaults?: Defaults;
  manualSteps: ManualStep[];
  /** AI contexts provide instructions for Claude to perform migrations */
  aiContexts?: Record<string, AIContext>;
  versionUpdates?: VersionUpdateConfig;
  // NEW sections:
  patchFilters?: PatchFilter[];
  versionCorrections?: VersionCorrection[];
  detectionPatterns?: Record<string, string[] | DetectionPattern[]>;
  excludedPackages?: string[];
}
