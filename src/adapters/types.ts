// Types for Claude SDK Adapter
// Maintains compatibility with InstantlyEasy SDK interface

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

export interface ClaudeLogger {
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
  logger?: ClaudeLogger;
  skipPermissions: boolean;
  debugFile?: string;
  sessionId?: string;
  thinkingEffort?: string;
  abortController?: AbortController;
  persistSession?: boolean;
}

// Metrics interface for tracking Claude execution performance
export interface MigrationMetrics {
  // Token usage
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  totalTokens: number;

  // Cost tracking
  costUSD: number;

  // Performance metrics
  durationMs: number;
  durationApiMs?: number;
  turns: number;

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

  // Stop reason (why the model stopped: 'end_turn', 'max_tokens', etc.)
  stopReason?: string;

  // Error tracking
  errors?: Array<{
    message: string;
    timestamp: string;
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
  metrics: MigrationMetrics;
}