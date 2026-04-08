import { describe, it, expect } from 'vitest';
import { buildDefaultSettings } from '../defaults.js';
import { SETTING_DESCRIPTIONS } from '../../pantoum-webapp/shared/types/Settings.js';

/**
 * Ensures that the webapp's PantoumSettings interface (represented by
 * SETTING_DESCRIPTIONS keys) stays aligned with the canonical
 * buildDefaultSettings() from defaults.ts.
 *
 * Since DEFAULT_SETTINGS was removed (the webapp now loads defaults from
 * the core engine at runtime via defaultsLoader.ts), this test verifies
 * structural key parity rather than value equality.
 */
describe('Settings alignment: defaults.ts keys vs webapp PantoumSettings', () => {
  const canonical = buildDefaultSettings();
  const canonicalKeys = Object.keys(canonical).sort();
  const webappKeys = Object.keys(SETTING_DESCRIPTIONS).sort();

  it('every canonical default key should exist in the webapp interface', () => {
    for (const key of canonicalKeys) {
      expect(webappKeys, `webapp PantoumSettings is missing key: ${key}`).toContain(key);
    }
  });

  it('every webapp interface key should exist in canonical defaults', () => {
    for (const key of webappKeys) {
      expect(canonicalKeys, `defaults.ts is missing key: ${key}`).toContain(key);
    }
  });

  it('key sets should be identical', () => {
    expect(canonicalKeys).toEqual(webappKeys);
  });
});
