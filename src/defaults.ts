/**
 * PANTOUM Default Settings - Single Source of Truth
 *
 * This file centralizes all default values for PANTOUM settings.
 * CLI and webapp import from here to ensure consistency.
 *
 * Naming convention:
 * - AI-related settings use "AI_" prefix to make AI usage explicit
 * - CLI names use camelCase
 */

// ============================================================================
// TARGET CONFIGURATION
// ============================================================================

/** Default target SPFx version */
export const DEFAULT_TARGET_VERSION = '1.23.0';

/** Default environment injection strategy for SPFx 1.22+ Heft migration */
export const DEFAULT_ENV_INJECTION_STRATEGY = 'webpack-patch' as const;
export type EnvInjectionStrategy = 'webpack-patch' | 'none';

// ============================================================================
// AI CONFIGURATION
// ============================================================================

/** Claude model identifiers */
export const CLAUDE_MODELS = {
  /** Claude Sonnet 4.6 - Default model, fast and capable for most migrations */
  SONNET: 'claude-sonnet-4-6',
  /** Claude Opus 4.6 - Best for complex multi-file migrations */
  OPUS: 'claude-opus-4-6',
  /** Claude Haiku 4.5 - Lightweight operations like fancy name generation */
  HAIKU: 'claude-haiku-4-5',
} as const;

/** Thinking effort levels for adaptive thinking (Sonnet/Opus 4.6+) */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

/** Default thinking effort — 'medium' balances reasoning depth with speed and cost */
export const DEFAULT_THINKING_EFFORT: ThinkingEffort = 'medium';

/** Default Claude model */
export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS.SONNET;
export type AgentProvider = 'claude';
export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'claude';
export const DEFAULT_AGENT_MODEL = 'sonnet';

/** AI error fixing defaults */
export const AI_DEFAULTS = {
  /** Use AI to fix M365 CLI upgrade errors */
  FIX_M365_ERRORS: true,
  /** Use AI to fix build/test errors after upgrade */
  FIX_BUILD_ERRORS: true,
  /** Use AI to fix breaking changes from third-party updates */
  FIX_THIRD_PARTY_ERRORS: true,
  /** Fix ESLint issues by fixing code (true) vs adding disable comments (false) */
  FIX_ESLINT_PROPERLY: true,
  /** Fix TypeScript warnings during build */
  FIX_TYPESCRIPT_WARNINGS: true,
} as const;

// ============================================================================
// AI RETRY LIMITS
// ============================================================================

/**
 * Controls how many times AI error-fixing loops will retry before giving up.
 * Applies to build error fixing, migration verification, and third-party fixes.
 */
export const RETRY_DEFAULTS = {
  /** Max retry iterations for AI error fixing (build, migration verification, third-party) */
  AI_MAX_RETRIES: 3,
} as const;

// ============================================================================
// MIGRATION VERIFICATION (Claude Self-Verification)
// ============================================================================

/**
 * Verification loop settings for third-party migrations (e.g., PnP v4).
 * After migration, Claude verifies work by running grep commands and showing evidence.
 * If verification fails, a fix loop attempts to resolve remaining issues.
 */
export const VERIFICATION_DEFAULTS = {
  /** Enable verification phase after migrations */
  ENABLED: true,
  /** Maximum verification/fix iterations before giving up (uses RETRY_DEFAULTS) */
  MAX_ITERATIONS: RETRY_DEFAULTS.AI_MAX_RETRIES,
  /** Show detailed verification logs */
  VERBOSE: true,
} as const;

// ============================================================================
// VERSION UPDATES
// ============================================================================

export const VERSION_UPDATE_DEFAULTS = {
  /** Master switch for all version updates */
  ENABLED: true,
  /** Increment package.json version (MINOR: 1.0.0 → 1.1.0) */
  UPDATE_PACKAGE_JSON: true,
  /** Update README files */
  UPDATE_README: true,
  /** Update version badges in documentation */
  UPDATE_BADGES: true,
  /** Add version history entry */
  UPDATE_HISTORY: true,
  /** Comment for version history table */
  VERSION_COMMENT: 'Upgraded to {SPFxVersion}',
} as const;

// ============================================================================
// PNP TEMPLATE SETTINGS
// ============================================================================

export const PNP_DEFAULTS = {
  /** Update .nvmrc file with Node version */
  UPDATE_NVMRC: true,
  /** Update devcontainer.json */
  UPDATE_DEVCONTAINER: true,
} as const;

