/**
 * Webapp Settings Types
 * Mirrors pantoum settings for full compatibility with pantoum.settings.yml
 */

type EnvInjectionStrategy = 'webpack-patch' | 'none';
type ThirdPartyUpdateStrategy = 'none' | 'patch' | 'minor' | 'major';
type DevDepsUpdateStrategy = 'none' | 'patch' | 'minor' | 'major';
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'max';
export type SupportedAgentModel = 'sonnet' | 'opus';

export const AGENT_MODEL_OPTIONS: ReadonlyArray<{ value: SupportedAgentModel; label: string }> = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
];

export interface PantoumSettings {
  // Target Configuration
  target_version: string;
  excluded_patches: string[];
  env_injection_strategy: EnvInjectionStrategy;

  // AI Runtime
  agent_provider: 'claude';
  agent_model: SupportedAgentModel;
  thinking_effort: ThinkingEffort;

  // Version Updates
  update_version_numbers: boolean;
  update_package_json: boolean;
  update_readme_files: boolean;
  update_version_badges: boolean;
  maintain_version_history: boolean;
  version_comment: string;

  // Node.js Configuration (PnP Templates)
  update_nvmrc_file: boolean;
  update_devcontainer_config: boolean;

  // Third-Party Dependencies
  update_production_deps: ThirdPartyUpdateStrategy;
  update_dev_deps: DevDepsUpdateStrategy;
  clean_install_after_updates: boolean;
  ai_fix_third_party_errors: boolean;

  // Output Options
  per_solution_reports: boolean;
  write_pantoum_history: boolean;
  disable_animations: boolean;

  // Error Handling
  continue_on_solution_fail: boolean;
  ai_fix_m365_errors: boolean;
  ai_fix_build_errors: boolean;
  ai_fix_eslint_properly: boolean;
  ai_fix_typescript_warnings: boolean;
  ai_max_retries: number;

  // Complexity Analysis
  analyze_complexity: boolean;
  include_dev_deps_complexity: boolean;

  // Parallelism
  max_parallel_upgrades: number;
}

/**
 * Explicit UI labels — overrides the auto-generated snake_case → Title Case conversion.
 * Only needed when the auto-generated label is wrong or redundant (e.g. "AI" prefix
 * inside the AI Behaviour tab).
 */
export const SETTING_LABELS: Partial<Record<keyof PantoumSettings, string>> = {
  agent_provider: 'AI runtime',
  agent_model: 'Agent model',
  thinking_effort: 'Thinking effort',
  ai_fix_m365_errors: 'Fix M365 CLI errors',
  ai_fix_build_errors: 'Fix build errors',
  ai_fix_eslint_properly: 'Fix ESLint properly',
  ai_fix_typescript_warnings: 'Fix TypeScript warnings',
  ai_fix_third_party_errors: 'Fix third-party breaking changes',
  ai_max_retries: 'Max retries',
  max_parallel_upgrades: 'Max parallel upgrades',
};

/**
 * Setting descriptions for UI tooltips
 */
