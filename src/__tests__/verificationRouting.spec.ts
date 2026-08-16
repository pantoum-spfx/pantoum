import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const claudeCalls: string[] = [];
const copilotCalls: string[] = [];

function makeFakeAdapter(sink: string[]) {
  const adapter: Record<string, any> = {
    withModel: (model: string) => {
      sink.push(model);
      return adapter;
    },
    inDirectory: () => adapter,
    allowTools: () => adapter,
    withLogger: () => adapter,
    onToolUse: () => adapter,
    onAssistant: () => adapter,
    skipPermissions: () => adapter,
    withDebugFile: () => adapter,
    withSessionId: () => adapter,
    withThinkingEffort: () => adapter,
    withAbortController: () => adapter,
    withPersistSession: () => adapter,
    buildOptions: () => ({ options: {}, modelName: 'fake' }),
    query: () => ({
      asText: async () => ({ response: 'done', metrics: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0, durationMs: 1, turns: 1, toolExecutions: [], model: 'fake' } }),
    }),
  };
  return adapter;
}

vi.mock('../adapters/claudeAgentSdkAdapter.js', () => ({
  claude: () => makeFakeAdapter(claudeCalls),
}));

vi.mock('../adapters/githubCopilotSdkAdapter.js', () => ({
  copilot: () => makeFakeAdapter(copilotCalls),
}));

const { ClaudeMigrationExecutor } = await import('../core/claudeMigrationExecutor.js');
const { setActiveAgentProvider } = await import('../adapters/runtimeAdapterFactory.js');
const { CLAUDE_MODELS, GITHUB_COPILOT_MODELS } = await import('../defaults.js');

const testDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-verification-routing');

// One pattern is enough to engage the verification loop without touching the
// hardcoded per-package fallbacks.
const PATTERN_CONTEXT = { verificationPatterns: [{ pattern: 'legacyApi', description: 'Replace legacyApi' }] };

beforeEach(() => {
  claudeCalls.length = 0;
  copilotCalls.length = 0;
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  setActiveAgentProvider(undefined);
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('migration verification runtime routing', () => {
  // The 2026-08-15 Copilot regression shipped 5/10 solutions runtime-broken and
  // same-model verification approved every one of them. These tests pin the
  // structural fix: the verifier can run on a runtime the migration model
  // cannot influence.

  it('verification inherits the migration runtime when no override is configured', async () => {
    const executor = new ClaudeMigrationExecutor();

    await executor.executeMigrationWithVerification(
      testDir,
      '@pnp/sp',
      '2.15.0',
      '4.16.0',
      PATTERN_CONTEXT,
      GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
      testDir,
      false,
      1,
      undefined,
      'github-copilot',
    );

    // one migration session + one verification pass, both on the Copilot runtime
    expect(copilotCalls).toEqual([
      GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
      GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
    ]);
    expect(claudeCalls).toEqual([]);
  });

  it('runs verification on an independent runtime when a provider is configured', async () => {
    const executor = new ClaudeMigrationExecutor();

    await executor.executeMigrationWithVerification(
      testDir,
      '@pnp/sp',
      '2.15.0',
      '4.16.0',
      PATTERN_CONTEXT,
      GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
      testDir,
      false,
      1,
      undefined,
      'github-copilot',
      { provider: 'claude' },
    );

    expect(copilotCalls).toEqual([GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH]);
    // no model configured → the verification provider's default model
    expect(claudeCalls).toEqual([CLAUDE_MODELS.SONNET]);
  });

  it('a verification model alone selects its runtime, even when the run pins another provider', async () => {
    // resolveAgentProvider prefers the run-wide active provider over model
    // inference; the executor must not let that swallow a configured
    // verification model.
    setActiveAgentProvider('github-copilot');
    const executor = new ClaudeMigrationExecutor();

    await executor.executeMigrationWithVerification(
      testDir,
      '@pnp/sp',
      '2.15.0',
      '4.16.0',
      PATTERN_CONTEXT,
      GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
      testDir,
      false,
      1,
      undefined,
      'github-copilot',
      { model: CLAUDE_MODELS.SONNET },
    );

    expect(copilotCalls).toEqual([GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH]);
    expect(claudeCalls).toEqual([CLAUDE_MODELS.SONNET]);
  });
});
