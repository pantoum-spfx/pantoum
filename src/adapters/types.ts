// Types for Pantoum AI runtime adapters
// Maintains compatibility with the existing Claude integration while allowing
// additional runtimes such as GitHub Copilot.

interface ToolInput {
  file_path?: string;
  path?: string;
  pattern?: string;
  url?: string;
  command?: string;
  description?: string;
  old_string?: string;
  new_string?: string;
  content?: string;
  replace_all?: boolean;
  edits?: Array<{
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }>;
}

export interface Tool {
  name: string;
  input: ToolInput;
}

export interface AIRuntimeLogger {
  log: (entry: any) => void;
  error: (message: string, context?: any) => void;
  warn: (message: string, context?: any) => void;
  info: (message: string, context?: any) => void;
  debug: (message: string, context?: any) => void;
  trace: (message: string, context?: any) => void;
}

export type ToolCallback = (tool: Tool) => void;
export type AssistantCallback = (content: string) => void;

export interface AdapterConfig {
  model: string;
  directory: string;
  tools: string[];
  logger?: AIRuntimeLogger;
  skipPermissions: boolean;
  debugFile?: string;
  sessionId?: string;
  thinkingEffort?: string;
  abortController?: AbortController;
  persistSession?: boolean;
}

export type RuntimeBillingUnit = 'usd' | 'ai-credit' | 'premium-request' | 'unknown';

export interface RuntimeBilling {
  unit: RuntimeBillingUnit;
  amount: number;
  nanoAiu?: number;
  currency?: string;
  note?: string;
}

export interface RuntimeBuildOptions {
  options: Record<string, unknown>;
  modelName: string;
}

export interface RuntimeQuery {
  asText(): Promise<string>;
  asText(returnMetrics: true): Promise<ResponseWithMetrics>;
  asText(returnMetrics?: boolean): Promise<string | ResponseWithMetrics>;
}

export interface RuntimeAdapter {
  withModel(model: string): this;
  inDirectory(path: string): this;
  allowTools(...tools: string[]): this;
  withLogger(logger: AIRuntimeLogger): this;
  onToolUse(callback: ToolCallback): this;
  onAssistant(callback: AssistantCallback): this;
  skipPermissions(): this;
  withDebugFile(path: string): this;
  withSessionId(sessionId: string): this;
  withThinkingEffort(effort: string): this;
  withAbortController(controller: AbortController): this;
  withPersistSession(persist: boolean): this;
  buildOptions(): RuntimeBuildOptions;
  query(prompt: string): RuntimeQuery;
}

// Metrics interface for tracking AI runtime execution performance
export interface RuntimeMetrics {
  // Token usage
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cacheWriteTokens?: number;
  totalTokens: number;

  // Billing / usage tracking
  costUSD: number;
  billing?: RuntimeBilling;

  // Performance metrics
  durationMs: number;
  durationApiMs?: number;
  turns: number;
  modelCalls?: number;

  // Tool usage tracking
  toolExecutions: Array<{
    name: string;
    input: any;
    timestamp: string;
    durationMs?: number;
  }>;

  // Session info
  sessionId?: string;
  model: string;
  provider?: string;

  // Stop reason (why the model stopped: 'end_turn', 'max_tokens', etc.)
  stopReason?: string;

  // Error tracking
  errors?: Array<{
    message: string;
    timestamp: string;
    /** HTTP status of a provider/session error (e.g. 400 for an Azure content-policy rejection) */
    statusCode?: number;
    errorCode?: string;
    errorType?: string;
    /** Provider-side correlation ids — required to follow up a content-policy rejection */
    providerCallId?: string;
    serviceRequestId?: string;
  }>;

  // Permission denials
  permissionDenials?: Array<{
    tool_name: string;
    tool_input: any;
  }>;
}

// Response with metrics
export interface ResponseWithMetrics {
  response: string;
  metrics: RuntimeMetrics;
}

export type MigrationMetrics = RuntimeMetrics;
export type ClaudeLogger = AIRuntimeLogger;