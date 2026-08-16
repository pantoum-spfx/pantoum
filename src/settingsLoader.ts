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
  GITHUB_COPILOT_MODELS,
  AGENT_PROVIDER_LABELS,
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_PROVIDER,
  buildDefaultSettings,
  type AgentProvider,
  type PantoumSettingsFlat,
} from './defaults.js';
import { inferProviderFromModel } from './adapters/runtimeAdapterFactory.js';
export type { PantoumSettingsFlat } from './defaults.js';

type LegacyPantoumSettingsFlat = Partial<PantoumSettingsFlat> & {
  claude_model?: string;
};
const SUPPORTED_AGENT_PROVIDERS = ['claude', 'github-copilot'] as const;
const SUPPORTED_CLAUDE_AGENT_MODELS = ['sonnet', 'opus'] as const;
const SUPPORTED_GITHUB_COPILOT_MODELS = ['gpt-5', 'gpt-5-mini', 'mai-code-1.1-flash', 'mai-code-1-flash-picker'] as const;

function normalizeModelKey(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/:+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.+/g, '-');
}

// ============================================================================
// MODEL MAPPING
// ============================================================================

/** Map of model short names to full Claude model IDs */
export const CLAUDE_MODEL_MAP: Record<string, string> = {
  sonnet: CLAUDE_MODELS.SONNET,
  opus: CLAUDE_MODELS.OPUS,
  haiku: CLAUDE_MODELS.HAIKU,
};

export const GITHUB_COPILOT_MODEL_MAP: Record<string, string> = {
  'gpt-5': GITHUB_COPILOT_MODELS.GPT_5,
  'gpt-5-mini': GITHUB_COPILOT_MODELS.GPT_5_MINI,
  'mai-code-1.1-flash': GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
  'mai-code-1-1-flash': GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
  'mai-code-1-flash-picker': GITHUB_COPILOT_MODELS.MAI_CODE_1_FLASH_PICKER,
};

/**
 * Resolve a model shortname (e.g. "opus") to a full model ID.
 * Returns the input unchanged if it's already a full model ID.
 */
export function resolveModelId(model: string, provider: AgentProvider = DEFAULT_AGENT_PROVIDER): string {
  const lower = normalizeModelKey(model);
  if (provider === 'github-copilot') {
    if (lower in GITHUB_COPILOT_MODEL_MAP) return GITHUB_COPILOT_MODEL_MAP[lower];
    if (lower.includes('mai') && lower.includes('1-1')) return GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH;
    if (lower.includes('mai') || lower.includes('flash') || lower.includes('picker')) return GITHUB_COPILOT_MODELS.MAI_CODE_1_FLASH_PICKER;
    if (lower.includes('mini')) return GITHUB_COPILOT_MODELS.GPT_5_MINI;
    if (lower.includes('gpt') && lower.includes('5')) return GITHUB_COPILOT_MODELS.GPT_5;
    return model;
  }
  return CLAUDE_MODEL_MAP[lower] || model;
}

