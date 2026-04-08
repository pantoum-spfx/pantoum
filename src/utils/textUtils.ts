/**
 * Text utility functions for PANTOUM
 */

import stripJsonCommentsLib from 'strip-json-comments';

/**
 * Remove all ANSI escape sequences from a string
 * @param str The string to clean
 * @returns The string with all ANSI codes removed
 */
export function stripAnsiCodes(str: string): string {
  // Remove all ANSI escape sequences
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Strip comments from JSON-like text to make it valid JSON
 * Handles both single-line (//) and multi-line comments
 * Uses the battle-tested strip-json-comments package
 * @param jsonText The JSON text possibly containing comments
 * @returns Valid JSON text without comments
 */
export function stripJsonComments(jsonText: string): string {
  // Use strip-json-comments package for reliable comment stripping
  let result = stripJsonCommentsLib(jsonText);

  // Remove trailing commas before } or ] (not handled by the package)
  result = result.replace(/,(\s*[}\]])/g, '$1');

  return result;
}