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

const { ErrorAnalyzer } = await import('../core/errorAnalyzer/index.js');
const { setActiveAgentProvider } = await import('../adapters/runtimeAdapterFactory.js');
const { CLAUDE_MODELS, GITHUB_COPILOT_MODELS } = await import('../defaults.js');

const testDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-runtime-routing');

beforeEach(() => {
  claudeCalls.length = 0;
  copilotCalls.length = 0;
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  setActiveAgentProvider(undefined);
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('error-fix path runtime routing', () => {
  it('routes MAI/Copilot models to the GitHub Copilot SDK', async () => {
    const analyzer = new ErrorAnalyzer();

    await analyzer.executeClaudeCodeAnalysis(
      'fix the build',
      [],
      testDir,
      GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH,
      'build',
      testDir,
      false,
      undefined,
      'github-copilot',
    );

    expect(copilotCalls).toEqual([GITHUB_COPILOT_MODELS.MAI_CODE_1_1_FLASH]);
    expect(claudeCalls).toEqual([]);
  });

  it('sends the same build-fix prompt corpus to every provider (no per-provider forks)', async () => {
    // Captured Azure 400s (mai_realtimenews_run_20260813) showed the content filter
    // firing mid-loop on accumulated context while this same wording passed dozens
    // of requests — per-provider prompt variants were a fix for a misdiagnosed
    // cause and drifted immediately. This test pins corpus unity: if a provider
    // fork is reintroduced, it must be a deliberate, evidence-backed decision.
    const buildContext = (agentProvider: 'claude' | 'github-copilot') => ({
      solutionPath: testDir,
      solutionName: 'sample-solution',
      targetVersion: '1.23.0',
      errorOutput: 'Error - TS2304: Cannot find name "foo"',
      errorType: 'build' as const,
      stage: 'build-fix' as const,
      agentProvider,
      aiMaxRetries: 3,
    });

    const analyzer = new ErrorAnalyzer();
    const copilotResult = await analyzer.analyzeError(buildContext('github-copilot'));
    const claudeResult = await analyzer.analyzeError(buildContext('claude'));

    expect(copilotResult.analysisPrompt).toBe(claudeResult.analysisPrompt);
    expect(copilotResult.analysisPrompt).toContain('FORBIDDEN COMMANDS');
  });

  it('sends the same lint-cleanup and M365 error-fix prompts to every provider', async () => {
    // The other two createAnalysisPrompt branches — a fork reintroduced on
    // either path would pass the build-fix unity test above.
    const analyzer = new ErrorAnalyzer();

    for (const variant of [
      { errorType: 'build' as const, cleanupReason: 'eslint-warnings' },
      { errorType: 'upgrade-report' as const, cleanupReason: undefined },
    ]) {
      const context = (agentProvider: 'claude' | 'github-copilot') => ({
        solutionPath: testDir,
        solutionName: 'sample-solution',
        targetVersion: '1.23.0',
        errorOutput: 'warning: no-unused-vars in file.ts',
        errorType: variant.errorType,
        stage: 'build-fix' as const,
        cleanupReason: variant.cleanupReason,
        agentProvider,
        aiMaxRetries: 3,
      });

      const copilotResult = await analyzer.analyzeError(context('github-copilot'));
      const claudeResult = await analyzer.analyzeError(context('claude'));
      expect(copilotResult.analysisPrompt).toBe(claudeResult.analysisPrompt);
      expect(copilotResult.analysisPrompt.length).toBeGreaterThan(0);
    }
  });

  it('honours the provider pinned for the run even for unknown model ids', async () => {
    setActiveAgentProvider('github-copilot');
    const analyzer = new ErrorAnalyzer();

    await analyzer.executeClaudeCodeAnalysis('fix the build', [], testDir, 'unknown-model', 'build', testDir, false);

    expect(copilotCalls).toEqual(['unknown-model']);
    expect(claudeCalls).toEqual([]);
  });

  it('never sends a Claude model id to the Copilot runtime', async () => {
    const analyzer = new ErrorAnalyzer();

    await analyzer.executeClaudeCodeAnalysis(
      'fix the build',
      [],
      testDir,
      CLAUDE_MODELS.SONNET,
      'build',
      testDir,
      false,
      undefined,
      'github-copilot',
    );

    expect(copilotCalls).toEqual([GITHUB_COPILOT_MODELS.GPT_5]);
    expect(claudeCalls).toEqual([]);
  });

  it('still routes Claude models to the Claude SDK', async () => {
    const analyzer = new ErrorAnalyzer();

    await analyzer.executeClaudeCodeAnalysis('fix the build', [], testDir, CLAUDE_MODELS.SONNET, 'build', testDir, false);

    expect(claudeCalls).toEqual([CLAUDE_MODELS.SONNET]);
    expect(copilotCalls).toEqual([]);
  });

  it('writes provider-neutral debug artifacts (no claude_debug_* files)', async () => {
    const analyzer = new ErrorAnalyzer();

    await analyzer.executeClaudeCodeAnalysis(
      'fix the build',
      [],
      testDir,
      GITHUB_COPILOT_MODELS.GPT_5,
      'build',
      testDir,
      false,
      undefined,
      'github-copilot',
    );

    const files = fs.readdirSync(testDir);
    expect(files.some((f) => f.startsWith('claude_debug_'))).toBe(false);
    expect(files.some((f) => f.startsWith('ai_debug_'))).toBe(true);
  });
});
