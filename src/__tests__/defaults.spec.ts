import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TARGET_VERSION,
  DEFAULT_THINKING_EFFORT,
  AI_DEFAULTS,
  CLAUDE_MODELS,
  TIMEOUTS,
  VERIFICATION_DEFAULTS,
  COMPLEXITY_DEFAULTS,
  buildDefaultSettings,
} from '../defaults.js';

describe('defaults', () => {
  describe('DEFAULT_TARGET_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(DEFAULT_TARGET_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('CLAUDE_MODELS', () => {
    it('should define sonnet, opus, and haiku', () => {
      expect(CLAUDE_MODELS.SONNET).toContain('sonnet');
      expect(CLAUDE_MODELS.OPUS).toContain('opus');
      expect(CLAUDE_MODELS.HAIKU).toContain('haiku');
    });

    it('should have valid model ID format', () => {
      expect(CLAUDE_MODELS.SONNET).toMatch(/^claude-/);
      expect(CLAUDE_MODELS.OPUS).toMatch(/^claude-/);
      expect(CLAUDE_MODELS.HAIKU).toMatch(/^claude-/);
    });
  });

  describe('AI_DEFAULTS', () => {
    it('should have M365 errors fix enabled by default', () => {
      expect(AI_DEFAULTS.FIX_M365_ERRORS).toBe(true);
    });

    it('should have build errors fix enabled by default', () => {
      expect(AI_DEFAULTS.FIX_BUILD_ERRORS).toBe(true);
    });

    it('should have ESLint proper fix enabled by default', () => {
      expect(AI_DEFAULTS.FIX_ESLINT_PROPERLY).toBe(true);
    });

    it('should have third-party error fix enabled by default', () => {
      expect(AI_DEFAULTS.FIX_THIRD_PARTY_ERRORS).toBe(true);
    });

    it('should have TypeScript warnings fix enabled by default', () => {
      expect(AI_DEFAULTS.FIX_TYPESCRIPT_WARNINGS).toBe(true);
    });
  });

  describe('TIMEOUTS', () => {
    it('should have all timeouts as positive numbers', () => {
      for (const [, value] of Object.entries(TIMEOUTS)) {
        expect(value).toBeGreaterThan(0);
      }
    });

    it('should have build command timeout >= 1 minute', () => {
      expect(TIMEOUTS.BUILD_COMMAND).toBeGreaterThanOrEqual(60000);
    });

    it('should have Claude migration timeout >= 5 minutes', () => {
      expect(TIMEOUTS.CLAUDE_MIGRATION).toBeGreaterThanOrEqual(300000);
    });
  });

  describe('VERIFICATION_DEFAULTS', () => {
    it('should have max iterations between 1 and 10', () => {
      expect(VERIFICATION_DEFAULTS.MAX_ITERATIONS).toBeGreaterThanOrEqual(1);
      expect(VERIFICATION_DEFAULTS.MAX_ITERATIONS).toBeLessThanOrEqual(10);
    });
  });

  describe('COMPLEXITY_DEFAULTS', () => {
    it('should have CLI enabled and webapp disabled by default', () => {
      expect(COMPLEXITY_DEFAULTS.CLI_ENABLED).toBe(true);
      expect(COMPLEXITY_DEFAULTS.WEBAPP_ENABLED).toBe(false);
    });
  });

  describe('buildDefaultSettings', () => {
    it('should return a complete settings object', () => {
      const settings = buildDefaultSettings();
      expect(settings).toBeDefined();
      expect(settings.target_version).toBe(DEFAULT_TARGET_VERSION);
      expect(settings.agent_provider).toBe('claude');
      expect(settings.agent_model).toBe('sonnet');
      expect(settings.ai_max_retries).toBe(3);
    });

    it('should have all expected keys', () => {
      const settings = buildDefaultSettings();
      const expectedKeys = [
        'target_version', 'excluded_patches', 'env_injection_strategy',
        'agent_provider', 'agent_model', 'thinking_effort',
        'update_version_numbers', 'update_package_json', 'update_readme_files',
        'update_version_badges', 'maintain_version_history', 'version_comment',
        'update_nvmrc_file', 'update_devcontainer_config',
        'update_production_deps', 'update_dev_deps', 'clean_install_after_updates',
        'ai_fix_third_party_errors', 'per_solution_reports', 'write_pantoum_history',
        'disable_animations', 'continue_on_solution_fail',
        'ai_fix_m365_errors', 'ai_fix_build_errors',
        'ai_fix_eslint_properly', 'ai_fix_typescript_warnings', 'ai_max_retries',
        'analyze_complexity', 'include_dev_deps_complexity', 'max_parallel_upgrades',
      ];
      for (const key of expectedKeys) {
        expect(settings).toHaveProperty(key);
      }
    });

    it('should reflect AI_DEFAULTS values', () => {
      const settings = buildDefaultSettings();
      expect(settings.ai_fix_m365_errors).toBe(AI_DEFAULTS.FIX_M365_ERRORS);
      expect(settings.ai_fix_build_errors).toBe(AI_DEFAULTS.FIX_BUILD_ERRORS);
      expect(settings.ai_fix_eslint_properly).toBe(AI_DEFAULTS.FIX_ESLINT_PROPERLY);
      expect(settings.ai_fix_third_party_errors).toBe(AI_DEFAULTS.FIX_THIRD_PARTY_ERRORS);
      expect(settings.ai_fix_typescript_warnings).toBe(AI_DEFAULTS.FIX_TYPESCRIPT_WARNINGS);
    });

    it('should have thinking_effort default to medium', () => {
      const settings = buildDefaultSettings();
      expect(settings.thinking_effort).toBe(DEFAULT_THINKING_EFFORT);
      expect(settings.thinking_effort).toBe('medium');
    });

    it('should use CLI_ENABLED for analyze_complexity', () => {
      const settings = buildDefaultSettings();
      expect(settings.analyze_complexity).toBe(COMPLEXITY_DEFAULTS.CLI_ENABLED);
    });
  });
});
