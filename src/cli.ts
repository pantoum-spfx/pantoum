#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { upgradeRepo } from './index.js';
import { logger, Level } from './utils/logger.js';
import { DEFAULTS, FLAGS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** Pantoum project root — centralized history location shared with the webapp */
const PANTOUM_ROOT = path.resolve(__dirname, '..');
import {
  DEFAULT_TARGET_VERSION,
  DEFAULT_ENV_INJECTION_STRATEGY,
  AI_DEFAULTS,
  RETRY_DEFAULTS,
  VERSION_UPDATE_DEFAULTS,
  PNP_DEFAULTS,
  DEPENDENCY_DEFAULTS,
  COMPLEXITY_DEFAULTS,
  OUTPUT_DEFAULTS,
  type EnvInjectionStrategy,
} from './defaults.js';
import {
  findSettingsFile,
  loadSettingsFile,
  resolveSettings,
  resolveModelId,
  type PantoumSettingsFlat,
} from './settingsLoader.js';

/**
 * Raw CLI args from yargs — all optional because yargs no longer fills defaults.
 * When a field is undefined, it means the user didn't pass that flag.
 */
interface CliArgs {
  localPath?: string;
  excludeSolutions?: string[];
  excludePatchIds?: string[];
  toVersion?: string;
  onSingleSolutionFail?: 'halt' | 'continue';
  silent?: boolean;
  patchFile?: string;
  reportsDir?: string;
  perSolutionReports?: boolean;
  aiFixM365Errors?: boolean;
  aiFixBuildErrors?: boolean;
  aiFixThirdPartyErrors?: boolean;
  aiFixEslintProperly?: boolean;
  aiFixTypeScriptWarnings?: boolean;
  agentProvider?: 'claude';
  agentModel?: 'sonnet' | 'opus';
  claudeModel?: string;
  markdown?: boolean;
  updateThirdPartyDeps?: 'none' | 'patch' | 'minor' | 'major';
  updateThirdPartyDevDeps?: 'none' | 'patch' | 'minor' | 'major';
  cleanInstallAfterDepUpdate?: boolean;
  versionUpdates?: boolean;
  updatePackageJson?: boolean;
  updateReadme?: boolean;
  updateBadges?: boolean;
  updateVersionHistory?: boolean;
  versionComment?: string;
  PnPnvmrc?: boolean;
  PnPdevcontainer?: boolean;
  analyzeComplexity?: boolean;
  includeDevDepsComplexity?: boolean;
  debugReports?: boolean;
  aiMaxRetries?: number;
  envInjectionStrategy?: EnvInjectionStrategy;
}

/**
 * Map CLI flag values (camelCase) to flat settings keys (snake_case).
 * Only includes flags that have a corresponding settings key.
 */
function cliArgsToOverrides(argv: CliArgs): Partial<PantoumSettingsFlat> {
  const overrides: Partial<PantoumSettingsFlat> = {};

  if (argv.toVersion !== undefined) overrides.target_version = argv.toVersion;
  if (argv.envInjectionStrategy !== undefined) overrides.env_injection_strategy = argv.envInjectionStrategy;
  if (argv.agentProvider !== undefined) overrides.agent_provider = argv.agentProvider;
  if (argv.agentModel !== undefined) overrides.agent_model = argv.agentModel;
  if (argv.agentModel === undefined && argv.claudeModel !== undefined) overrides.agent_model = argv.claudeModel;
  if (argv.aiFixM365Errors !== undefined) overrides.ai_fix_m365_errors = argv.aiFixM365Errors;
  if (argv.aiFixBuildErrors !== undefined) overrides.ai_fix_build_errors = argv.aiFixBuildErrors;
  if (argv.aiFixThirdPartyErrors !== undefined) overrides.ai_fix_third_party_errors = argv.aiFixThirdPartyErrors;
  if (argv.aiFixEslintProperly !== undefined) overrides.ai_fix_eslint_properly = argv.aiFixEslintProperly;
  if (argv.aiFixTypeScriptWarnings !== undefined) overrides.ai_fix_typescript_warnings = argv.aiFixTypeScriptWarnings;
  if (argv.aiMaxRetries !== undefined) overrides.ai_max_retries = argv.aiMaxRetries;
  if (argv.perSolutionReports !== undefined) overrides.per_solution_reports = argv.perSolutionReports;
  if (argv.updateThirdPartyDeps !== undefined) overrides.update_production_deps = argv.updateThirdPartyDeps;
  if (argv.updateThirdPartyDevDeps !== undefined) overrides.update_dev_deps = argv.updateThirdPartyDevDeps as PantoumSettingsFlat['update_dev_deps'];
  if (argv.cleanInstallAfterDepUpdate !== undefined) overrides.clean_install_after_updates = argv.cleanInstallAfterDepUpdate;
  if (argv.versionUpdates !== undefined) overrides.update_version_numbers = argv.versionUpdates;
  if (argv.updatePackageJson !== undefined) overrides.update_package_json = argv.updatePackageJson;
  if (argv.updateReadme !== undefined) overrides.update_readme_files = argv.updateReadme;
  if (argv.updateBadges !== undefined) overrides.update_version_badges = argv.updateBadges;
  if (argv.updateVersionHistory !== undefined) overrides.maintain_version_history = argv.updateVersionHistory;
  if (argv.versionComment !== undefined) overrides.version_comment = argv.versionComment;
  if (argv.PnPnvmrc !== undefined) overrides.update_nvmrc_file = argv.PnPnvmrc;
  if (argv.PnPdevcontainer !== undefined) overrides.update_devcontainer_config = argv.PnPdevcontainer;
  if (argv.analyzeComplexity !== undefined) overrides.analyze_complexity = argv.analyzeComplexity;
  if (argv.includeDevDepsComplexity !== undefined) overrides.include_dev_deps_complexity = argv.includeDevDepsComplexity;
  if (argv.onSingleSolutionFail !== undefined) overrides.continue_on_solution_fail = argv.onSingleSolutionFail === 'continue';

  return overrides;
}

async function runUpgrade(argv: CliArgs) {
  const silent = argv.silent ?? FLAGS.SILENT;
  if (silent) {
    logger.setLevel(Level.Error);
  } else {
    logger.setLevel(Level.Info);
  }

  // Resolve localPath early — needed for settings file discovery
  const localPath = argv.localPath || '.';

  // Load settings file from the solution directory (or CWD)
  const settingsDir = localPath === '.' ? process.cwd() : localPath;
  const settingsFile = findSettingsFile(settingsDir);
  const fileSettings = settingsFile ? loadSettingsFile(settingsDir) : {};
  if (settingsFile) {
    logger.info('Loaded settings from %s', settingsFile);
  } else {
    logger.warn('No pantoum.settings.yml found — using defaults only');
  }

  // Build CLI overrides from explicitly-passed flags
  const overrides = cliArgsToOverrides(argv);

  // Merge: defaults < file < CLI flags
  const settings = resolveSettings(fileSettings, overrides);

  if (settings.agent_provider !== 'claude') {
    throw new Error(`Unsupported agent provider "${settings.agent_provider}". This public release supports only "claude".`);
  }

  // Resolve model shortname to full ID
  const claudeModel = resolveModelId(settings.agent_model);

  logger.info('Starting upgrade with resolved settings');

  const result = await upgradeRepo({
    localPath,
    excludeSolutions: argv.excludeSolutions ?? [],
    excludePatchIds: argv.excludePatchIds ?? settings.excluded_patches ?? [],
    targetVersion: settings.target_version,
    manualConfig: argv.patchFile ?? DEFAULTS.PATCHES_FILE,
    outputOptions: {
      reportsDir: argv.reportsDir,
      perSolutionReports: settings.per_solution_reports,
      markdown: argv.markdown ?? OUTPUT_DEFAULTS.MARKDOWN,
      writeHistory: settings.write_pantoum_history,
      historyRoot: PANTOUM_ROOT,
    },
    flags: {
      onSingleSolutionFail: settings.continue_on_solution_fail ? 'continue' : 'halt',
      silent,
      aiFixM365Errors: settings.ai_fix_m365_errors,
      aiFixBuildErrors: settings.ai_fix_build_errors,
      claudeModel,
      updateThirdPartyDeps: settings.update_production_deps,
      updateThirdPartyDevDeps: settings.update_dev_deps as 'none' | 'patch',
      cleanInstallAfterDepUpdate: settings.clean_install_after_updates,
      aiFixThirdPartyErrors: settings.ai_fix_third_party_errors,
      aiFixEslintProperly: settings.ai_fix_eslint_properly,
      aiFixTypeScriptWarnings: settings.ai_fix_typescript_warnings,
      aiMaxRetries: settings.ai_max_retries,
      envInjectionStrategy: settings.env_injection_strategy,
      thinkingEffort: settings.thinking_effort,
    },
    versionUpdateOptions: {
      enabled: settings.update_version_numbers,
      updatePackageJson: settings.update_package_json,
      updateReadme: settings.update_readme_files,
      updateBadges: settings.update_version_badges,
      updateVersionHistory: settings.maintain_version_history,
      versionComment: settings.version_comment,
      PnPnvmrc: settings.update_nvmrc_file,
      PnPdevcontainer: settings.update_devcontainer_config,
    },
    complexityOptions: {
      enabled: settings.analyze_complexity,
      includeDevDependencies: settings.include_dev_deps_complexity,
    },
    debugOptions: {
      debugReports: argv.debugReports ?? OUTPUT_DEFAULTS.DEBUG_REPORTS,
    },
  });

  // Exit with error code if upgrade failed
  if (!result.success) {
    process.exit(1);
  }
}

async function main() {
  await yargs(hideBin(process.argv))
    .command(
      ['$0', 'upgrade'],
      'Run SPFx upgrade',
      (yargs) => {
        return yargs
          .option('localPath', { type: 'string', description: 'Path to existing local repository' })
          .option('excludeSolutions', {
            type: 'array',
            string: true,
            default: [],
            description: 'List of solution name patterns to exclude',
          })
          .option('excludePatchIds', {
            alias: 'e',
            describe: 'Patch IDs to skip (space or comma separated)',
            type: 'string',
            array: true,
            description: 'List of PatchIds FN123456 to exclude',
            coerce: (ids: string | string[]) => {
              const list = Array.isArray(ids) ? ids : [ids];
              return list
                .flatMap(s => s.split(','))
                .map(s => s.trim())
                .filter(Boolean);
            }
          })
          .option('toVersion', {
            type: 'string',
            description: `Target SPFx version (default: ${DEFAULT_TARGET_VERSION})`,
          })
          .option('onSingleSolutionFail', {
            choices: ['halt', 'continue'] as const,
            description: 'Behavior when a solution upgrade fails (default: halt)',
          })
          .option('silent', {
            type: 'boolean',
            alias: 's',
            description: `Suppress console output (default: ${FLAGS.SILENT})`,
          })
          // AI Settings
          .option('aiFixM365Errors', {
            type: 'boolean',
            description: `Use AI (Claude) to fix M365 CLI upgrade errors (default: ${AI_DEFAULTS.FIX_M365_ERRORS})`,
          })
          .option('aiFixBuildErrors', {
            type: 'boolean',
            description: `Use AI (Claude) to fix build/test errors after upgrade (default: ${AI_DEFAULTS.FIX_BUILD_ERRORS})`,
          })
          .option('aiFixThirdPartyErrors', {
            type: 'boolean',
            description: `Use AI (Claude) to fix breaking changes from third-party updates (default: ${AI_DEFAULTS.FIX_THIRD_PARTY_ERRORS})`,
          })
          .option('aiFixEslintProperly', {
            type: 'boolean',
            description: `AI fixes ESLint by fixing code (true) vs adding disable comments (false) (default: ${AI_DEFAULTS.FIX_ESLINT_PROPERLY})`,
          })
          .option('aiFixTypeScriptWarnings', {
            type: 'boolean',
            description: `Use AI (Claude) to fix TypeScript warnings during build (default: ${AI_DEFAULTS.FIX_TYPESCRIPT_WARNINGS})`,
          })
          .option('aiMaxRetries', {
            type: 'number',
            description: `Max AI retry iterations for error fixing loops, 1-10 (default: ${RETRY_DEFAULTS.AI_MAX_RETRIES})`,
          })
          .option('agentProvider', {
            type: 'string',
            choices: ['claude'] as const,
            description: 'AI runtime (this public release currently supports only "claude")',
          })
          .option('agentModel', {
            type: 'string',
            choices: ['sonnet', 'opus'] as const,
            description: 'Claude model for this public release: "sonnet" (default) or "opus"',
          })
          .option('markdown', {
            type: 'boolean',
            alias: 'md',
            description: `Generate markdown upgrade report (default: ${OUTPUT_DEFAULTS.MARKDOWN})`,
          })
          .option("patchFile", {
            type: "string",
            description: `Path to patches YAML with manual steps and AI contexts (default: ${DEFAULTS.PATCHES_FILE})`,
          })
          .option('reportsDir', {
            type: 'string',
            description: 'Directory to save reports (default: pantoum_run_{runId}/ in current directory)',
          })
          .option('perSolutionReports', {
            type: 'boolean',
            description: `Save per-solution reports in solution directories (default: ${OUTPUT_DEFAULTS.PER_SOLUTION_REPORTS})`,
          })
          // Third-party dependency settings
          .option('updateThirdPartyDeps', {
            type: 'string',
            choices: ['none', 'patch', 'minor', 'major'] as const,
            description: `Update non-SPFx production dependencies (default: ${DEPENDENCY_DEFAULTS.UPDATE_PRODUCTION_DEPS})`,
          })
          .option('updateThirdPartyDevDeps', {
            type: 'string',
            choices: ['none', 'patch', 'minor', 'major'] as const,
            description: `Update non-SPFx dev dependencies (default: ${DEPENDENCY_DEFAULTS.UPDATE_DEV_DEPS})`,
          })
          .option('cleanInstallAfterDepUpdate', {
            type: 'boolean',
            description: `Remove node_modules and reinstall after dependency updates (default: ${DEPENDENCY_DEFAULTS.CLEAN_INSTALL_AFTER_UPDATE})`,
          })
          // Version update options
          .option('versionUpdates', {
            type: 'boolean',
            description: `Master switch: Enable/disable version updates in package.json and docs (default: ${VERSION_UPDATE_DEFAULTS.ENABLED})`,
          })
          .option('updatePackageJson', {
            type: 'boolean',
            description: `Increment MINOR version in package.json (default: ${VERSION_UPDATE_DEFAULTS.UPDATE_PACKAGE_JSON})`,
          })
          .option('updateReadme', {
            type: 'boolean',
            description: `Update README.md with new version info (default: ${VERSION_UPDATE_DEFAULTS.UPDATE_README})`,
          })
          .option('updateBadges', {
            type: 'boolean',
            description: `Update version badges in documentation (default: ${VERSION_UPDATE_DEFAULTS.UPDATE_BADGES})`,
          })
          .option('updateVersionHistory', {
            type: 'boolean',
            description: `Maintain version history in documentation (default: ${VERSION_UPDATE_DEFAULTS.UPDATE_HISTORY})`,
          })
          .option('versionComment', {
            type: 'string',
            description: `Comment to add when updating versions (default: "${VERSION_UPDATE_DEFAULTS.VERSION_COMMENT}")`,
          })
          // PnP template settings
          .option('PnPnvmrc', {
            type: 'boolean',
            description: `Update .nvmrc file (PnP templates) (default: ${PNP_DEFAULTS.UPDATE_NVMRC})`,
          })
          .option('PnPdevcontainer', {
            type: 'boolean',
            description: `Update .devcontainer configuration (PnP templates) (default: ${PNP_DEFAULTS.UPDATE_DEVCONTAINER})`,
          })
          // Complexity analysis options
          .option('analyzeComplexity', {
            type: 'boolean',
            description: `Analyze solution complexity before upgrade, makes ~150 npm requests (default: ${COMPLEXITY_DEFAULTS.CLI_ENABLED})`,
          })
          .option('includeDevDepsComplexity', {
            type: 'boolean',
            description: `Include dev dependencies in complexity analysis (default: ${COMPLEXITY_DEFAULTS.INCLUDE_DEV_DEPS})`,
          })
          // Debug options
          .option('debugReports', {
            type: 'boolean',
            description: `Generate verbose debug files (default: ${OUTPUT_DEFAULTS.DEBUG_REPORTS})`,
          })
          // Environment injection strategy for Heft migration
          .option('envInjectionStrategy', {
            type: 'string',
            choices: ['webpack-patch', 'none'] as const,
            description: `Env var handling in SPFx 1.22+ Heft (default: ${DEFAULT_ENV_INJECTION_STRATEGY})`,
          })
          .check((argv) => {
            if (!argv.localPath) {
              // Default to current directory
              argv.localPath = '.';
            }
            return true;
          });
      },
      async (argv) => {
        await runUpgrade(argv as unknown as CliArgs);
      }
    )
    .command(
      'doctor',
      'Check system requirements and environment',
      (yargs) => {
        return yargs
          .option('json', {
            type: 'boolean',
            default: false,
            description: 'Output results as JSON',
          })
          .option('verbose', {
            type: 'boolean',
            alias: 'v',
            default: false,
            description: 'Show detailed diagnostic information',
          });
      },
      async (argv) => {
        const { runDoctor } = await import('./commands/doctor.js');
        await runDoctor({ json: argv.json, verbose: argv.verbose });
      }
    )
    .help()
    .alias('help', 'h')
    .demandCommand(1, 'You must provide a command')
    .strict()
    .argv;
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  process.exit(130); // 128 + 2 (SIGINT)
});
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  process.exit(143); // 128 + 15 (SIGTERM)
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
