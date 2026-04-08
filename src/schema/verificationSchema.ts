// src/schema/verificationSchema.ts

/**
 * Verification schema for Claude Self-Verification system.
 *
 * Enables a verification loop where Claude verifies its own migration work
 * by running explicit grep commands and showing evidence (not just claiming "done").
 *
 * Inspired by superpowers' evidence-based verification pattern:
 * IDENTIFY → RUN → READ → VERIFY → CLAIM
 */

/**
 * Status of a verification check
 */
type VerificationStatus = 'VERIFIED' | 'NOT_VERIFIED';

/**
 * A tool call captured during verification
 */
export interface VerificationToolCall {
  /** Timestamp of the tool call */
  timestamp: string;
  /** Tool name (e.g., 'Grep', 'Read', 'Bash') */
  tool: string;
  /** Tool input (command, path, pattern, etc.) */
  input: Record<string, any>;
  /** Tool output (if captured) */
  output?: string;
}

/**
 * A single verification check with evidence
 */
export interface VerificationCheck {
  /** The instruction being verified (e.g., "Remove .data.ID pattern") */
  instruction: string;
  /** The pattern that should NOT exist (e.g., ".data.ID") */
  pattern: string;
  /** The grep command that was run */
  command: string;
  /** Verification status */
  status: VerificationStatus;
  /** Actual grep output (evidence) */
  evidence: string;
  /** Raw grep output from the command */
  grepOutput?: string;
  /** Remaining occurrences if NOT_VERIFIED (file:line format) */
  findings?: string[];
}

/**
 * Result of a complete verification pass
 */
export interface VerificationResult {
  /** Timestamp of verification */
  timestamp: string;
  /** Package being migrated (e.g., "@pnp/sp") */
  packageName: string;
  /** Version migrating from */
  fromVersion: string;
  /** Version migrating to */
  toVersion: string;
  /** Number of checks that passed */
  verified: number;
  /** Total number of checks */
  total: number;
  /** True if all checks passed */
  allPassed: boolean;
  /** Which iteration this result is from (1, 2, or 3) */
  iteration: number;
  /** Individual verification checks with evidence */
  checks: VerificationCheck[];
  /** All tool calls made during this verification iteration */
  toolCalls?: VerificationToolCall[];
  /** Fixes applied after this iteration (if not last iteration) */
  fixesApplied?: Array<{
    file: string;
    pattern: string;
    action: string;
  }>;
}

/**
 * Summary of the verification loop
 */
export interface VerificationSummary {
  /** Final status after all iterations */
  status: 'PASSED' | 'FAILED';
  /** Total iterations performed (1-3) */
  totalIterations: number;
  /** Final verification result */
  finalResult: VerificationResult;
  /** All iteration results for debugging */
  allResults: VerificationResult[];
  /** Issues that remain unfixed (if status is FAILED) */
  remainingIssues?: {
    pattern: string;
    locations: string[];
  }[];
}