export function getAgentDisplayName(provider: AgentProvider): string {
  return AGENT_PROVIDER_LABELS[provider] ?? AGENT_PROVIDER_LABELS[DEFAULT_AGENT_PROVIDER];
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
  verification_provider: 'verificationProvider',
  verification_model: 'verificationModel',
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
  ai_fix_eslint_warnings: 'aiFixEslintWarnings',
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

  // Keep the model consistent with the finally-resolved provider: a Claude short name
  // must not leak into a Copilot run (and vice versa).
  merged.agent_provider = normalizeAgentProvider(String(merged.agent_provider ?? DEFAULT_AGENT_PROVIDER));
  merged.agent_model = normalizeAgentModel(
    String(merged.agent_model ?? DEFAULT_AGENT_MODEL),
    merged.agent_provider,
  );

  // Same consistency rule for the verification runtime — but only when configured;
  // absent means "inherit the agent runtime" and must stay absent.
  if (typeof merged.verification_provider === 'string') {
    merged.verification_provider = normalizeAgentProvider(merged.verification_provider);
  }
  if (typeof merged.verification_model === 'string') {
    if (merged.verification_provider === undefined) {
      merged.verification_provider =
        inferProviderFromModel(merged.verification_model) ?? merged.agent_provider;
    }
    merged.verification_model = normalizeAgentModel(
      merged.verification_model,
      merged.verification_provider,
    );
  }

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

  // Only normalize the provider when the layer actually declares one. Injecting a
  // default here would let an override layer (e.g. CLI flags that only set a model)
  // silently reset a provider configured in pantoum.settings.yml.
  let provider: AgentProvider | undefined;
  if (typeof normalized.agent_provider === 'string') {
    provider = normalizeAgentProvider(normalized.agent_provider);
    normalized.agent_provider = provider;
  } else if (normalized.agent_provider !== undefined) {
    delete normalized.agent_provider;
  }

  if (typeof normalized.agent_model === 'string') {
    // A model without an explicit provider still has to reach the right runtime.
    const modelProvider = provider ?? inferProviderFromModel(normalized.agent_model);
    if (!provider && modelProvider) {
      normalized.agent_provider = modelProvider;
    }
    normalized.agent_model = normalizeAgentModel(
      normalized.agent_model,
      modelProvider ?? DEFAULT_AGENT_PROVIDER,
    );
  }

  // Verification runtime follows the same per-layer rules as the agent runtime.
  let verificationProvider: AgentProvider | undefined;
  if (typeof normalized.verification_provider === 'string') {
    verificationProvider = normalizeAgentProvider(normalized.verification_provider);
    normalized.verification_provider = verificationProvider;
  } else if (normalized.verification_provider !== undefined) {
    delete normalized.verification_provider;
  }

  if (typeof normalized.verification_model === 'string') {
    const modelProvider =
      verificationProvider ?? inferProviderFromModel(normalized.verification_model);
    if (!verificationProvider && modelProvider) {
      normalized.verification_provider = modelProvider;
    }
    normalized.verification_model = normalizeAgentModel(
      normalized.verification_model,
      modelProvider ?? DEFAULT_AGENT_PROVIDER,
    );
  } else if (normalized.verification_model !== undefined) {
    delete normalized.verification_model;
  }

  delete normalized.claude_model;

  return normalized as Partial<PantoumSettingsFlat>;
}

function normalizeAgentProvider(provider: string): AgentProvider {
  const lower = provider.toLowerCase();
  if (SUPPORTED_AGENT_PROVIDERS.includes(lower as AgentProvider)) {
    return lower as AgentProvider;
  }

  if (lower === 'github' || lower === 'copilot' || lower === 'githubcopilot') {
    return 'github-copilot';
  }

  return DEFAULT_AGENT_PROVIDER;
}

function normalizeAgentModel(
  model: string,
  provider: AgentProvider,
): PantoumSettingsFlat['agent_model'] {
  const lower = normalizeModelKey(model);

  if (provider === 'github-copilot') {
    if (SUPPORTED_GITHUB_COPILOT_MODELS.includes(lower as (typeof SUPPORTED_GITHUB_COPILOT_MODELS)[number])) {
      return lower as PantoumSettingsFlat['agent_model'];
    }

    if (lower.includes('mai') && lower.includes('1-1')) return 'mai-code-1.1-flash';
    if (lower.includes('mai') || lower.includes('flash') || lower.includes('picker')) return 'mai-code-1-flash-picker';
    if (lower.includes('mini')) return 'gpt-5-mini';
    if (lower.includes('gpt') && lower.includes('5')) return 'gpt-5';
    return GITHUB_COPILOT_MODELS.GPT_5;
  }

  if (SUPPORTED_CLAUDE_AGENT_MODELS.includes(lower as (typeof SUPPORTED_CLAUDE_AGENT_MODELS)[number])) {
    return lower as PantoumSettingsFlat['agent_model'];
  }

  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';

  return DEFAULT_AGENT_MODEL;
}
