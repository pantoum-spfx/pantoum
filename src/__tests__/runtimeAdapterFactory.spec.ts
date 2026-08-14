import { afterEach, describe, expect, it } from 'vitest';
import {
  getRuntimeLabel,
  inferProviderFromModel,
  resolveAgentProvider,
  resolveRuntimeModel,
  setActiveAgentProvider,
} from '../adapters/runtimeAdapterFactory.js';
import { CLAUDE_MODELS, GITHUB_COPILOT_MODELS } from '../defaults.js';

afterEach(() => {
  setActiveAgentProvider(undefined);
});

describe('inferProviderFromModel', () => {
  it('detects GitHub Copilot models', () => {
    expect(inferProviderFromModel('gpt-5')).toBe('github-copilot');
    expect(inferProviderFromModel('gpt-5-mini')).toBe('github-copilot');
    expect(inferProviderFromModel('mai-code-1.1-flash')).toBe('github-copilot');
    expect(inferProviderFromModel('mai-code-1-flash-picker')).toBe('github-copilot');
  });

  it('detects Claude models', () => {
    expect(inferProviderFromModel(CLAUDE_MODELS.SONNET)).toBe('claude');
    expect(inferProviderFromModel('claude-opus-4-6')).toBe('claude');
    expect(inferProviderFromModel('sonnet')).toBe('claude');
  });

  it('returns undefined for unknown models instead of guessing', () => {
    expect(inferProviderFromModel('some-internal-model')).toBeUndefined();
    expect(inferProviderFromModel('')).toBeUndefined();
    expect(inferProviderFromModel(undefined)).toBeUndefined();
  });
});

describe('resolveAgentProvider', () => {
  it('prefers the explicitly configured provider', () => {
    setActiveAgentProvider('claude');
    expect(resolveAgentProvider(CLAUDE_MODELS.SONNET, 'github-copilot')).toBe('github-copilot');
  });

  it('uses the provider pinned for the run when no explicit provider is given', () => {
    setActiveAgentProvider('github-copilot');
    expect(resolveAgentProvider(undefined)).toBe('github-copilot');
    expect(resolveAgentProvider('some-internal-model')).toBe('github-copilot');
  });

  it('falls back to model inference, then to the default provider', () => {
    expect(resolveAgentProvider('mai-code-1.1-flash')).toBe('github-copilot');
    expect(resolveAgentProvider('unknown-model')).toBe('claude');
  });
});

describe('resolveRuntimeModel', () => {
  it('keeps a model that belongs to the resolved provider', () => {
    expect(resolveRuntimeModel('mai-code-1.1-flash', 'github-copilot')).toBe('mai-code-1.1-flash');
    expect(resolveRuntimeModel(CLAUDE_MODELS.SONNET, 'claude')).toBe(CLAUDE_MODELS.SONNET);
  });

  it('never sends a foreign model id to a runtime', () => {
    expect(resolveRuntimeModel(CLAUDE_MODELS.SONNET, 'github-copilot')).toBe(GITHUB_COPILOT_MODELS.GPT_5);
    expect(resolveRuntimeModel('gpt-5-mini', 'claude')).toBe(CLAUDE_MODELS.SONNET);
  });

  it('falls back to the provider default when no model is given', () => {
    expect(resolveRuntimeModel(undefined, 'github-copilot')).toBe(GITHUB_COPILOT_MODELS.GPT_5);
    expect(resolveRuntimeModel(undefined, 'claude')).toBe(CLAUDE_MODELS.SONNET);
  });
});

describe('getRuntimeLabel', () => {
  it('returns provider-specific labels', () => {
    expect(getRuntimeLabel('claude')).toBe('Claude Code');
    expect(getRuntimeLabel('github-copilot')).toBe('GitHub Copilot');
  });
});
