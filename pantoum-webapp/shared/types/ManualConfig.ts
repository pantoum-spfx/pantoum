/**
 * Manual config types for the Patch Designer — mirrors src/schema/manualConfig.ts
 */

export type When = 'deterministic' | 'post' | 'success';

// ─────────── Condition Types ───────────

interface AlwaysCondition {
  type: 'always';
}

interface PackageCondition {
  type: 'packageVersion';
  packageName: string;
  comparator: '<' | '<=' | '=' | '>=' | '>';
  version: string;
}

interface InstructionCondition {
  type: 'instructionPresent' | 'instructionAbsent';
  instructionId: string;
}

interface FileExistsCondition {
  type: 'fileExists' | 'fileAbsent';
  path: string;
}

interface FileContainsCondition {
  type: 'fileContains';
  path: string;
  pattern: string;
  glob?: boolean;
}

interface CompoundCondition {
  type: 'all' | 'any';
  conditions: Condition[];
}

export type Condition =
  | AlwaysCondition
  | PackageCondition
  | InstructionCondition
  | FileExistsCondition
  | FileContainsCondition
  | CompoundCondition;

interface SuccessStep {
  id: string;
  enabled?: boolean;
  description: string;
  title?: string;
  when: 'success';
  condition: Condition;
  runCommand: string;
  pattern: string;
  reasoning?: boolean;
}

export type StepType =
  | 'updateDependency'
  | 'removeDependency'
  | 'runShellCommand'
  | 'updateJsonSnippet'
  | 'addFile'
  | 'removeFile'
  | 'renameFile'
  | 'updateTextSnippet'
  | 'removeJsonArrayElement'
  | 'regexReplace'
  | 'addFileFromTemplate';

export type ManualStep =
  | ({
      id: string;
      enabled?: boolean;
      description: string;
      title?: string;
      when: 'deterministic' | 'post';
      condition: Condition;
      file: string;
    } & (
      | {
          type: 'updateDependency' | 'removeDependency';
          depType: 'dependencies' | 'devDependencies';
          packageName: string;
          newVersion?: string;
          requiresMigrationAnalysis?: boolean;
          aiContext?: string;
        }
      | { type: 'runShellCommand'; command: string; file?: string }
      | { type: 'updateJsonSnippet'; jsonSnippet: object }
      | { type: 'addFile'; content: string }
      | { type: 'removeFile' }
      | { type: 'renameFile'; newFileName: string }
      | {
          type: 'updateTextSnippet';
          fromLine: number;
          toLine: number;
          patchLines: string[];
        }
      | {
          type: 'removeJsonArrayElement';
          jsonPath: string[];
          value: string;
          skipIfMissing?: boolean;
        }
      | {
          type: 'regexReplace';
          rules: Array<{ pattern: string; replacement: string; flags?: string }>;
          postRules?: Array<{ pattern: string; replacement: string; flags?: string }>;
          jsonPath?: string[];
          onlyIfContains?: string;
        }
      | {
          type: 'addFileFromTemplate';
          template: string;
          variables?: Record<string, string>;
        }
    ))
  | SuccessStep;

export interface AIContext {
  description: string;
  targetVersion: string;
  template?: string;
  verificationPatterns?: { pattern: string; description: string }[];
}

export interface ManualConfig {
  manualSteps: ManualStep[];
  aiContexts?: Record<string, AIContext>;
  patchFilters?: unknown[];
  versionCorrections?: unknown[];
  detectionPatterns?: Record<string, unknown>;
  excludedPackages?: string[];
}

/** Step type metadata for UI dropdowns */
export const STEP_TYPE_OPTIONS: { value: StepType; label: string; description: string }[] = [
  { value: 'updateDependency', label: 'Update Dependency', description: 'Add or update a package in dependencies/devDependencies' },
  { value: 'removeDependency', label: 'Remove Dependency', description: 'Remove a package from dependencies/devDependencies' },
  { value: 'runShellCommand', label: 'Run Shell Command', description: 'Execute a shell command in the solution root' },
  { value: 'updateJsonSnippet', label: 'Update JSON Snippet', description: 'Merge a JSON object into a file' },
  { value: 'addFile', label: 'Add File', description: 'Create a new file with given content' },
  { value: 'removeFile', label: 'Remove File', description: 'Delete a file' },
  { value: 'renameFile', label: 'Rename File', description: 'Rename or move a file' },
  { value: 'updateTextSnippet', label: 'Update Text Snippet', description: 'Replace lines in a text file' },
  { value: 'removeJsonArrayElement', label: 'Remove JSON Array Element', description: 'Remove an element from a JSON array by path' },
  { value: 'regexReplace', label: 'Regex Replace', description: 'Apply regex-based text replacements with optional JSON path scoping' },
  { value: 'addFileFromTemplate', label: 'Add File From Template', description: 'Create a file from a template with variable substitution' },
];

