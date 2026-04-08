import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import type { PantoumSettings } from '../../shared/types/Settings.js';
import { loadDefaultSettings } from '../services/defaultsLoader.js';

const defaultsPromise = loadDefaultSettings();
type LegacyPantoumSettings = Partial<PantoumSettings> & { claude_model?: string };
const SUPPORTED_AGENT_MODELS = ['sonnet', 'opus'] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve the PANTOUM root (two levels up from server/routes/) */
function getPantoumRoot(): string {
  return path.resolve(__dirname, '../../..');
}

/** Find settings file path, with backward compat for tui.settings.yml */
function getSettingsPath(): string {
  const root = getPantoumRoot();
  const primaryPath = path.join(root, 'pantoum.settings.yml');
  const legacyPath = path.join(root, 'tui.settings.yml');

  if (fs.existsSync(primaryPath)) return primaryPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  return primaryPath; // Default to new name
}

export const settingsRouter = Router();

function normalizeAgentModel(
  candidate: string | undefined,
  fallback: PantoumSettings['agent_model'],
): PantoumSettings['agent_model'] {
  if (!candidate) return fallback;

  const lower = candidate.toLowerCase();
  if (SUPPORTED_AGENT_MODELS.includes(lower as PantoumSettings['agent_model'])) {
    return lower as PantoumSettings['agent_model'];
  }

  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';

  return fallback;
}

function normalizeSettings(
  input: LegacyPantoumSettings,
  defaults: PantoumSettings,
): PantoumSettings {
  const { claude_model: legacyModel, agent_provider: _ignoredProvider, ...rest } =
    input as LegacyPantoumSettings & Record<string, unknown>;

  const requestedModel =
    typeof rest.agent_model === 'string'
      ? rest.agent_model
      : typeof legacyModel === 'string'
        ? legacyModel
        : defaults.agent_model;

  return {
    ...defaults,
    ...(rest as Partial<PantoumSettings>),
    agent_provider: 'claude',
    agent_model: normalizeAgentModel(requestedModel, defaults.agent_model),
  };
}

/**
 * GET /api/settings - Load current settings
 */
