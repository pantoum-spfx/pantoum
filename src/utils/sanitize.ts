/**
 * Security sanitization utilities for PANTOUM.
 *
 * - sanitizeErrorForLogging: strips API keys and secrets from error messages
 * - sanitizePathForPrompt: validates file paths before embedding in AI prompts
 * - validateShellCommand: validates shell commands against an allowlist
 */

// Patterns that match sensitive values in error messages / stack traces
const SENSITIVE_PATTERNS: RegExp[] = [
  /ANTHROPIC_API_KEY\s*=\s*\S+/gi,
  /CLAUDE_ACCESS_TOKEN\s*=\s*\S+/gi,
  /CLAUDE_CODE_AUTH\s*=\s*\S+/gi,
  /Bearer\s+sk-ant-[a-zA-Z0-9_-]+/gi,
  /sk-ant-[a-zA-Z0-9_-]{20,}/gi,
  /(api[_-]?key|token|secret|password|credential)\s*[=:]\s*\S+/gi,
];

/**
 * Strip sensitive data (API keys, tokens, credentials) from error messages
 * before writing to log files or reports.
 */
export function sanitizeErrorForLogging(error: unknown): string {
  let message: string;
  if (error instanceof Error) {
    message = error.stack || error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = String(error);
  }

  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// Patterns that indicate prompt injection attempts in file paths
const INJECTION_PATTERNS: RegExp[] = [
  /##\s*(system|human|assistant)/i,
  /<\/?system>/i,
  /<\/?human>/i,
  /<\/?assistant>/i,
];

/**
 * Sanitize a file path before embedding it in an AI prompt.
 * Strips control characters, null bytes, escapes backticks,
 * and rejects paths that look like prompt injection attempts.
 */
export function sanitizePathForPrompt(filePath: string): string {
  // Remove null bytes and control characters (except common whitespace)
  let clean = filePath.replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // Strip backticks to prevent code fence injection in AI prompts
  clean = clean.replace(/`/g, '');

  // Block paths that contain prompt injection markers
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      throw new Error(`Potentially malicious file path rejected: ${filePath.substring(0, 50)}`);
    }
  }

  return clean;
}

// Commands that are allowed to run via shell execution.
// These cover the standard SPFx build toolchain.
const ALLOWED_COMMAND_PATTERNS: RegExp[] = [
  /^npm\s+(install|ci|run|dedupe|cache|audit|test|start|exec)/,
  /^npx\s+/,
  /^node\s+/,
  /^gulp\s+/,
  /^heft\s+(build|test|clean)/,
  /^git\s+(add|commit|status|diff|log|checkout|branch|push|pull|stash)/,
  /^rm\s+-rf?\s+node_modules/,
  /^rimraf\s+/,
  /^echo\s+/,
  /^cat\s+/,
  /^mkdir\s+/,
  /^cp\s+/,
  /^mv\s+/,
  /^rush\s+(install|build|update|rebuild)/,
  /^pnpm\s+(install|run|exec)/,
  /^yarn\s+(install|run|add|remove)/,
];

// Patterns that indicate potentially dangerous shell constructs
const BLOCKED_PATTERNS: RegExp[] = [
  /;\s*(curl|wget|bash|sh|python|perl|ruby|nc|ncat)\s/,
  /\$\(/,                         // Command substitution
  /`[^`]+`/,                      // Backtick substitution
  /\|\s*(bash|sh|python|perl)/,   // Pipe to shell interpreter
  />\s*\/etc\//,                  // Write to system dirs
  />>\s*\/etc\//,
];

/**
 * Validate a shell command against an allowlist before execution.
 * Throws if the command matches a blocked pattern or is not in the allowlist.
 */
export function validateShellCommand(command: string): void {
  const trimmed = command.trim();

  // Check blocked patterns first
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new Error(`Shell command blocked by security policy: ${trimmed.substring(0, 80)}`);
    }
  }

  // Then check allowlist
  const isAllowed = ALLOWED_COMMAND_PATTERNS.some(p => p.test(trimmed));
  if (!isAllowed) {
    throw new Error(`Shell command not in allowlist: ${trimmed.substring(0, 80)}. Add to ALLOWED_COMMAND_PATTERNS in sanitize.ts if this command is safe.`);
  }
}