export const SETTING_DESCRIPTIONS: Record<keyof PantoumSettings, string> = {
  target_version: 'The SPFx version your solutions will be upgraded to. Pantoum applies all necessary patches to reach this version.',
  excluded_patches: 'Comma-separated patch IDs (e.g. FN019002) to skip during upgrade. Useful when a specific patch causes issues or is not applicable to your project.',
  env_injection_strategy: 'How environment variables are injected after migrating from Gulp to Heft. "webpack-patch" is the recommended approach — it patches the Webpack config without modifying source code.',
  agent_provider: 'Pantoum keeps a provider-neutral settings contract, but this public release supports only the Claude runtime. The value is fixed to "claude" for forward compatibility.',
  agent_model: 'Claude model used by Pantoum Studio. This public release supports "sonnet" and "opus".',
  thinking_effort: 'Controls adaptive thinking intensity. High = deep reasoning (recommended). Max = maximum thinking budget. Medium/Low = faster, cheaper. Off = no thinking. Not available for Haiku models.',
  update_version_numbers: 'Master switch — when off, all version-related updates below (package.json, README, badges, history) are skipped.',
  update_package_json: 'Bumps the MINOR version in package.json (e.g. 1.0.0 → 1.1.0) to reflect the upgrade.',
  update_readme_files: 'Allows pantoum to modify README.md files — required for badge and version history updates.',
  update_version_badges: 'Updates the SPFx and Node.js version shield badges in README.md to match the new target version.',
  maintain_version_history: 'Appends a new row to the version history table in README.md documenting this upgrade.',
  version_comment: 'The text added to the version history table. Use {SPFxVersion} as a placeholder for the target version.',
  update_nvmrc_file: 'Updates .nvmrc to the Node.js version required by the target SPFx version, so nvm use picks it up automatically.',
  update_devcontainer_config: 'Updates the Node.js version in devcontainer.json for VS Code Dev Containers / GitHub Codespaces.',
  update_production_deps: 'Controls how production dependencies are updated. "none" = no updates, "patch/minor/major" = update to latest within that range.',
  update_dev_deps: 'Controls how devDependencies are updated. Same strategy options as production deps. Dev deps are lower risk but can still introduce breaking changes.',
  clean_install_after_updates: 'Runs a clean npm install (deletes node_modules + package-lock.json) after dependency updates to ensure a consistent state.',
  ai_fix_third_party_errors: 'When third-party packages have breaking API changes after an upgrade, Pantoum uses Claude to analyze the errors and rewrite your code to use the new API.',
  per_solution_reports: 'Saves a copy of the upgrade report inside each solution directory, in addition to the central run directory.',
  write_pantoum_history: 'Records each upgrade run to a pantoum_history/ folder, preserving a full audit trail of all upgrades performed.',
  disable_animations: 'Turns off the animated squirrel mascot shown during upgrade processing.',
  continue_on_solution_fail: 'When upgrading multiple solutions, continue to the next one if the current solution fails instead of stopping the entire batch.',
  ai_fix_m365_errors: 'When M365 CLI reports parsing or schema errors during upgrade, Pantoum uses Claude to analyze the error output and attempt automatic fixes.',
  ai_fix_build_errors: 'After applying patches, if the project fails to build or tests fail, Pantoum uses Claude to read the error output and apply targeted code fixes.',
  ai_fix_eslint_properly: 'When ON, Pantoum asks Claude to fix the actual code to satisfy ESLint rules. When OFF, it adds eslint-disable comments instead — faster but less clean.',
  ai_fix_typescript_warnings: 'Pantoum uses Claude to fix TypeScript compiler warnings (e.g. unused variables, missing types) that appear during the post-upgrade build.',
  ai_max_retries: 'How many times Pantoum retries Claude-powered error fixing before giving up. Each retry re-runs the build, analyzes new errors, and applies fixes. Range: 1–10.',
  analyze_complexity: 'Runs a pre-upgrade complexity analysis by querying the npm registry for each dependency. Slow (~150 API calls) but helps predict upgrade difficulty.',
  include_dev_deps_complexity: 'Includes devDependencies in the complexity analysis. Usually unnecessary since dev deps rarely cause upgrade issues.',
  max_parallel_upgrades: 'Maximum number of solutions to upgrade simultaneously. Each solution runs in an isolated child process. Range: 1–4.',
};

/**
 * Setting dependencies - child settings that are disabled when parent is off
 */
export const SETTING_DEPENDENCIES: Partial<Record<keyof PantoumSettings, (keyof PantoumSettings)[]>> = {
  update_package_json: ['update_version_numbers'],
  update_readme_files: ['update_version_numbers'],
  update_version_badges: ['update_readme_files'],
  maintain_version_history: ['update_readme_files'],
  version_comment: ['maintain_version_history'],
  thinking_effort: ['agent_model'],
  include_dev_deps_complexity: ['analyze_complexity'],
};

/**
 * Settings tab structure for the UI
 */
interface SettingsTab {
  id: string;
  label: string;
  description: string;
  sections: SettingsSection[];
}

interface SettingsSection {
  title: string;
  settings: (keyof PantoumSettings)[];
}

export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'main',
    label: 'Main',
    description: 'Start here. These are the core controls most teams need for a typical SPFx upgrade.',
    sections: [
      {
        title: 'Upgrade Essentials',
        settings: [
          'target_version',
          'update_production_deps',
          'ai_fix_m365_errors',
          'ai_fix_build_errors',
          'ai_max_retries',
        ],
      },
      {
        title: 'Reporting',
        settings: [
          'per_solution_reports',
        ],
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Power-user controls for the Claude runtime, version updates, pipeline tuning, and Studio behavior.',
    sections: [
      {
        title: 'AI Runtime',
        settings: ['agent_model', 'thinking_effort'],
      },
      {
        title: 'AI Fixing',
        settings: [
          'ai_fix_eslint_properly',
          'ai_fix_typescript_warnings',
          'ai_fix_third_party_errors',
        ],
      },
      {
        title: 'Engine',
        settings: [
          'excluded_patches',
          'env_injection_strategy',
          'continue_on_solution_fail',
          'max_parallel_upgrades',
          'analyze_complexity',
          'include_dev_deps_complexity',
        ],
      },
      {
        title: 'Version Updates',
        settings: [
          'update_version_numbers',
          'update_package_json',
          'update_readme_files',
          'update_version_badges',
          'maintain_version_history',
          'version_comment',
        ],
      },
      {
        title: 'Dependencies and Output',
        settings: [
          'update_dev_deps',
          'clean_install_after_updates',
          'write_pantoum_history',
        ],
      },
      {
        title: 'PnP Templates',
        settings: ['update_nvmrc_file', 'update_devcontainer_config'],
      },
      {
        title: 'UI',
        settings: ['disable_animations'],
      },
    ],
  },
];