// ============================================================================
// THIRD-PARTY DEPENDENCIES
// ============================================================================

export const DEPENDENCY_DEFAULTS = {
  /** Update strategy for production dependencies */
  UPDATE_PRODUCTION_DEPS: 'none' as const,
  /** Update strategy for dev dependencies */
  UPDATE_DEV_DEPS: 'none' as const,
  /** Clean install after dependency updates */
  CLEAN_INSTALL_AFTER_UPDATE: true,
} as const;

// ============================================================================
// OUTPUT & REPORTING
// ============================================================================

export const OUTPUT_DEFAULTS = {
  /** Generate markdown report */
  MARKDOWN: true,
  /** Save reports in each solution directory */
  PER_SOLUTION_REPORTS: false,
  /** Record each upgrade run to pantoum_history/ */
  WRITE_HISTORY: true,
  /** Generate verbose debug files */
  DEBUG_REPORTS: false,
} as const;

// ============================================================================
// COMPLEXITY ANALYSIS
// ============================================================================

export const COMPLEXITY_DEFAULTS = {
  /** Enabled by default for CLI */
  CLI_ENABLED: true,
  /** Disabled by default for webapp (slow, ~150 HTTP requests) */
  WEBAPP_ENABLED: false,
  /** Include dev dependencies in complexity score */
  INCLUDE_DEV_DEPS: false,
} as const;

// ============================================================================
// PARALLELISM (webapp only)
// ============================================================================

const PARALLELISM_DEFAULTS = {
  /** Maximum number of solutions to upgrade simultaneously (webapp only) */
  MAX_PARALLEL_UPGRADES: 4,
} as const;

// ============================================================================
// TIMEOUTS (non-configurable)
// ============================================================================

export const TIMEOUTS = {
  /** Build/test command timeout (5 minutes) */
  BUILD_COMMAND: 300000,
  /** Claude Code analysis timeout (3 minutes) */
  CLAUDE_ANALYSIS: 180000,
  /** Claude Code migration timeout (10 minutes) */
  CLAUDE_MIGRATION: 600000,
  /** Default command timeout (2 minutes) */
  DEFAULT_COMMAND: 120000,
  /** Fancy name generation timeout (30 seconds) */
  FANCY_NAME_GENERATION: 30000,
  /** Progress reporting interval (10 seconds) */
  PROGRESS_INTERVAL: 10000,
  /** Third-party dependency check timeout (10 seconds) */
  THIRD_PARTY_TIMEOUT: 10000,
} as const;

// ============================================================================
// FILE PATTERNS (non-configurable)
// ============================================================================

export const FILE_PATTERNS = {
  /** Standard package.json file */
  PACKAGE_JSON: 'package.json',
  /** Yeoman RC configuration file */
  YO_RC_JSON: '.yo-rc.json',
  /** TypeScript configuration file */
  TSCONFIG_JSON: 'tsconfig.json',
  /** Node modules exclude pattern */
  NODE_MODULES_EXCLUDE: '**/node_modules/**',
  /** SPFx dependency prefix pattern */
  SPFX_DEPENDENCY_PREFIX: '@microsoft/sp-',
  /** SPFx generator marker */
  SPFX_GENERATOR: '@microsoft/generator-sharepoint',
  /** Common temporary directories to exclude */
  TEMP_DIRS_EXCLUDE: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/lib/**'],
  /** Patches JSON file */
  PATCHES_JSON: 'patches.json',
  /** Patch status JSON file */
  PATCH_STATUS_JSON: 'patch_status.json',
  /** Upgrade report markdown file */
  UPGRADE_REPORT_MD: 'UPGRADE_REPORT.md',
  /** Gulpfile */
  GULPFILE_JS: 'gulpfile.js',
} as const;

export const SPFX_CONFIG_FILES = [
  'config/config.json',
  'config/package-solution.json',
  'config/write-manifests.json',
  '.yo-rc.json',
] as const;

// ============================================================================
// NPM REGISTRY (non-configurable)
// ============================================================================

export const NPM_REGISTRY_DEFAULTS = {
  /** Max retry attempts for npm registry requests */
  MAX_RETRIES: 3,
  /** Base delay between retries in ms (multiplied by attempt number) */
  RETRY_DELAY_MS: 1000,
} as const;

// ============================================================================
// ESLINT ANALYSIS (non-configurable)
// ============================================================================

export const ESLINT_DEFAULTS = {
  /** Minimum ESLint warnings before triggering bulk optimization */
  MIN_WARNINGS_FOR_OPTIMIZATION: 10,
} as const;

