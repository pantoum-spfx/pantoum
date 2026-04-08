import { logger } from './logger.js';

/**
 * SPFx projects MUST use npm - pnpm causes build failures
 * even with --shamefully-hoist flag due to dependency resolution issues.
 *
 * This module is kept for future flexibility but currently always returns npm.
 */

/**
 * Get the package manager for SPFx solutions (always npm)
 *
 * Note: pnpm was previously supported but removed because:
 * - pnpm with --shamefully-hoist fails to resolve @microsoft/sp-* packages
 * - All SPFx pipelines use npm
 * - 0/75 solutions built with pnpm vs 75/75 with npm
 */
export function detectPackageManager(_solutionPath: string): 'npm' {
  logger.info('   → Using npm (required for SPFx)');
  return 'npm';
}

/**
 * Get the install command (always npm install)
 */
export function getInstallCommand(_pm: 'npm'): string[] {
  return ['npm', 'install'];
}

/**
 * Get the install command as a string
 */
export function getInstallCommandString(_pm: 'npm'): string {
  return 'npm install';
}
