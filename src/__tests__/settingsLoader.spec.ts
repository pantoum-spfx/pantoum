import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  findSettingsFile,
  loadSettingsFile,
  resolveSettings,
  settingsToCamelCase,
  resolveModelId,
  CLAUDE_MODEL_MAP,
  CLI_FIELD_MAP,
} from '../settingsLoader.js';
import { buildDefaultSettings, CLAUDE_MODELS } from '../defaults.js';

describe('settingsLoader', () => {
  describe('CLAUDE_MODEL_MAP', () => {
    it('should map shortnames to full model IDs', () => {
      expect(CLAUDE_MODEL_MAP.sonnet).toBe(CLAUDE_MODELS.SONNET);
      expect(CLAUDE_MODEL_MAP.opus).toBe(CLAUDE_MODELS.OPUS);
      expect(CLAUDE_MODEL_MAP.haiku).toBe(CLAUDE_MODELS.HAIKU);
    });
  });

  describe('resolveModelId', () => {
    it('should resolve shortnames to full IDs', () => {
      expect(resolveModelId('sonnet')).toBe(CLAUDE_MODELS.SONNET);
      expect(resolveModelId('opus')).toBe(CLAUDE_MODELS.OPUS);
      expect(resolveModelId('haiku')).toBe(CLAUDE_MODELS.HAIKU);
    });

    it('should be case-insensitive', () => {
      expect(resolveModelId('SONNET')).toBe(CLAUDE_MODELS.SONNET);
      expect(resolveModelId('Opus')).toBe(CLAUDE_MODELS.OPUS);
    });

    it('should pass through full model IDs unchanged', () => {
      expect(resolveModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
      expect(resolveModelId('custom-model-id')).toBe('custom-model-id');
    });
  });

  describe('CLI_FIELD_MAP', () => {
    it('should map all expected settings keys', () => {
      expect(CLI_FIELD_MAP.target_version).toBe('targetVersion');
      expect(CLI_FIELD_MAP.agent_provider).toBe('agentProvider');
      expect(CLI_FIELD_MAP.agent_model).toBe('agentModel');
      expect(CLI_FIELD_MAP.thinking_effort).toBe('thinkingEffort');
      expect(CLI_FIELD_MAP.ai_fix_m365_errors).toBe('aiFixM365Errors');
      expect(CLI_FIELD_MAP.continue_on_solution_fail).toBe('onSingleSolutionFail');
    });
  });

  describe('findSettingsFile', () => {
    const tmpDir = path.join(process.cwd(), 'src/__tests__/.tmp-settings-test');

    beforeEach(() => {
      fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return undefined when no settings file exists', () => {
      // Pass tmpDir as CWD to prevent fallback to real project root
      expect(findSettingsFile(tmpDir, tmpDir)).toBeUndefined();
    });

    it('should find pantoum.settings.yml', () => {
      fs.writeFileSync(path.join(tmpDir, 'pantoum.settings.yml'), 'target_version: "1.22.1"');
      expect(findSettingsFile(tmpDir)).toBe(path.join(tmpDir, 'pantoum.settings.yml'));
    });

    it('should find legacy tui.settings.yml', () => {
      fs.writeFileSync(path.join(tmpDir, 'tui.settings.yml'), 'target_version: "1.22.1"');
      expect(findSettingsFile(tmpDir)).toBe(path.join(tmpDir, 'tui.settings.yml'));
    });

    it('should prefer pantoum.settings.yml over tui.settings.yml', () => {
      fs.writeFileSync(path.join(tmpDir, 'pantoum.settings.yml'), 'target_version: "1.22.1"');
      fs.writeFileSync(path.join(tmpDir, 'tui.settings.yml'), 'target_version: "1.21.0"');
      expect(findSettingsFile(tmpDir)).toBe(path.join(tmpDir, 'pantoum.settings.yml'));
    });

    describe('CWD fallback', () => {
      const cwdDir = path.join(process.cwd(), 'src/__tests__/.tmp-settings-cwd');
      const solutionDir = path.join(process.cwd(), 'src/__tests__/.tmp-settings-solution');

      beforeEach(() => {
        fs.mkdirSync(cwdDir, { recursive: true });
        fs.mkdirSync(solutionDir, { recursive: true });
      });

      afterEach(() => {
        fs.rmSync(cwdDir, { recursive: true, force: true });
        fs.rmSync(solutionDir, { recursive: true, force: true });
      });

      it('should fall back to CWD when settings file not in searchDir', () => {
        fs.writeFileSync(path.join(cwdDir, 'pantoum.settings.yml'), 'target_version: "1.22.1"');
        expect(findSettingsFile(solutionDir, cwdDir)).toBe(path.join(cwdDir, 'pantoum.settings.yml'));
      });

      it('should fall back to CWD legacy file when not in searchDir', () => {
        fs.writeFileSync(path.join(cwdDir, 'tui.settings.yml'), 'target_version: "1.22.1"');
        expect(findSettingsFile(solutionDir, cwdDir)).toBe(path.join(cwdDir, 'tui.settings.yml'));
      });

      it('should prefer searchDir over CWD', () => {
        fs.writeFileSync(path.join(solutionDir, 'pantoum.settings.yml'), 'target_version: "1.21.0"');
        fs.writeFileSync(path.join(cwdDir, 'pantoum.settings.yml'), 'target_version: "1.22.1"');
        expect(findSettingsFile(solutionDir, cwdDir)).toBe(path.join(solutionDir, 'pantoum.settings.yml'));
      });

      it('should return undefined when not in searchDir or CWD', () => {
        expect(findSettingsFile(solutionDir, cwdDir)).toBeUndefined();
      });

      it('should not duplicate search when searchDir equals CWD', () => {
        // No file exists — should return undefined (not error)
        expect(findSettingsFile(cwdDir, cwdDir)).toBeUndefined();
      });
    });
  });

  describe('loadSettingsFile', () => {
    const tmpDir = path.join(process.cwd(), 'src/__tests__/.tmp-settings-test');

    beforeEach(() => {
      fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return empty object when no file exists', () => {
      // Pass tmpDir as CWD to prevent fallback to real project root
      expect(loadSettingsFile(tmpDir, tmpDir)).toEqual({});
    });

    it('should parse YAML settings', () => {
      fs.writeFileSync(path.join(tmpDir, 'pantoum.settings.yml'), [
        'target_version: "1.21.0"',
        'claude_model: "opus"',
        'ai_fix_build_errors: true',
      ].join('\n'));

      const settings = loadSettingsFile(tmpDir);
      expect(settings.target_version).toBe('1.21.0');
      expect(settings.agent_provider).toBe('claude');
      expect(settings.agent_model).toBe('opus');
      expect(settings.ai_fix_build_errors).toBe(true);
    });
  });

  describe('resolveSettings', () => {
    it('should return defaults when no file or overrides', () => {
      const settings = resolveSettings({});
      const defaults = buildDefaultSettings();
      expect(settings).toEqual(defaults);
    });

    it('should let file settings override defaults', () => {
      const settings = resolveSettings({ agent_model: 'opus' });
      expect(settings.agent_model).toBe('opus');
      // Other values remain default
      expect(settings.target_version).toBe(buildDefaultSettings().target_version);
    });

    it('should let overrides win over file settings', () => {
      const settings = resolveSettings(
        { agent_model: 'opus' },
        { agent_model: 'haiku' },
      );
      expect(settings.agent_model).toBe('sonnet');
    });

    it('should implement 3-layer priority: overrides > file > defaults', () => {
      const defaults = buildDefaultSettings();
      const fileSettings = { agent_model: 'opus', ai_max_retries: 5 };
      const overrides = { ai_max_retries: 7 };

      const settings = resolveSettings(fileSettings, overrides);

      // Override wins for ai_max_retries
      expect(settings.ai_max_retries).toBe(7);
      // File wins for agent_model
      expect(settings.agent_model).toBe('opus');
      // Default wins for everything else
      expect(settings.target_version).toBe(defaults.target_version);
    });

    it('should normalize legacy claude_model values to agent_model', () => {
      const settings = resolveSettings({} as any, { claude_model: 'opus' } as any);
      expect(settings.agent_provider).toBe('claude');
      expect(settings.agent_model).toBe('opus');
    });

    it('should normalize full Claude model IDs to the supported public model set', () => {
      const settings = resolveSettings({ agent_model: 'claude-opus-4-6' } as any);
      expect(settings.agent_model).toBe('opus');
    });

    it('should fall back to sonnet for unsupported public model values', () => {
      const settings = resolveSettings({ agent_model: 'haiku' } as any);
      expect(settings.agent_model).toBe('sonnet');
    });
  });

  describe('settingsToCamelCase', () => {
    it('should convert settings to camelCase CLI args', () => {
      const settings = buildDefaultSettings();
      const cliArgs = settingsToCamelCase(settings);

      expect(cliArgs.targetVersion).toBe(settings.target_version);
      expect(cliArgs.agentProvider).toBe(settings.agent_provider);
      expect(cliArgs.agentModel).toBe(settings.agent_model);
      expect(cliArgs.aiFixM365Errors).toBe(settings.ai_fix_m365_errors);
    });

    it('should convert continue_on_solution_fail boolean to halt/continue', () => {
      const settings = { ...buildDefaultSettings(), continue_on_solution_fail: false };
      expect(settingsToCamelCase(settings).onSingleSolutionFail).toBe('halt');

      settings.continue_on_solution_fail = true;
      expect(settingsToCamelCase(settings).onSingleSolutionFail).toBe('continue');
    });
  });
});
