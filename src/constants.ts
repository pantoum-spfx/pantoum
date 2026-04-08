/**
 * Centralized constants for PANTOUM
 *
 * Re-exports from src/defaults.ts for convenience.
 */

// Re-export from centralized defaults
export {
  // Types
  type EnvInjectionStrategy,
} from './defaults.js';

// Import for DEFAULTS object construction
import {
  CLAUDE_MODELS,
  DEFAULT_ENV_INJECTION_STRATEGY,
} from './defaults.js';

export const DEFAULTS = {
  GIT_BRANCH: 'main',
  PATCHES_FILE: 'pantoum.patches.yml',
  CLAUDE_MODEL: CLAUDE_MODELS.SONNET,
  CLAUDE_OPUS_MODEL: CLAUDE_MODELS.OPUS,
  CLAUDE_HAIKU_MODEL: CLAUDE_MODELS.HAIKU,
  ENCODING: 'utf8' as const,
} as const;

export const FLAGS = {
  SILENT: false,
} as const;

export { TIMEOUTS, FILE_PATTERNS, SPFX_CONFIG_FILES } from './defaults.js';
