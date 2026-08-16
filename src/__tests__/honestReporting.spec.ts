import { describe, expect, it } from 'vitest';
import { isProviderServiceError } from '../core/errorAnalyzer/index.js';
import { PatchService } from '../core/patchService.js';
import type { VerificationSummary } from '../schema/verificationSchema.js';

// The 2026-08-16 runs pinned the two honesty requirements: a backend
// rejection must never read as "the AI could not fix it", and a FAILED
// migration verification must never end in a reported success.

describe('isProviderServiceError', () => {
  it('recognizes the captured Azure content-policy 400', () => {
    const real =
      "Execution failed: CAPIError: 400 The response was filtered due to the prompt triggering Azure OpenAI's content management policy. " +
      '(Request ID: F411:43E5:B6F2B0:EF912B:6A819089) [status=400, type=query, providerCallId=F411:43E5:B6F2B0:EF912B:6A819089]';
    expect(isProviderServiceError(real)).toBe(true);
  });

  it('recognizes annotated 5xx provider failures', () => {
    expect(isProviderServiceError('Execution failed [status=503, providerCallId=abc]')).toBe(true);
  });

  it('does not flag model or environment failures', () => {
    expect(isProviderServiceError('Timeout after 600000ms waiting for session.idle')).toBe(false);
    expect(isProviderServiceError('spawn claude ENOENT')).toBe(false);
    expect(isProviderServiceError('Claude could not generate fixes for these errors')).toBe(false);
  });
});

describe('migration verification teeth', () => {
  const summary = (status: 'PASSED' | 'FAILED'): VerificationSummary => ({
    status,
    totalIterations: 3,
    finalResult: {
      timestamp: new Date().toISOString(),
      packageName: '@pnp/sp',
      fromVersion: '3.24.0',
      toVersion: '4.16.0',
      verified: status === 'PASSED' ? 7 : 5,
      total: 7,
      allPassed: status === 'PASSED',
      iteration: 3,
      checks: [],
      toolCalls: [],
    },
    allResults: [],
    remainingIssues:
      status === 'FAILED'
        ? [{ pattern: '\\.data\\.ID', locations: ['src/a.ts:10', 'src/b.ts:20'] }]
        : undefined,
  });

  const assertPassed = (verification: VerificationSummary | undefined) =>
    (new PatchService() as any).assertVerificationPassed(verification, '@pnp/sp');

  it('passes silently when verification PASSED or never ran', () => {
    expect(() => assertPassed(summary('PASSED'))).not.toThrow();
    expect(() => assertPassed(undefined)).not.toThrow();
  });

  it('fails the solution loudly when verification ended FAILED', () => {
    expect(() => assertPassed(summary('FAILED'))).toThrow(
      /Migration verification failed for @pnp\/sp after 3 iteration\(s\).*\\\.data\\\.ID \(2 occurrence\(s\)\)/,
    );
  });
});
