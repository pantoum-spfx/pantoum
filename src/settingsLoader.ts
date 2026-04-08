/**
 * Shared Settings Loader
 *
 * Provides a unified settings loading and merging pipeline for all entry points:
 * CLI, webapp, and parallel-upgrade script.
 *
 * Priority chain (highest wins):
 *   CLI flags / overrides > pantoum.settings.yml > src/defaults.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  CLAUDE_MODELS,
  DEFAULT_AGENT_MODEL,
  buildDefaultSettings,
  type PantoumSettingsFlat,
} from './defaults.js';
export type { PantoumSettingsFlat } from './defaults.js';

type LegacyPantoumSettingsFlat = Partial<PantoumSettingsFlat> & {
  claude_model?: string;
};
const SUPPORTED_PUBLIC_AGENT_MODELS = ['sonnet', 'opus'] as const;

// ============================================================================
// MODEL MAPPING
// ============================================================================

/** Map of model short names to full Claude model IDs */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  sonnet: CLAUDE_MODELS.SONNET,
  opus: CLAUDE_MODELS.OPUS,
  haiku: CLAUDE_MODELS.HAIKU,
};

/**
 * Resolve a model shortname (e.g. "opus") to a full model ID.
 * Returns the input unchanged if it's already a full model ID.
 */
export function resolveModelId(model: string): string {
  return CLAUDE_MODEL_MAP[model.toLowerCase()] || model;
}

// ============================================================================
// CLI FIELD MAPPING (snake_case → camelCase)
// ============================================================================

/** Maps snake_case settings keys to camelCase CLI/UpgradeOptions keys */
export const CLI_FIELD_MAP: Record<string, string> = {
  target_version: 'targetVersion',
  excluded_patches: 'excludePatchIds',
  env_injection_strategy: 'envInjectionStrategy',
  agent_provider: 'agentProvider',
  agent_model: 'agentModel',
  thinking_effort: 'thinkingEffort',
  update_version_numbers: 'versionUpdates',
  update_package_json: 'updatePackageJson',
  update_readme_files: 'updateReadme',
  update_version_badges: 'updateBadges',
  maintain_version_history: 'updateVersionHistory',
  version_comment: 'versionComment',
  update_nvmrc_file: 'PnPnvmrc',
  update_devcontainer_config: 'PnPdevcontainer',
  update_production_deps: 'updateThirdPartyDeps',
  update_dev_deps: 'updateThirdPartyDevDeps',
  clean_install_after_updates: 'cleanInstallAfterDepUpdate',
  ai_fix_third_party_errors: 'aiFixThirdPartyErrors',
  per_solution_reports: 'perSolutionReports',
  continue_on_solution_fail: 'onSingleSolutionFail',
  ai_fix_m365_errors: 'aiFixM365Errors',
  ai_fix_build_errors: 'aiFixBuildErrors',
  ai_fix_eslint_properly: 'aiFixEslintProperly',
  ai_fix_typescript_warnings: 'aiFixTypeScriptWarnings',
  ai_max_retries: 'aiMaxRetries',
  analyze_complexity: 'analyzeComplexity',
  include_dev_deps_complexity: 'includeDevDepsComplexity',
  write_pantoum_history: 'writeHistory',
  max_parallel_upgrades: 'maxParallelUpgrades',
};

// ============================================================================
// SETTINGS FILE DISCOVERY
// ============================================================================

/**
 * Find the settings file in a directory.
 * Checks for `pantoum.settings.yml` first, then legacy `tui.settings.yml`.
 * If not found in the provided directory, falls back to CWD (supports
 * parallel-upgrade where CLI is invoked with --localPath pointing to a
 * solution directory while the settings file lives in the pantoum root).
 * Returns the path if found, undefined otherwise.
 *
 * @param searchDir - Primary directory to search (typically the solution dir)
 * @param cwd - Override for process.cwd(), used for testing
 */
