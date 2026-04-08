/**
 * Loads default settings from the core engine's buildDefaultSettings().
 * Uses the same dynamic-import pattern as UpgradeOrchestrator.ts to cross
 * the build boundary between the webapp and the core engine.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import type { PantoumSettings } from '../../shared/types/Settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORE_ROOT = path.resolve(__dirname, '../../..');

let _cached: PantoumSettings | null = null;

export async function loadDefaultSettings(): Promise<PantoumSettings> {
  if (_cached) return _cached;
  const mod = await import(/* @vite-ignore */ path.join(CORE_ROOT, 'src/defaults.js'));
  const defaults = mod.buildDefaultSettings() as PantoumSettings;
  defaults.analyze_complexity = mod.COMPLEXITY_DEFAULTS.WEBAPP_ENABLED;
  _cached = defaults;
  return defaults;
}