/* ------------------------------------------------------------------ */
/*  Phase-to-content mapping — what to show in the editor per phase    */
/* ------------------------------------------------------------------ */

export type PhaseContentType = 'steps' | 'ai-contexts' | 'templates';

export interface PhaseContent {
  contentTypes: PhaseContentType[];
  stepsWhen?: 'deterministic' | 'post' | 'success';
  templatePhase?: number;
}

export const PHASE_CONTENT_MAP: Record<number, PhaseContent> = {
  1: { contentTypes: ['templates'], templatePhase: 1 },
  2: { contentTypes: ['steps'], stepsWhen: 'deterministic' },
  3: { contentTypes: ['ai-contexts', 'templates'], templatePhase: 3 },
  4: { contentTypes: ['steps'], stepsWhen: 'post' },
  5: { contentTypes: ['templates'], templatePhase: 5 },
  6: { contentTypes: ['templates'], templatePhase: 6 },
  7: { contentTypes: ['steps'], stepsWhen: 'success' },
};

/* ------------------------------------------------------------------ */
/*  Template types — populated dynamically from API (frontmatter)     */
/* ------------------------------------------------------------------ */

export interface TemplateInfo {
  name: string;
  description: string;
  phase: number;
  /** If true, this template is linked to AI Contexts (migration templates) */
  linkedToAiContext?: boolean;
  /** If present, this template is hardwired in engine code and triggered by a setting */
  engineWired?: { setting: string; trigger: string };
}

/* ------------------------------------------------------------------ */
/*  Engine-wired templates — templates called directly by engine code  */
/* ------------------------------------------------------------------ */

export const ENGINE_WIRED_TEMPLATES: Record<string, { setting: string; trigger: string }> = {
  'm365-cli-error-fix': {
    setting: 'aiFixM365Errors',
    trigger: 'Called automatically when M365 CLI fails and aiFixM365Errors is ON',
  },
  'build-error-fix': {
    setting: 'aiFixBuildErrors',
    trigger: 'Called automatically when the build fails and aiFixBuildErrors is ON',
  },
  'eslint-optimization': {
    setting: 'aiFixEslintProperly',
    trigger: 'Prepended to build-error-fix when ESLint warnings detected and aiFixEslintProperly is ON',
  },
  'third-party-migration': {
    setting: 'aiFixThirdPartyErrors',
    trigger: 'Called automatically when third-party updates cause build failures and aiFixThirdPartyErrors is ON',
  },
};

export interface TemplatePhaseGroup {
  phase: number;
  title: string;
  subtitle: string;
  templates: TemplateInfo[];
}

/* ------------------------------------------------------------------ */
/*  Pipeline phases — full 7-phase pipeline metadata for UI           */
/* ------------------------------------------------------------------ */

type PhaseType = 'editable' | 'engine' | 'auto';

export interface PipelinePhaseInfo {
  phase: number;
  label: string;
  shortLabel: string;
  type: PhaseType;
  /** One-sentence explanation of what this phase does */
  description: string;
  /** Tab value to navigate to, or null if non-interactive */
  relatedTab: 'deterministic' | 'post' | 'success' | 'ai-contexts' | null;
  /** Settings key that controls this phase (for engine phases) */
  relatedSetting?: string;
}

