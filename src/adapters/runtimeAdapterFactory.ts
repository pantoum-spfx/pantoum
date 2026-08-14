import {
  AGENT_PROVIDER_LABELS,
  DEFAULT_AGENT_PROVIDER,
  GITHUB_COPILOT_MODELS,
  getDefaultModelForProvider,
  type AgentProvider,
} from '../defaults.js';
import type { RuntimeAdapter } from './types.js';

/**
 * Provider selected for the current process (set once at the start of an upgrade run).
 * Acts as the fallback for call sites that cannot thread the provider explicitly.
 */
let activeProvider: AgentProvider | undefined;

export function setActiveAgentProvider(provider: AgentProvider | undefined): void {
  activeProvider = provider;
}

export function getActiveAgentProvider(): AgentProvider | undefined {
  return activeProvider;
}

export async function createRuntimeAdapter(provider: AgentProvider): Promise<RuntimeAdapter> {
  if (provider === 'github-copilot') {
    const { copilot } = await import('./githubCopilotSdkAdapter.js');
    return copilot();
  }

  const { claude } = await import('./claudeAgentSdkAdapter.js');
  return claude();
}

const COPILOT_MODEL_IDS = new Set<string>(Object.values(GITHUB_COPILOT_MODELS));
const COPILOT_MODEL_PREFIXES = ['gpt', 'mai-', 'o1', 'o3', 'o4', 'copilot', 'gemini', 'grok'];
const CLAUDE_MODEL_HINTS = ['claude', 'sonnet', 'opus', 'haiku'];

/**
 * Best-effort provider detection from a model id. Returns undefined when the model
 * does not clearly belong to a known runtime, so callers can fall back to the
 * explicitly configured provider instead of silently picking the wrong SDK.
 */
export function inferProviderFromModel(model: string | undefined): AgentProvider | undefined {
  if (!model) return undefined;
  const normalized = model.toLowerCase().trim();
  if (!normalized) return undefined;

  if (COPILOT_MODEL_IDS.has(normalized)) return 'github-copilot';
  if (CLAUDE_MODEL_HINTS.some((hint) => normalized.includes(hint))) return 'claude';
  if (COPILOT_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return 'github-copilot';
  if (normalized.includes('copilot')) return 'github-copilot';

  return undefined;
}

/**
 * Resolve the runtime provider for a call site.
 * Priority: explicit provider > provider set for this run > model inference > default.
 */
export function resolveAgentProvider(
  model?: string,
  explicitProvider?: AgentProvider,
): AgentProvider {
  if (explicitProvider) return explicitProvider;
  if (activeProvider) return activeProvider;
  return inferProviderFromModel(model) ?? DEFAULT_AGENT_PROVIDER;
}

export function getRuntimeLabel(provider: AgentProvider): string {
  return AGENT_PROVIDER_LABELS[provider] ?? AGENT_PROVIDER_LABELS[DEFAULT_AGENT_PROVIDER];
}

/**
 * Resolve the model to run with, falling back to the provider's default model
 * instead of always falling back to a Claude model id.
 */
export function resolveRuntimeModel(model: string | undefined, provider: AgentProvider): string {
  if (!model) return getDefaultModelForProvider(provider);

  const inferred = inferProviderFromModel(model);
  if (inferred && inferred !== provider) return getDefaultModelForProvider(provider);

  return model;
}