// ============================================================================
// FLAT SETTINGS (matches pantoum.settings.yml schema)
// ============================================================================

/**
 * Flat settings interface matching the pantoum.settings.yml schema.
 * All keys are snake_case to match YAML convention.
 */
export interface PantoumSettingsFlat {
  target_version: string;
  excluded_patches: string[];
  env_injection_strategy: EnvInjectionStrategy;
  agent_provider: AgentProvider;
  agent_model: string;
  thinking_effort: ThinkingEffort;
  update_version_numbers: boolean;
  update_package_json: boolean;
  update_readme_files: boolean;
  update_version_badges: boolean;
  maintain_version_history: boolean;
  version_comment: string;
  update_nvmrc_file: boolean;
  update_devcontainer_config: boolean;
  update_production_deps: 'none' | 'patch' | 'minor' | 'major';
  update_dev_deps: 'none' | 'patch' | 'minor' | 'major';
  clean_install_after_updates: boolean;
  ai_fix_third_party_errors: boolean;
  per_solution_reports: boolean;
  write_pantoum_history: boolean;
  disable_animations: boolean;
  continue_on_solution_fail: boolean;
  ai_fix_m365_errors: boolean;
  ai_fix_build_errors: boolean;
  ai_fix_eslint_properly: boolean;
  ai_fix_typescript_warnings: boolean;
  ai_max_retries: number;
  analyze_complexity: boolean;
  include_dev_deps_complexity: boolean;
  max_parallel_upgrades: number;
}

/**
 * Build the canonical default settings object from the grouped constants.
 * This is the single bridge between SCREAMING_CASE constants and YAML-shaped settings.
 */
export function buildDefaultSettings(): PantoumSettingsFlat {
  return {
    target_version: DEFAULT_TARGET_VERSION,
    excluded_patches: [],
    env_injection_strategy: DEFAULT_ENV_INJECTION_STRATEGY,
    agent_provider: DEFAULT_AGENT_PROVIDER,
    agent_model: DEFAULT_AGENT_MODEL,
    thinking_effort: DEFAULT_THINKING_EFFORT,
    update_version_numbers: VERSION_UPDATE_DEFAULTS.ENABLED,
    update_package_json: VERSION_UPDATE_DEFAULTS.UPDATE_PACKAGE_JSON,
    update_readme_files: VERSION_UPDATE_DEFAULTS.UPDATE_README,
    update_version_badges: VERSION_UPDATE_DEFAULTS.UPDATE_BADGES,
    maintain_version_history: VERSION_UPDATE_DEFAULTS.UPDATE_HISTORY,
    version_comment: VERSION_UPDATE_DEFAULTS.VERSION_COMMENT,
    update_nvmrc_file: PNP_DEFAULTS.UPDATE_NVMRC,
    update_devcontainer_config: PNP_DEFAULTS.UPDATE_DEVCONTAINER,
    update_production_deps: DEPENDENCY_DEFAULTS.UPDATE_PRODUCTION_DEPS,
    update_dev_deps: DEPENDENCY_DEFAULTS.UPDATE_DEV_DEPS,
    clean_install_after_updates: DEPENDENCY_DEFAULTS.CLEAN_INSTALL_AFTER_UPDATE,
    ai_fix_third_party_errors: AI_DEFAULTS.FIX_THIRD_PARTY_ERRORS,
    per_solution_reports: OUTPUT_DEFAULTS.PER_SOLUTION_REPORTS,
    write_pantoum_history: OUTPUT_DEFAULTS.WRITE_HISTORY,
    disable_animations: false,
    continue_on_solution_fail: false,
    ai_fix_m365_errors: AI_DEFAULTS.FIX_M365_ERRORS,
    ai_fix_build_errors: AI_DEFAULTS.FIX_BUILD_ERRORS,
    ai_fix_eslint_properly: AI_DEFAULTS.FIX_ESLINT_PROPERLY,
    ai_fix_typescript_warnings: AI_DEFAULTS.FIX_TYPESCRIPT_WARNINGS,
    ai_max_retries: RETRY_DEFAULTS.AI_MAX_RETRIES,
    analyze_complexity: COMPLEXITY_DEFAULTS.CLI_ENABLED,
    include_dev_deps_complexity: COMPLEXITY_DEFAULTS.INCLUDE_DEV_DEPS,
    max_parallel_upgrades: PARALLELISM_DEFAULTS.MAX_PARALLEL_UPGRADES,
  };
}