export const PIPELINE_PHASES: PipelinePhaseInfo[] = [
  { phase: 1, label: 'M365 CLI', shortLabel: 'M365 CLI', type: 'engine', description: 'Runs the M365 CLI `spfx project upgrade` command to generate a JSON upgrade report. If the CLI encounters parsing or schema errors and aiFixM365Errors is ON, Claude applies fixes using the m365-cli-error-fix template and retries.', relatedTab: null, relatedSetting: 'ai_fix_m365_errors' },
  { phase: 2, label: 'Patches', shortLabel: 'Patches', type: 'editable', description: 'Generates all upgrade-stage patches. First, each M365 CLI instruction is translated 1:1 into an FN-prefixed patch. Then, YAML deterministic steps (Sass config, script translation, env injection, heft fixes) are evaluated — each has a condition checked against the solution\'s files and the M365 CLI report. Passing steps produce patches appended after the FN patches. No AI involved; patches are generated here but applied later.', relatedTab: 'deterministic' },
  { phase: 3, label: 'Migrations', shortLabel: 'Migrations', type: 'engine', description: 'AI-driven package migrations for breaking changes (PnP JS, MGT, etc.). Each AI Context links a package to a migration template. Claude reads the codebase, follows the template, and rewrites imports and API calls. Verification grep checks confirm completeness.', relatedTab: 'ai-contexts' },
  { phase: 4, label: 'Post-Upgrade', shortLabel: 'Post-Upgrade', type: 'editable', description: 'User-defined steps that run after patches (Phase 2) and migrations (Phase 3), but BEFORE the first build (Phase 5). Use these for dependency updates, file operations, or preparation needed before the build.', relatedTab: 'post' },
  { phase: 5, label: 'Build Fix', shortLabel: 'Build Fix', type: 'engine', description: 'Runs the first build by executing the success steps defined in Phase 7 (npm install \u2192 npm run build). If the build fails and aiFixBuildErrors is ON, Claude analyzes errors using the build-error-fix template and retries up to aiMaxRetries times. A hardcoded fix for an M365 CLI bug (heft test \u2192 heft build) is applied before the first attempt.', relatedTab: null, relatedSetting: 'ai_fix_build_errors' },
  { phase: 6, label: 'Third-Party', shortLabel: 'Third-Party', type: 'engine', description: 'After Phase 5 succeeds, optionally updates third-party packages based on updateThirdPartyDeps settings. If updates cause build failures and aiFixThirdPartyErrors is ON, Claude fixes using the third-party-migration template.', relatedTab: null, relatedSetting: 'ai_fix_third_party_errors' },
  { phase: 7, label: 'Success', shortLabel: 'Success', type: 'editable', description: 'Defines the build/verification commands that Phase 5 executes (e.g., npm install, npm run build). Edit these to customize build commands, add test steps, or change error patterns. After the pipeline completes, PANTOUM generates JSON and Markdown upgrade reports.', relatedTab: 'success' },
];

/* ------------------------------------------------------------------ */
/*  Template variables — documents Mustache variables per template     */
/* ------------------------------------------------------------------ */

interface TemplateVariable {
  name: string;
  description: string;
  example?: string;
}

const TEMPLATE_VARIABLES: Record<string, TemplateVariable[]> = {
  'm365-cli-error-fix': [
    { name: 'solutionName', description: 'SPFx solution folder name', example: 'my-webpart' },
    { name: 'errorOutput', description: 'Full M365 CLI error message text' },
    { name: 'contextFilesList', description: 'Markdown list of files available to read', example: '- src/webparts/...' },
  ],
  'build-error-fix': [
    { name: 'solutionName', description: 'SPFx solution folder name' },
    { name: 'targetVersion', description: 'Target SPFx version', example: '1.20.0' },
    { name: 'targetDescription', description: 'Error scope description', example: 'all build errors AND warnings' },
    { name: 'errorType', description: 'Error category: BUILD or TEST' },
    { name: 'errorOutput', description: 'Full error message text' },
    { name: 'contextFilesList', description: 'Markdown list of relevant files' },
    { name: 'maxBuildRetries', description: 'Max rebuild attempts (1-10)' },
    { name: 'hasTypeScriptWarnings', description: 'Boolean — enables TS warning guidance section' },
  ],
  'eslint-optimization': [
    { name: 'warningCount', description: 'Total ESLint warning count', example: '42' },
    { name: 'ruleCount', description: 'Number of distinct ESLint rules', example: '8' },
    { name: 'rulesList', description: 'Comma-separated quoted rule names' },
    { name: 'rulesConfig', description: 'Pre-formatted rules config for .eslintrc.js' },
  ],
  'third-party-migration': [
    { name: 'updatedPackagesList', description: 'Markdown list of updated packages with versions' },
    { name: 'buildErrors', description: 'First 20 build errors' },
    { name: 'majorUpdatesList', description: 'Comma-separated package names with major updates' },
  ],
  'migration-preamble': [
    { name: 'packageName', description: 'Package being migrated', example: '@pnp/sp' },
    { name: 'fromVersion', description: 'Source version', example: '3.20.0' },
    { name: 'toVersion', description: 'Target version', example: '4.0.0' },
    { name: 'actualTargetVersion', description: 'SPFx version constraint', example: '1.20.0' },
  ],
  'migration-preamble-removal': [
    { name: 'packageName', description: 'Package being removed' },
    { name: 'fromVersion', description: 'Current version being removed' },
  ],
  'pnp-v4-migration': [
    { name: 'packageName', description: 'Always @pnp/sp' },
    { name: 'fromMajor', description: 'Source major version', example: '3' },
  ],
  'migration-verification': [
    { name: 'changesDescription', description: 'Summary of changes made during migration' },
    { name: 'verificationChecks', description: 'Formatted grep commands for each check' },
    { name: 'totalChecks', description: 'Number of verification checks' },
    { name: 'checkResultsTemplate', description: 'Template for recording check results' },
    { name: 'hasChecks', description: 'Boolean — enables remaining issues section' },
  ],
  'migration-fix': [
    { name: 'issuesList', description: 'Formatted list of failed verification checks' },
  ],
};

