import * as fs from 'fs';
import path from 'path';
import { BuiltInTools, CopilotClient, ToolSet, approveAll } from '@github/copilot-sdk';
import type { AssistantMessageEvent, CopilotSession, PermissionHandler, SessionEvent } from '@github/copilot-sdk';
import { GITHUB_COPILOT_MODELS, TIMEOUTS } from '../defaults.js';
import type { Tool, AIRuntimeLogger, ToolCallback, AssistantCallback, AdapterConfig, RuntimeAdapter, RuntimeMetrics, ResponseWithMetrics, RuntimeBilling } from './types.js';

function normalizeReasoningEffort(effort?: string): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined {
  if (!effort || effort === 'off') return undefined;
  if (effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'max') return effort;
  if (effort === 'xhigh') return 'xhigh';
  return undefined;
}

function createPermissionHandler(skipPermissions: boolean): PermissionHandler | undefined {
  return skipPermissions ? approveAll : undefined;
}

function buildBilling(totalNanoAiu: number | undefined): RuntimeBilling | undefined {
  if (typeof totalNanoAiu !== 'number') return undefined;
  return {
    unit: 'ai-credit',
    amount: totalNanoAiu,
    nanoAiu: totalNanoAiu,
    note: 'GitHub Copilot SDK reports nano-AIU usage, not verified USD cost.',
  };
}

/**
 * Built-in tool names to request per Pantoum tool intent.
 *
 * `ToolSet.addBuiltIn` matches only tools the running Copilot CLI actually
 * registered, so unmatched aliases are ignored. Requesting every known alias
 * keeps the mapping stable across CLI builds that expose either the
 * `edit`/`create`/`grep` set or the `apply_patch`/`str_replace_editor`/`rg` set.
 */
function mapToolNameForCopilotSdk(tool: string): string[] {
  switch (tool.toLowerCase()) {
    case 'read':
      return ['view', 'str_replace_editor'];
    case 'edit':
    case 'multiedit':
      return ['edit', 'apply_patch', 'str_replace_editor'];
    case 'write':
      return ['create', 'edit', 'apply_patch', 'str_replace_editor'];
    case 'bash':
      return ['bash'];
    case 'grep':
      return ['grep', 'rg'];
    case 'ls':
      return ['glob'];
    default:
      return [tool];
  }
}

export function normalizeCopilotToolName(toolName: string): string {
  switch (toolName) {
    case 'view':
      return 'Read';
    case 'edit':
    case 'apply_patch':
    case 'str_replace':
    case 'str_replace_editor':
      return 'Edit';
    case 'create':
      return 'Write';
    case 'bash':
      return 'Bash';
    case 'grep':
    case 'rg':
      return 'Grep';
    case 'glob':
      return 'LS';
    default:
      return toolName;
  }
}

/**
 * Session-scoped tools that are safe to expose in a headless Pantoum run.
 *
 * `BuiltInTools.Isolated` cannot be used wholesale: it contains `task` (a
 * sub-agent with `tools: ["*"]`, which bypasses the allow-list and runs its own
 * model) and `ask_user` (blocks forever in a headless session).
 */
const SAFE_ISOLATED_TOOLS = ['task_complete'] as const;

/**
 * Copilot tool inputs use different argument names than the Claude SDK.
 * Normalize them so downstream Pantoum consumers can read a single shape.
 */
export function normalizeCopilotToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...input };

  if (normalized.file_path === undefined && typeof normalized.path === 'string') {
    normalized.file_path = normalized.path;
  }
  if (normalized.old_string === undefined && typeof normalized.old_str === 'string') {
    normalized.old_string = normalized.old_str;
  }
  if (normalized.new_string === undefined && typeof normalized.new_str === 'string') {
    normalized.new_string = normalized.new_str;
  }
  if (normalized.content === undefined && typeof normalized.file_text === 'string') {
    normalized.content = normalized.file_text;
  }

  return normalized;
}

export function mapToolsForCopilotSdk(tools: string[]): ToolSet | undefined {
  if (tools.length === 0) {
    return undefined;
  }

  const toolSet = new ToolSet();
  const normalized = new Set(tools.flatMap((tool) => mapToolNameForCopilotSdk(tool)));

  for (const tool of normalized) {
    toolSet.addBuiltIn(tool);
  }

  for (const tool of SAFE_ISOLATED_TOOLS) {
    if (BuiltInTools.Isolated.includes(tool)) {
      toolSet.addBuiltIn(tool);
    }
  }

  return toolSet;
}

export function copilot() {
  return new GitHubCopilotSdkAdapter();
}

class GitHubCopilotSdkAdapter implements RuntimeAdapter {
  private config: AdapterConfig;
  private toolCallbacks: ToolCallback[] = [];
  private assistantCallbacks: AssistantCallback[] = [];

  constructor() {
    this.config = {
      model: GITHUB_COPILOT_MODELS.GPT_5,
      directory: process.cwd(),
      tools: [],
      skipPermissions: false,
    };
  }

  withModel(model: string): this {
    this.config.model = model;
    return this;
  }

  inDirectory(directory: string): this {
    this.config.directory = directory;
    return this;
  }

