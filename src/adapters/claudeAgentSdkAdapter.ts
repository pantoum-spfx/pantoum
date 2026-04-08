// Claude Agent SDK Adapter - Provides InstantlyEasy SDK compatible interface using Claude Agent SDK
// This uses Claude Code authentication (no API key needed)

import crypto from 'crypto';
import * as fs from 'fs';
import { query as agentQuery, type Options, type HookCallbackMatcher, type HookInput, type HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import type { Tool, ClaudeLogger, ToolCallback, AssistantCallback, AdapterConfig, MigrationMetrics, ResponseWithMetrics } from './types.js';
import { DEFAULTS } from '../constants.js';

/**
 * Map full model identifiers to the simplified names the Agent SDK expects.
 * Shared by both ClaudeAgentSdkAdapter.buildOptions() and QueryBuilder.asText().
 */
function mapModelForSDK(model: string): string {
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  return 'sonnet';
}

/**
 * Map thinking effort level to maxThinkingTokens.
 * Used until the Agent SDK adds native adaptive thinking / effort support.
 * Returns undefined when effort is 'off' or unrecognised.
 */
function effortToMaxThinkingTokens(effort: string): number | undefined {
  switch (effort) {
    case 'low': return 4000;
    case 'medium': return 16000;
    case 'high': return 40000;
    case 'max': return 100000;
    default: return undefined; // 'off' or unknown
  }
}

/**
 * Resolve the effective maxThinkingTokens from config.
 * Haiku models don't support adaptive thinking — skip entirely.
 */
function resolveMaxThinkingTokens(config: AdapterConfig): number | undefined {
  // Haiku doesn't support adaptive thinking — skip
  if (config.model && config.model.toLowerCase().includes('haiku')) {
    return undefined;
  }
  if (config.thinkingEffort && config.thinkingEffort !== 'off') {
    return effortToMaxThinkingTokens(config.thinkingEffort);
  }
  return undefined;
}

// Export function that matches InstantlyEasy import signature
export function claude() {
  return new ClaudeAgentSdkAdapter();
}

class ClaudeAgentSdkAdapter {
  private config: AdapterConfig;
  private toolCallbacks: ToolCallback[] = [];
  private assistantCallbacks: AssistantCallback[] = [];

  constructor() {
    this.config = {
      model: DEFAULTS.CLAUDE_MODEL,
      directory: process.cwd(),
      tools: [],
      skipPermissions: false
    };
  }

  withModel(model: string): this {
    this.config.model = model;
    return this;
  }

  inDirectory(path: string): this {
    this.config.directory = path;
    return this;
  }

  allowTools(...tools: string[]): this {
    this.config.tools = tools;
    return this;
  }

  withLogger(logger: ClaudeLogger): this {
    this.config.logger = logger;
    return this;
  }

  onToolUse(callback: ToolCallback): this {
    this.toolCallbacks.push(callback);
    return this;
  }

  onAssistant(callback: AssistantCallback): this {
    this.assistantCallbacks.push(callback);
    return this;
  }

  skipPermissions(): this {
    this.config.skipPermissions = true;
    return this;
  }

  withDebugFile(path: string): this {
    this.config.debugFile = path;
    return this;
  }

  withSessionId(sessionId: string): this {
    // Claude Agent SDK requires valid UUID — generate one if a label string is provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    this.config.sessionId = uuidRegex.test(sessionId) ? sessionId : crypto.randomUUID();
    return this;
  }

  withThinkingEffort(effort: string): this {
    this.config.thinkingEffort = effort;
    return this;
  }

  withAbortController(controller: AbortController): this {
    this.config.abortController = controller;
    return this;
  }

  withPersistSession(persist: boolean): this {
    this.config.persistSession = persist;
    return this;
  }

  /**
   * Build validated Agent SDK options without executing the query.
   * Use this when you need the adapter's config normalisation (model mapping,
   * permission flags, thinking tokens) but handle the streaming loop yourself.
   */
  buildOptions(): { options: Options; modelName: string } {
    const modelName = mapModelForSDK(this.config.model);
    const effectiveThinkingTokens = resolveMaxThinkingTokens(this.config);
    const options: Options = {
      model: modelName as any,
      tools: this.config.tools.length > 0 ? this.config.tools : undefined,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      permissionMode: this.config.skipPermissions ? 'bypassPermissions' : 'default',
      ...(this.config.skipPermissions && { allowDangerouslySkipPermissions: true }),
      settingSources: ['user', 'project', 'local'],
      ...(effectiveThinkingTokens && { maxThinkingTokens: effectiveThinkingTokens }),
      ...(this.config.abortController && { abortController: this.config.abortController }),
      ...(this.config.persistSession !== undefined && { persistSession: this.config.persistSession }),
    };
    return { options, modelName };
  }

  query(prompt: string): QueryBuilder {
    return new QueryBuilder(
      this.config,
      this.toolCallbacks,
      this.assistantCallbacks,
      prompt
    );
  }
}

class QueryBuilder {
  constructor(
    private config: AdapterConfig,
    private toolCallbacks: ToolCallback[],
    private assistantCallbacks: AssistantCallback[],
    private prompt: string
  ) {}

  async asText(): Promise<string>;
  async asText(returnMetrics: true): Promise<ResponseWithMetrics>;
  async asText(returnMetrics?: boolean): Promise<string | ResponseWithMetrics> {
    try {
      // Initialize metrics
      const metrics: MigrationMetrics = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUSD: 0,
        durationMs: 0,
        turns: 0,
        toolExecutions: [],
        model: this.config.model,
        errors: [],
        permissionDenials: []
      };

      const startTime = Date.now();
      let sessionId: string | undefined = this.config.sessionId;

      // Set session ID in metrics upfront if provided via config
      if (sessionId) {
        metrics.sessionId = sessionId;
      }

      // Log start if logger provided
      if (this.config.logger) {
        this.config.logger.info('Starting Claude execution with Agent SDK...');
      }

      // Change to the specified directory before execution
      const originalCwd = process.cwd();
      if (this.config.directory !== originalCwd) {
        process.chdir(this.config.directory);
      }

      try {
        // Map tools to Agent SDK format
        const mappedTools = this.mapToolsForAgentSDK(this.config.tools);

        // Determine the model to use
        const modelName = mapModelForSDK(this.config.model);

        // Build hooks for tracking tool executions
        const hooks: Partial<Record<string, HookCallbackMatcher[]>> = {
          PreToolUse: [{
            hooks: [async (input: HookInput, _toolUseId: string | undefined) => {
              if (input.hook_event_name === 'PreToolUse') {
                const toolExecution = {
                  name: input.tool_name,
                  input: input.tool_input,
                  timestamp: new Date().toISOString(),
                  durationMs: 0
                };
                metrics.toolExecutions.push(toolExecution);

                if (this.config.logger) {
                  this.config.logger.debug(`Tool execution: ${input.tool_name}`, { input: input.tool_input });
                }
              }
              return { continue: true } as HookJSONOutput;
            }]
          }],
          PostToolUse: [{
            hooks: [async (input: HookInput) => {
              if (input.hook_event_name === 'PostToolUse' && metrics.toolExecutions.length > 0) {
                // Update the last tool execution with response info
                const lastTool = metrics.toolExecutions[metrics.toolExecutions.length - 1];
                if (lastTool.name === input.tool_name) {
                  lastTool.durationMs = Date.now() - new Date(lastTool.timestamp).getTime();
                }
              }
              return { continue: true } as HookJSONOutput;
            }]
          }],
          SessionStart: [{
            hooks: [async (input: HookInput) => {
              if (input.hook_event_name === 'SessionStart') {
                // Use SDK-assigned session ID as fallback when no custom ID was provided
                if (!sessionId) {
                  sessionId = input.session_id;
                  metrics.sessionId = sessionId;
                }

                if (this.config.logger) {
                  this.config.logger.info(`Session started: ${metrics.sessionId}`);
                }
              }
              return { continue: true } as HookJSONOutput;
            }]
          }]
        };

        // Build options for Agent SDK (v0.1.57+)
        const options: Options = {
          // Model selection (cast needed for v0.1.x Options type)
          model: modelName as any,

          // Tools configuration: pass tool names directly
          tools: mappedTools.length > 0 ? mappedTools : undefined,

          // Use Claude Code preset for system prompt to maintain compatibility
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code'
          },

          // Permission mode based on skipPermissions
          permissionMode: this.config.skipPermissions ? 'bypassPermissions' : 'default',

          // Setting sources: load CLAUDE.md and project settings
          settingSources: ['user', 'project', 'local'],

          // Extended thinking budget — effort level takes precedence over explicit tokens
          ...(resolveMaxThinkingTokens(this.config) && {
            maxThinkingTokens: resolveMaxThinkingTokens(this.config),
          }),

          // Abort controller (when caller needs cancellation support)
          ...(this.config.abortController && {
            abortController: this.config.abortController,
          }),

          // Session persistence
          ...(this.config.persistSession !== undefined && {
            persistSession: this.config.persistSession,
          }),

          // Hooks for tracking
          hooks,

          // Logger support via stderr callback (always active, independent of debug mode)
          ...(this.config.logger && {
            stderr: (data: string) => {
              // Filter noisy SDK debug messages
              if (data.includes('Received message')) {
                return;
              }

              // Detect terms/policy acceptance prompt (SDK bug — leaks interactive
              // prompts into non-interactive subprocess, see github.com/anthropics/claude-code/issues/17373).
              // Log a single warning instead of letting it poison the output stream.
              if (data.includes('[ACTION REQUIRED]') ||
                  data.includes('Consumer Terms') ||
                  data.includes('Privacy Policy') ||
                  data.includes('review the updated terms')) {
                this.config.logger!.warn(
                  '⚠ Claude Code is requesting terms acceptance — run "claude" interactively to accept, then retry.'
                );
                return;
              }

              // Pass to our logger
              this.config.logger!.info(data);
            }
          })
        };

        // Execute query using Agent SDK
        const result = agentQuery({
          prompt: this.prompt,
          options
        });

        // Get the text response
        let textResponse = '';

        // The Agent SDK returns an AsyncGenerator that yields messages
        // We need to iterate through the messages to collect the response
        for await (const message of result) {
          // Capture session ID from system messages
          if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
            sessionId = message.session_id;
            metrics.sessionId = sessionId;
          }

          // Process assistant messages for content
          if (message.type === 'assistant' && 'message' in message) {
            // The assistant message has a 'message' property containing the API message
            const apiMessage = (message as any).message;
            if (apiMessage && apiMessage.content) {
              // Extract text from content array
              for (const content of apiMessage.content) {
                if (content.type === 'text') {
                  textResponse += content.text;

                  // Fire assistant callbacks
                  for (const callback of this.assistantCallbacks) {
                    callback(content.text);
                  }
                } else if (content.type === 'tool_use') {
                  // Fire tool use callbacks
                  const mappedTool = this.mapToolFromAgentSDK(content);
                  for (const callback of this.toolCallbacks) {
                    callback(mappedTool);
                  }
                }
              }
            }
          }

          // Capture metrics from result messages
          if (message.type === 'result') {
            metrics.durationMs = message.duration_ms || 0;
            metrics.durationApiMs = message.duration_api_ms;
            metrics.turns = message.num_turns || 1;

            // Capture usage metrics if available
            if ('usage' in message && message.usage) {
              metrics.inputTokens = message.usage.input_tokens || 0;
              metrics.outputTokens = message.usage.output_tokens || 0;
              metrics.cacheReadTokens = message.usage.cache_read_input_tokens;
              metrics.cacheCreationTokens = message.usage.cache_creation_input_tokens;
              metrics.totalTokens = metrics.inputTokens + metrics.outputTokens;
            }

            // Capture cost information
            if ('total_cost_usd' in message) {
              metrics.costUSD = message.total_cost_usd || 0;
            }

            // Capture stop reason (v0.2.31+): 'end_turn', 'max_tokens', 'tool_use', etc.
            if ('stop_reason' in message) {
              metrics.stopReason = (message as any).stop_reason ?? undefined;
            }

            // Capture permission denials
            if ('permission_denials' in message && Array.isArray(message.permission_denials)) {
              metrics.permissionDenials = message.permission_denials.map((denial: any) => ({
                tool_name: denial.tool_name,
                tool_input: denial.tool_input
              }));
            }

            // Log metrics if logger available
            if (this.config.logger) {
              this.config.logger.info('Claude execution metrics:', {
                tokens: `${metrics.inputTokens} in / ${metrics.outputTokens} out`,
                cost: `$${metrics.costUSD.toFixed(4)}`,
                duration: `${metrics.durationMs}ms`,
                turns: metrics.turns
              });
            }
          }
        }

        // Update final duration if not already set
        if (!metrics.durationMs) {
          metrics.durationMs = Date.now() - startTime;
        }

        // Write our own debug file (without activating SDK debug mode)
        if (this.config.debugFile) {
          try {
            const debugEntries = metrics.toolExecutions.map(t => ({
              timestamp: t.timestamp,
              type: 'tool_use',
              tool: t.name,
              input: t.input,
              durationMs: t.durationMs
            }));
            debugEntries.push({
              timestamp: new Date().toISOString(),
              type: 'result',
              tool: 'session',
              input: {
                sessionId: metrics.sessionId,
                model: metrics.model,
                turns: metrics.turns,
                inputTokens: metrics.inputTokens,
                outputTokens: metrics.outputTokens,
                cacheReadTokens: metrics.cacheReadTokens,
                cacheCreationTokens: metrics.cacheCreationTokens,
                costUSD: metrics.costUSD,
                durationMs: metrics.durationMs,
                durationApiMs: metrics.durationApiMs,
                stopReason: metrics.stopReason
              },
              durationMs: metrics.durationMs
            });
            const jsonl = debugEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
            fs.writeFileSync(this.config.debugFile, jsonl, 'utf8');
          } catch {
            // Debug file writing is best-effort — don't fail the session
          }
        }

        // Log completion
        if (this.config.logger) {
          this.config.logger.info('Claude execution completed successfully');
        }

        // Return based on what was requested
        if (returnMetrics) {
          return {
            response: textResponse || '',
            metrics
          };
        }

        return textResponse || '';

      } finally {
        // Restore original directory
        if (process.cwd() !== originalCwd) {
          process.chdir(originalCwd);
        }
      }

    } catch (error: any) {
      // Detect terms acceptance crash (exit code 1 with terms-related message)
      // See: github.com/anthropics/claude-code/issues/17373
      const msg = error.message || error.stderr || '';
      if (msg.includes('review the updated terms') ||
          msg.includes('[ACTION REQUIRED]') ||
          msg.includes('Consumer Terms')) {
        const termsError = new Error(
          'Claude Code requires terms acceptance. Run "claude" interactively in your terminal to accept the updated terms, then retry the upgrade.'
        );
        if (this.config.logger) {
          this.config.logger.error(termsError.message);
        }
        throw termsError;
      }

      // Log other errors
      if (this.config.logger) {
        this.config.logger.error('Claude execution failed', { error: error.message });
      }
      throw error;
    }
  }

  private mapToolsForAgentSDK(tools: string[]): string[] {
    // Agent SDK v0.1.57+ uses native Claude Code tool names directly
    // No mapping needed - pass through as-is
    return tools;
  }

  private mapToolFromAgentSDK(tool: any): Tool {
    // Map tool names from Agent SDK hook callbacks to canonical names
    // SDK 0.1.x may return old-style tool names in hook callbacks
    const rawName = tool.name || tool.tool || '';
    const nameMapping: Record<string, string> = {
      'read_file': 'Read',
      'str_replace_editor': 'Edit',
      'create_file': 'Write',
      'search_files': 'Grep',
      'list_files': 'LS',
      'execute_command': 'Bash',
      'Read': 'Read', 'Edit': 'Edit', 'Write': 'Write',
      'Grep': 'Grep', 'Glob': 'Glob', 'Bash': 'Bash',
      'MultiEdit': 'MultiEdit', 'Task': 'Task'
    };
    const toolName = nameMapping[rawName] || rawName;

    // Build input structure to match InstantlyEasy expectations
    const input: any = {};

    // Map parameters based on tool type
    if (tool.params || tool.input) {
      const params = tool.params || tool.input;

      // File-related parameters
      if (params.file_path || params.path) {
        input.file_path = params.file_path || params.path;
      }

      // Search/pattern parameters
      if (params.pattern || params.search_pattern) {
        input.pattern = params.pattern || params.search_pattern;
      }

      // URL parameters
      if (params.url) {
        input.url = params.url;
      }

      // Command parameters
      if (params.command) {
        input.command = params.command;
      }

      // Description
      if (params.description) {
        input.description = params.description;
      }

      // Edit-specific parameters
      if (params.old_str || params.old_string) {
        input.old_string = params.old_str || params.old_string;
      }
      if (params.new_str || params.new_string) {
        input.new_string = params.new_str || params.new_string;
      }

      // Write content
      if (params.content) {
        input.content = params.content;
      }

      // Multi-edit support
      if (params.edits) {
        input.edits = params.edits;
      }
    }

    return {
      name: toolName,
      input
    };
  }

}