/**
 * Master list of ALL available template variables grouped by category.
 * Shown in the template editor so users can see every variable they can use.
 */
interface TemplateVariableGroup {
  category: string;
  variables: TemplateVariable[];
}

export const ALL_TEMPLATE_VARIABLES: TemplateVariableGroup[] = [
  {
    category: 'Migration Context',
    variables: [
      { name: 'packageName', description: 'Package being migrated', example: '@pnp/sp' },
      { name: 'fromVersion', description: 'Source version', example: '3.20.0' },
      { name: 'toVersion', description: 'Target version', example: '4.0.0' },
      { name: 'fromMajor', description: 'Source major version number', example: '3' },
      { name: 'toMajor', description: 'Target major version number', example: '4' },
      { name: 'actualTargetVersion', description: 'SPFx version constraint', example: '1.20.0' },
      { name: 'isRemoval', description: 'Boolean — true when migrating away from a deprecated package' },
    ],
  },
  {
    category: 'Solution & Build',
    variables: [
      { name: 'solutionName', description: 'SPFx solution folder name', example: 'my-webpart' },
      { name: 'targetVersion', description: 'Target SPFx version', example: '1.20.0' },
      { name: 'targetDescription', description: 'Error scope description', example: 'all build errors AND warnings' },
      { name: 'errorType', description: 'Error category: BUILD or TEST' },
      { name: 'errorOutput', description: 'Full build/CLI error message text' },
      { name: 'contextFilesList', description: 'Markdown list of relevant files in the solution' },
      { name: 'maxBuildRetries', description: 'Max rebuild attempts allowed (1-10)', example: '3' },
    ],
  },
  {
    category: 'ESLint',
    variables: [
      { name: 'warningCount', description: 'Total ESLint warning count', example: '42' },
      { name: 'ruleCount', description: 'Number of distinct ESLint rules', example: '8' },
      { name: 'rulesList', description: 'Comma-separated quoted rule names' },
      { name: 'rulesConfig', description: 'Pre-formatted rules config for .eslintrc.js' },
    ],
  },
  {
    category: 'Third-Party Dependencies',
    variables: [
      { name: 'updatedPackagesList', description: 'Markdown list of updated packages with versions' },
      { name: 'buildErrors', description: 'First 20 build errors after dependency updates' },
      { name: 'majorUpdatesList', description: 'Comma-separated package names with major updates' },
    ],
  },
  {
    category: 'Verification',
    variables: [
      { name: 'changesDescription', description: 'Summary of changes made during migration' },
      { name: 'verificationChecks', description: 'Formatted grep commands for each check' },
      { name: 'totalChecks', description: 'Number of verification checks', example: '5' },
      { name: 'checkResultsTemplate', description: 'Template for recording check results' },
      { name: 'issuesList', description: 'Formatted list of failed verification checks' },
    ],
  },
  {
    category: 'Conditionals',
    variables: [
      { name: 'hasTypeScriptWarnings', description: 'Boolean — enables TypeScript warning guidance section' },
      { name: 'hasChecks', description: 'Boolean — enables remaining issues section' },
    ],
  },
];