  allowTools(...tools: string[]): this {
    this.config.tools = tools;
    return this;
  }

  withLogger(logger: AIRuntimeLogger): this {
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

  withDebugFile(debugFile: string): this {
    this.config.debugFile = debugFile;
    return this;
  }

  withSessionId(sessionId: string): this {
    this.config.sessionId = sessionId;
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

  buildOptions(): { options: Record<string, unknown>; modelName: string } {
    const availableTools = mapToolsForCopilotSdk(this.config.tools);
    return {
      modelName: this.config.model,
      options: {
        model: this.config.model,
        reasoningEffort: normalizeReasoningEffort(this.config.thinkingEffort),
        workingDirectory: this.config.directory,
        availableTools,
        onPermissionRequest: createPermissionHandler(this.config.skipPermissions),
      },
    };
  }

  query(prompt: string): CopilotQueryBuilder {
    return new CopilotQueryBuilder(this.config, this.toolCallbacks, this.assistantCallbacks, prompt);
  }
}

class CopilotQueryBuilder {
  constructor(
    private readonly config: AdapterConfig,
    private readonly toolCallbacks: ToolCallback[],
    private readonly assistantCallbacks: AssistantCallback[],
    private readonly prompt: string,
  ) {}

  async asText(): Promise<string>;
  async asText(returnMetrics: true): Promise<ResponseWithMetrics>;
  async asText(returnMetrics?: boolean): Promise<string | ResponseWithMetrics> {
    const metrics: RuntimeMetrics = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      durationMs: 0,
      turns: 0,
      modelCalls: 0,
      toolExecutions: [],
      model: this.config.model,
      provider: 'github-copilot',
      errors: [],
      permissionDenials: [],
    };

    const startTime = Date.now();
    const client = new CopilotClient({
      mode: 'copilot-cli',
      workingDirectory: this.config.directory,
      useLoggedInUser: true,
      baseDirectory: path.join(this.config.directory, '.copilot-sdk'),
      logLevel: this.config.logger ? 'error' : 'none',
    });

    let session: CopilotSession | undefined;
    // toolCallId -> { startedAt, entry } so completions match their own start even
    // under concurrent tool execution (timestamp-scan matching misattributes there).
    const toolStarts = new Map<string, { startedAt: number; entry: RuntimeMetrics['toolExecutions'][number] }>();
    const debugEntries: Array<Record<string, unknown>> = [];
    let finalResponse = '';
    let finalAssistantEvent: AssistantMessageEvent | undefined;
    let sawToolExecution = false;
    // The SDK documents totalNanoAiu as per-request; sum across usage events —
    // overwriting recorded only the final request's cost on multi-call runs.
    let totalNanoAiu: number | undefined;

    try {
      await client.start();
      const availableTools = mapToolsForCopilotSdk(this.config.tools);
      session = await client.createSession({
        sessionId: this.config.sessionId,
        model: this.config.model,
        reasoningEffort: normalizeReasoningEffort(this.config.thinkingEffort),
        workingDirectory: this.config.directory,
        availableTools,
        onPermissionRequest: createPermissionHandler(this.config.skipPermissions),
        enableSessionStore: false,
        skipCustomInstructions: false,
      });

      metrics.sessionId = session.sessionId;
      const abortSignal = this.config.abortController?.signal;
      // session.abort() only cancels the in-flight message, so an abort before or
      // during the run must also surface as a failure — otherwise the prompt is
      // still sent (pre-send abort is a no-op) or a partial response is returned
      // as if the migration completed.
      if (abortSignal?.aborted) {
        throw new Error('Copilot run aborted before the prompt was sent');
      }
      abortSignal?.addEventListener(
        'abort',
        () => {
          void session?.abort().catch(() => undefined);
        },
        { once: true }
      );

      const eventHandler = (event: SessionEvent) => {
        debugEntries.push({
          timestamp: event.timestamp,
          type: event.type,
          data: (event as { data?: unknown }).data,
        });

        switch (event.type) {
          case 'assistant.message': {
            const assistantEvent = event as AssistantMessageEvent;
            finalAssistantEvent = assistantEvent;
            if (assistantEvent.data.content) {
              finalResponse = assistantEvent.data.content;
            }
            this.assistantCallbacks.forEach((callback) => callback(assistantEvent.data.content || ''));
            break;
          }
          case 'assistant.usage': {
            const data = event.data;
            metrics.modelCalls = (metrics.modelCalls || 0) + 1;
            metrics.inputTokens += data.inputTokens || 0;
            metrics.outputTokens += data.outputTokens || 0;
            metrics.cacheReadTokens = (metrics.cacheReadTokens || 0) + (data.cacheReadTokens || 0);
            metrics.cacheWriteTokens = (metrics.cacheWriteTokens || 0) + (data.cacheWriteTokens || 0);
            metrics.totalTokens = metrics.inputTokens + metrics.outputTokens;
            metrics.durationApiMs = (metrics.durationApiMs || 0) + (data.duration || 0);
            metrics.stopReason = data.finishReason || metrics.stopReason;
            if (typeof data.copilotUsage?.totalNanoAiu === 'number') {
              totalNanoAiu = (totalNanoAiu ?? 0) + data.copilotUsage.totalNanoAiu;
            }
            metrics.billing = buildBilling(totalNanoAiu);
            break;
          }
          case 'tool.execution_start': {
            sawToolExecution = true;
            const tool: Tool = {
              name: normalizeCopilotToolName(event.data.toolName),
              input: normalizeCopilotToolInput((event.data.arguments || {}) as Record<string, unknown>) as Tool['input'],
            };
            const entry = {
              name: tool.name,
              input: tool.input,
              timestamp: event.timestamp,
            };
            metrics.toolExecutions.push(entry);
            toolStarts.set(event.data.toolCallId, { startedAt: Date.now(), entry });
            this.toolCallbacks.forEach((callback) => callback(tool));
            break;
          }
          case 'tool.execution_complete': {
            const started = toolStarts.get(event.data.toolCallId);
            if (started) {
              started.entry.durationMs = Date.now() - started.startedAt;
              toolStarts.delete(event.data.toolCallId);
            }
            break;
          }
          case 'session.error': {
            // Keep the structured Azure payload (status code, request-correlation
            // ids), not just the message — a content-policy 400 is undiagnosable
            // from the message alone.
            const errorData = event.data as {
              message: string;
              statusCode?: number;
              errorCode?: string;
              errorType?: string;
              providerCallId?: string;
              serviceRequestId?: string;
            };
            metrics.errors?.push({
              message: errorData.message,
              timestamp: event.timestamp,
              statusCode: errorData.statusCode,
              errorCode: errorData.errorCode,
              errorType: errorData.errorType,
              providerCallId: errorData.providerCallId,
              serviceRequestId: errorData.serviceRequestId,
            });
            break;
          }
          case 'permission.requested': {
            // With skipPermissions the handler auto-approves every request, so
            // recording these as denials would invert the Claude-path semantics
            // (there, permission_denials are real denials). Only record when no
            // auto-approve handler is installed.
            if (!this.config.skipPermissions && event.data?.permissionRequest) {
              const permissionRequest = event.data.permissionRequest as { toolName?: string; kind?: string };
              metrics.permissionDenials?.push({
                tool_name: permissionRequest.toolName || permissionRequest.kind || 'permission-request',
                tool_input: event.data,
              });
            }
            break;
          }
          case 'session.idle': {
            metrics.turns += 1;
            break;
          }
          default:
            break;
        }
      };

      session.on(eventHandler);
      const response = await session.sendAndWait({ prompt: this.prompt }, TIMEOUTS.CLAUDE_MIGRATION);
      if (abortSignal?.aborted) {
        // An abort mid-run makes the session go idle, so sendAndWait resolves
        // normally with whatever partial output existed — do not present that
        // as a completed run.
        throw new Error('Copilot run aborted while processing');
      }
      if (response) {
        finalAssistantEvent = response;
        if (response.data.content) {
          finalResponse = response.data.content;
        }
      }

      // When tool executions occurred, prefer the terminal assistant message captured
      // after the tool loop rather than an earlier narration-only response.
      if (sawToolExecution && finalAssistantEvent?.data.content) {
        finalResponse = finalAssistantEvent.data.content;
      }

      if (returnMetrics) {
        return { response: finalResponse, metrics };
      }

      return finalResponse;
    } catch (error) {
      // sendAndWait throws Error(message) on any session.error, dropping the
      // structured payload. Re-attach what the event handler captured so the
      // engine's catch can log the status code and correlation ids — without
      // these, a content-policy 400 is unactionable.
      const lastError = metrics.errors?.[metrics.errors.length - 1];
      if (error instanceof Error && lastError) {
        // statusCode is "if applicable" in the SDK — quota errors such as
        // ai_credit_soft_cap_exhausted carry only errorCode, so annotate on any
        // structured field, not just an HTTP status.
        const ids = [
          lastError.statusCode !== undefined ? `status=${lastError.statusCode}` : undefined,
          lastError.errorCode ? `code=${lastError.errorCode}` : undefined,
          lastError.errorType ? `type=${lastError.errorType}` : undefined,
          lastError.providerCallId ? `providerCallId=${lastError.providerCallId}` : undefined,
          lastError.serviceRequestId ? `serviceRequestId=${lastError.serviceRequestId}` : undefined,
        ].filter(Boolean).join(', ');
        if (ids) {
          error.message = `${error.message} [${ids}]`;
        }
      }
      throw error;
    } finally {
      metrics.durationMs = Date.now() - startTime;

      // Always flush the debug trace — the error path is exactly when it matters.
      if (this.config.debugFile && debugEntries.length > 0) {
        try {
          fs.writeFileSync(this.config.debugFile, `${debugEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
        } catch {
          // never mask the primary error with a debug-write failure
        }
      }

      if (session) {
        await session.disconnect().catch(() => undefined);
        if (this.config.persistSession === false && metrics.sessionId) {
          await client.deleteSession(metrics.sessionId).catch(() => undefined);
        }
      }
      await client.stop().catch(() => undefined);
    }
  }
}