settingsRouter.get('/', async (_req, res) => {
  try {
    const defaults = await defaultsPromise;
    const settingsPath = getSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return res.json({
        settings: { ...defaults },
        source: 'defaults',
        path: settingsPath,
      });
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const loaded = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as LegacyPantoumSettings;
    const settings = normalizeSettings(loaded, defaults);

    res.json({
      settings,
      source: 'file',
      path: settingsPath,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/settings/defaults - Return default values
 */
settingsRouter.get('/defaults', async (_req, res) => {
  const defaults = await defaultsPromise;
  res.json({ defaults });
});

/**
 * POST /api/settings - Save settings
 */
settingsRouter.post('/', async (req, res) => {
  try {
    const settings = req.body as PantoumSettings;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    // Merge with defaults to ensure all fields are present
    const defaults = await defaultsPromise;
    const merged = normalizeSettings(settings, defaults);
    const yamlContent = generateSettingsYAML(merged);

    // Always save with the new name
    const root = getPantoumRoot();
    const settingsPath = path.join(root, 'pantoum.settings.yml');
    fs.writeFileSync(settingsPath, yamlContent, 'utf-8');

    res.json({
      success: true,
      path: settingsPath,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/settings/reset - Reset to defaults
 */
settingsRouter.post('/reset', async (_req, res) => {
  try {
    const defaults = await defaultsPromise;
    const root = getPantoumRoot();
    const settingsPath = path.join(root, 'pantoum.settings.yml');
    const yamlContent = generateSettingsYAML(defaults);
    fs.writeFileSync(settingsPath, yamlContent, 'utf-8');

    res.json({
      success: true,
      settings: defaults,
      path: settingsPath,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to reset settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/settings/import - Import settings from YAML content (browser file picker reads the file)
 */
settingsRouter.post('/import', async (req, res) => {
  try {
    const { content, fileName } = req.body as { content: string; fileName?: string };
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing YAML content' });
    }

    const defaults = await defaultsPromise;
    const loaded = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as LegacyPantoumSettings;
    const settings = normalizeSettings(loaded, defaults);

    res.json({
      settings,
      source: 'file' as const,
      fileName: fileName || 'imported.yml',
    });
  } catch (error) {
    res.status(400).json({
      error: 'Invalid YAML file',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/settings/export - Export current settings as downloadable YAML
 */
settingsRouter.get('/export', async (_req, res) => {
  try {
    const defaults = await defaultsPromise;
    const settingsPath = getSettingsPath();

    let settings: PantoumSettings;
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const loaded = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as LegacyPantoumSettings;
      settings = normalizeSettings(loaded, defaults);
    } else {
      settings = { ...defaults };
    }

    const yamlContent = generateSettingsYAML(settings);
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', 'attachment; filename="pantoum.settings.yml"');
    res.send(yamlContent);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to export settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Generate YAML with comments for readability (matches pantoum settings format)
 */
function generateSettingsYAML(settings: PantoumSettings): string {
  const lines: string[] = [
    '# PANTOUM Settings',
    '# Configure how upgrades are performed',
    '',
    '# === Target Configuration ===',
    `target_version: "${settings.target_version}"`,
    `excluded_patches: ${settings.excluded_patches.length > 0 ? '[' + settings.excluded_patches.map(p => `"${p}"`).join(', ') + ']' : '[]'}`,
    `env_injection_strategy: "${settings.env_injection_strategy}"`,
    '',
    '# === Version Updates ===',
    `update_version_numbers: ${settings.update_version_numbers}`,
    `update_package_json: ${settings.update_package_json}`,
    `update_readme_files: ${settings.update_readme_files}`,
    `update_version_badges: ${settings.update_version_badges}`,
    `maintain_version_history: ${settings.maintain_version_history}`,
    `version_comment: "${settings.version_comment}"`,
    '',
    '# === Node.js Configuration (PnP Templates) ===',
    `update_nvmrc_file: ${settings.update_nvmrc_file}`,
    `update_devcontainer_config: ${settings.update_devcontainer_config}`,
    '',
    '# === Third-Party Dependencies ===',
    `update_production_deps: "${settings.update_production_deps}"`,
    `update_dev_deps: "${settings.update_dev_deps}"`,
    `clean_install_after_updates: ${settings.clean_install_after_updates}`,
    `ai_fix_third_party_errors: ${settings.ai_fix_third_party_errors}`,
    '',
    '# === Output Options ===',
    `per_solution_reports: ${settings.per_solution_reports}`,
    `disable_animations: ${settings.disable_animations}`,
    '',
    '# === AI Runtime ===',
    `agent_provider: "${settings.agent_provider}"`,
    `agent_model: "${settings.agent_model}"`,
    `thinking_effort: "${settings.thinking_effort}"`,
    `continue_on_solution_fail: ${settings.continue_on_solution_fail}`,
    `ai_fix_m365_errors: ${settings.ai_fix_m365_errors}`,
    `ai_fix_build_errors: ${settings.ai_fix_build_errors}`,
    `ai_fix_eslint_properly: ${settings.ai_fix_eslint_properly}`,
    `ai_fix_typescript_warnings: ${settings.ai_fix_typescript_warnings}`,
    `ai_max_retries: ${settings.ai_max_retries}`,
    '',
    '# === History & Parallelism ===',
    `write_pantoum_history: ${settings.write_pantoum_history}`,
    `max_parallel_upgrades: ${settings.max_parallel_upgrades}`,
    '',
    '# === Complexity Analysis ===',
    `analyze_complexity: ${settings.analyze_complexity}`,
    `include_dev_deps_complexity: ${settings.include_dev_deps_complexity}`,
  ];

  return lines.join('\n') + '\n';
}