export function findSettingsFile(searchDir: string, cwd?: string): string | undefined {
  // 1. Check the provided directory first (solution dir)
  const primaryPath = path.join(searchDir, 'pantoum.settings.yml');
  if (fs.existsSync(primaryPath)) return primaryPath;

  const legacyPath = path.join(searchDir, 'tui.settings.yml');
  if (fs.existsSync(legacyPath)) return legacyPath;

  // 2. Fall back to CWD if different from searchDir
  const effectiveCwd = cwd ?? process.cwd();
  if (path.resolve(effectiveCwd) !== path.resolve(searchDir)) {
    const cwdPrimary = path.join(effectiveCwd, 'pantoum.settings.yml');
    if (fs.existsSync(cwdPrimary)) return cwdPrimary;

    const cwdLegacy = path.join(effectiveCwd, 'tui.settings.yml');
    if (fs.existsSync(cwdLegacy)) return cwdLegacy;
  }

  return undefined;
}

// ============================================================================
// SETTINGS FILE LOADING
// ============================================================================

/**
 * Load settings from a YAML file.
 * Returns only the keys present in the file (partial).
 *
 * @param searchDir - Primary directory to search
 * @param cwd - Override for process.cwd(), passed to findSettingsFile
 */
export function loadSettingsFile(searchDir: string, cwd?: string): Partial<PantoumSettingsFlat> {
  const filePath = findSettingsFile(searchDir, cwd);
  if (!filePath) return {};

  const content = fs.readFileSync(filePath, 'utf-8');
  const loaded = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown> | null;
  if (!loaded || typeof loaded !== 'object') return {};

  return normalizeLoadedSettings(loaded as LegacyPantoumSettingsFlat);
}

// ============================================================================
// SETTINGS RESOLUTION
// ============================================================================

/**
 * Resolve settings with 3-layer priority:
 *   overrides (highest) > fileSettings > defaults (lowest)
 *
 * @param fileSettings - Settings loaded from pantoum.settings.yml
 * @param overrides - CLI flags or programmatic overrides (only defined keys override)
 */
export function resolveSettings(
  fileSettings: Partial<PantoumSettingsFlat>,
  overrides?: Partial<PantoumSettingsFlat>,
): PantoumSettingsFlat {
  const defaults = buildDefaultSettings();
  const merged = { ...defaults };
  const normalizedFileSettings = normalizeLoadedSettings(fileSettings as LegacyPantoumSettingsFlat);
  const normalizedOverrides = overrides
    ? normalizeLoadedSettings(overrides as LegacyPantoumSettingsFlat)
    : undefined;

  // Layer 2: file settings override defaults
  for (const [key, value] of Object.entries(normalizedFileSettings)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  // Layer 3: explicit overrides win
  if (normalizedOverrides) {
    for (const [key, value] of Object.entries(normalizedOverrides)) {
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  merged.agent_provider = 'claude';

  return merged;
}

// ============================================================================
// SETTINGS CONVERSION
// ============================================================================

/**
 * Convert resolved flat settings to a camelCase Record using CLI_FIELD_MAP.
 * Special-cases `continue_on_solution_fail` (boolean → 'halt'/'continue').
 */
export function settingsToCamelCase(settings: PantoumSettingsFlat): Record<string, unknown> {
  const cliArgs: Record<string, unknown> = {};
  for (const [settingsKey, cliKey] of Object.entries(CLI_FIELD_MAP)) {
    const value = (settings as unknown as Record<string, unknown>)[settingsKey];
    if (settingsKey === 'continue_on_solution_fail') {
      cliArgs[cliKey] = value ? 'continue' : 'halt';
    } else {
      cliArgs[cliKey] = value;
    }
  }
  return cliArgs;
}

function normalizeLoadedSettings(
  loaded: LegacyPantoumSettingsFlat,
): Partial<PantoumSettingsFlat> {
  const normalized = { ...loaded } as Record<string, unknown>;
  const legacyModel = typeof loaded.claude_model === 'string' ? loaded.claude_model : undefined;

  if (normalized.agent_model === undefined && legacyModel) {
    normalized.agent_model = legacyModel;
  }

  if (typeof normalized.agent_model === 'string') {
    normalized.agent_model = normalizeAgentModel(normalized.agent_model);
  }

  normalized.agent_provider = 'claude';
  delete normalized.claude_model;

  return normalized as Partial<PantoumSettingsFlat>;
}

function normalizeAgentModel(model: string): PantoumSettingsFlat['agent_model'] {
  const lower = model.toLowerCase();

  if (SUPPORTED_PUBLIC_AGENT_MODELS.includes(lower as (typeof SUPPORTED_PUBLIC_AGENT_MODELS)[number])) {
    return lower as PantoumSettingsFlat['agent_model'];
  }

  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';

  return DEFAULT_AGENT_MODEL;
}
