/**
 * LogParser - Parses raw log messages into structured WebSocket events.
 * Used by UpgradeOrchestrator to extract progress, solution status, and AI activity
 * from the core engine's Logger output.
 */

type ParsedEventType = 'progress' | 'solution:status' | 'ai:action' | 'ai:metrics' | 'pipeline:event';

interface ParsedProgressEvent {
  type: 'progress';
  data: {
    phase: string;
    current: number;
    total: number;
    solutionName?: string;
  };
}

interface ParsedSolutionStatusEvent {
  type: 'solution:status';
  data: {
    solutionName: string;
    status: 'pending' | 'upgrading' | 'building' | 'fixing' | 'success' | 'failed' | 'skipped';
    message?: string;
  };
}

interface ParsedAIActionEvent {
  type: 'ai:action';
  data: {
    action: 'analyzing' | 'fixing' | 'verifying' | 'complete';
    description: string;
    model?: string;
  };
}

interface ParsedAIMetricsEvent {
  type: 'ai:metrics';
  data: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens?: number;
    costUSD: number;
    durationMs: number;
    turns: number;
    toolExecutions: number;
    model: string;
  };
}

interface ParsedPipelineEvent {
  type: 'pipeline:event';
  data: {
    phase: number;
    event: 'start' | 'skip' | 'complete';
    detail: Record<string, unknown>;
  };
}

type ParsedEvent = ParsedProgressEvent | ParsedSolutionStatusEvent | ParsedAIActionEvent | ParsedAIMetricsEvent | ParsedPipelineEvent;

// Pattern: "Processing solution X/Y: name" or "[X/Y] Processing solution: name"
const SOLUTION_PROGRESS_RE = /\[(\d+)\/(\d+)\]\s*Processing solution:\s*(.+)/;

// Phase patterns
const PHASE_PATTERNS: Array<{ pattern: RegExp; phase: string }> = [
  { pattern: /Starting SPFx upgrade/, phase: 'initializing' },
  { pattern: /Running M365 CLI upgrade/, phase: 'running-m365-cli' },
  { pattern: /\[1\/3\]\s*Running M365 CLI/, phase: 'running-m365-cli' },
  { pattern: /Generating patches|patches generated|\[2\/3\]\s*Generating patches/, phase: 'generating-patches' },
  { pattern: /Applying patches/, phase: 'applying-patches' },
  { pattern: /Running build|gulp build|heft build|\[3\/3\]\s*Running build/, phase: 'building' },
  { pattern: /Updating third-party|\[4\/4\]\s*Updating third-party/, phase: 'updating-dependencies' },
  { pattern: /Upgrade process completed|Upgrade completed/, phase: 'complete' },
];

// AI action patterns
const AI_PATTERNS: Array<{ pattern: RegExp; action: ParsedAIActionEvent['data']['action']; descriptionFn: (match: RegExpMatchArray) => string }> = [
  { pattern: /Claude analyzing|Generating patches to fix/, action: 'analyzing', descriptionFn: () => 'Analyzing errors...' },
  { pattern: /Claude fix attempt (\d+) of (\d+)/, action: 'fixing', descriptionFn: (m) => `AI fix attempt ${m[1]} of ${m[2]}` },
  { pattern: /Claude generated (\d+) fix/, action: 'fixing', descriptionFn: (m) => `Generated ${m[1]} fix(es)` },
  { pattern: /invoking Claude to fix/, action: 'fixing', descriptionFn: () => 'AI fixing breaking changes...' },
  { pattern: /Verifying fixes/, action: 'verifying', descriptionFn: () => 'Verifying AI fixes...' },
  { pattern: /All third-party update issues resolved|Claude could not generate/, action: 'complete', descriptionFn: () => 'AI analysis complete' },
];

// Solution outcome patterns
const SOLUTION_SUCCESS_RE = /Solution upgraded successfully/;
const SOLUTION_SKIPPED_RE = /Solution already at target version/;
const SOLUTION_FAILED_RE = /Solution .+ failed:|Build failed with (\d+) error/;
const BUILD_RUNNING_RE = /\[3\/3\]\s*Running build/;

// AI metrics multi-line regex patterns
const METRICS_HEADER_RE = /📊\s*(Migration|Error Fix|Build Fix)\s*Metrics/;
const TOKENS_RE = /Tokens:\s*([\d,]+)\s*input\s*\/\s*([\d,]+)\s*output\s*\(Total:\s*([\d,]+)\)/;
const CACHE_TOKENS_RE = /Cache.*?:\s*([\d,]+)/;
const COST_RE = /Cost:\s*\$([\d.]+)/;
const DURATION_RE = /Duration:\s*([\d,]+)ms/;
const TURNS_RE = /Turns:\s*(\d+)/;
const TOOL_EXEC_RE = /Tool Executions:\s*(\d+)/;
const MODEL_RE = /Model:\s*(.+)/;

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10);
}

/**
 * Stateful log parser that accumulates multi-line AI metrics blocks.
 * Use one instance per upgrade session.
 */
export class LogParserStateful {
  private collectingMetrics = false;
  private metricsAccum: Partial<ParsedAIMetricsEvent['data']> = {};

  /**
   * Parse a single log message. May return 0, 1, or 2 events
   * (e.g. a regular event + a completed metrics event).
   */
  parse(message: string): ParsedEvent[] {
    const events: ParsedEvent[] = [];

    // Check if this is a metrics header line
    if (METRICS_HEADER_RE.test(message)) {
      this.collectingMetrics = true;
      this.metricsAccum = {};
      return events;
    }

    // If collecting metrics, try to parse metric lines
    if (this.collectingMetrics) {
      const metricsEvent = this.tryParseMetricsLine(message);
      if (metricsEvent) {
        events.push(metricsEvent);
        return events;
      }
      // If the line is blank/whitespace-only while collecting, continue
      if (message.trim() === '') return events;
      // If line doesn't match any metrics pattern, stop collecting and fall through
      if (!this.isMetricsLine(message)) {
        this.collectingMetrics = false;
        this.metricsAccum = {};
      }
    }

    // Standard parsing
    const standard = parseLogMessage(message);
    if (standard) events.push(standard);
    return events;
  }

  private isMetricsLine(message: string): boolean {
    const trimmed = message.trim();
    return trimmed.startsWith('•') || trimmed.startsWith('Tokens:') ||
           trimmed.startsWith('Cost:') || trimmed.startsWith('Duration:') ||
           trimmed.startsWith('Turns:') || trimmed.startsWith('Tool ') ||
           trimmed.startsWith('Model:') || trimmed.startsWith('Cache');
  }

  private tryParseMetricsLine(message: string): ParsedAIMetricsEvent | null {
    const tokensMatch = message.match(TOKENS_RE);
    if (tokensMatch) {
      this.metricsAccum.inputTokens = parseNum(tokensMatch[1]);
      this.metricsAccum.outputTokens = parseNum(tokensMatch[2]);
      this.metricsAccum.totalTokens = parseNum(tokensMatch[3]);
    }

    const cacheMatch = message.match(CACHE_TOKENS_RE);
    if (cacheMatch) {
      this.metricsAccum.cacheReadTokens = parseNum(cacheMatch[1]);
    }

    const costMatch = message.match(COST_RE);
    if (costMatch) {
      this.metricsAccum.costUSD = parseFloat(costMatch[1]);
    }

    const durationMatch = message.match(DURATION_RE);
    if (durationMatch) {
      this.metricsAccum.durationMs = parseNum(durationMatch[1]);
    }

    const turnsMatch = message.match(TURNS_RE);
    if (turnsMatch) {
      this.metricsAccum.turns = parseInt(turnsMatch[1], 10);
    }

    const toolMatch = message.match(TOOL_EXEC_RE);
    if (toolMatch) {
      this.metricsAccum.toolExecutions = parseInt(toolMatch[1], 10);
    }

    const modelMatch = message.match(MODEL_RE);
    if (modelMatch) {
      this.metricsAccum.model = modelMatch[1].trim();
    }

    // Check if we have enough fields to emit
    if (
      this.metricsAccum.totalTokens !== undefined &&
      this.metricsAccum.costUSD !== undefined &&
      this.metricsAccum.durationMs !== undefined &&
      this.metricsAccum.turns !== undefined &&
      this.metricsAccum.toolExecutions !== undefined
    ) {
      const event: ParsedAIMetricsEvent = {
        type: 'ai:metrics',
        data: {
          inputTokens: this.metricsAccum.inputTokens ?? 0,
          outputTokens: this.metricsAccum.outputTokens ?? 0,
          totalTokens: this.metricsAccum.totalTokens,
          cacheReadTokens: this.metricsAccum.cacheReadTokens,
          costUSD: this.metricsAccum.costUSD,
          durationMs: this.metricsAccum.durationMs,
          turns: this.metricsAccum.turns,
          toolExecutions: this.metricsAccum.toolExecutions,
          model: this.metricsAccum.model ?? 'unknown',
        },
      };
      this.collectingMetrics = false;
      this.metricsAccum = {};
      return event;
    }

    return null;
  }
}

/**
 * Parse PIPELINE: structured log lines into pipeline:event messages.
 *
 * Formats recognized:
 *   PIPELINE:<phase>:<category>:key=val,key=val,...
 *   PIPELINE:<phase>:<category>:<action>=<context>(<detail>)
 */
const PIPELINE_RE = /^PIPELINE:(\d+):(\w+):(.+)$/;

function parsePipelineMessage(message: string): ParsedPipelineEvent | null {
  const match = message.match(PIPELINE_RE);
  if (!match) return null;

  const phase = parseInt(match[1], 10);
  const _category = match[2];
  const payload = match[3];

  const detail: Record<string, unknown> = {};
  let eventType: 'start' | 'skip' | 'complete' = 'complete';

  // Parse key=value pairs
  const kvPairs = payload.split(',');
  for (const kv of kvPairs) {
    const eqIdx = kv.indexOf('=');
    if (eqIdx === -1) continue;
    const key = kv.substring(0, eqIdx).trim();
    const val = kv.substring(eqIdx + 1).trim();

    if (key === 'event') {
      eventType = val as 'start' | 'skip' | 'complete';
      continue;
    }

    // Parse typed values
    if (val === 'true') detail[key] = true;
    else if (val === 'false') detail[key] = false;
    else if (val === 'none') detail[key] = val;
    else if (/^\d+$/.test(val)) detail[key] = parseInt(val, 10);
    else detail[key] = val;
  }

  // Parse triggered/skipped migration contexts
  // Format: triggered=key(template) or skipped=key(reason)
  const triggeredMatch = payload.match(/triggered=([^(]+)\(([^)]*)\)/);
  if (triggeredMatch) {
    eventType = 'complete';
    const existing = (detail['aiContextsTriggered'] as Array<{ key: string; template: string }>) || [];
    existing.push({ key: triggeredMatch[1], template: triggeredMatch[2] });
    detail['aiContextsTriggered'] = existing;
  }

  const skippedMatch = payload.match(/skipped=([^(]+)\(([^)]*)\)/);
  if (skippedMatch) {
    eventType = 'complete';
    const existing = (detail['aiContextsSkipped'] as Array<{ key: string; reason: string }>) || [];
    existing.push({ key: skippedMatch[1], reason: skippedMatch[2] });
    detail['aiContextsSkipped'] = existing;
  }

  // Parse template rendered
  const templateMatch = payload.match(/rendered=([^,]+)/);
  if (templateMatch && _category === 'template') {
    detail['templatesRendered'] = [templateMatch[1]];
  }

  // Parse deterministic patches (+ separated)
  if (detail['deterministic'] && typeof detail['deterministic'] === 'string' && detail['deterministic'] !== 'none') {
    detail['deterministicPatches'] = (detail['deterministic'] as string).split('+');
    delete detail['deterministic'];
  } else if (detail['deterministic'] === 'none') {
    detail['deterministicPatches'] = [];
    delete detail['deterministic'];
  }

  // Rename fnCount to fnPatchCount
  if ('fnCount' in detail) {
    detail['fnPatchCount'] = detail['fnCount'];
    delete detail['fnCount'];
  }

  // Parse templatesRendered (+ separated)
  if (detail['templatesRendered'] && typeof detail['templatesRendered'] === 'string') {
    detail['templatesRendered'] = (detail['templatesRendered'] as string) === 'none'
      ? []
      : (detail['templatesRendered'] as string).split('+');
  }

  return {
    type: 'pipeline:event',
    data: { phase, event: eventType, detail },
  };
}

function parseLogMessage(message: string): ParsedEvent | null {
  // Check for PIPELINE: structured events first
  if (message.startsWith('PIPELINE:')) {
    return parsePipelineMessage(message);
  }

  // Check for solution progress (e.g., "[1/3] Processing solution: my-app")
  const progressMatch = message.match(SOLUTION_PROGRESS_RE);
  if (progressMatch) {
    return {
      type: 'progress',
      data: {
        phase: 'upgrading',
        current: parseInt(progressMatch[1], 10),
        total: parseInt(progressMatch[2], 10),
        solutionName: progressMatch[3].trim(),
      },
    };
  }

  // Check phase patterns
  for (const { pattern, phase } of PHASE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        type: 'progress',
        data: { phase, current: 0, total: 0 },
      };
    }
  }

  // Check AI patterns
  for (const { pattern, action, descriptionFn } of AI_PATTERNS) {
    const aiMatch = message.match(pattern);
    if (aiMatch) {
      return {
        type: 'ai:action',
        data: { action, description: descriptionFn(aiMatch) },
      };
    }
  }

  // Check solution success
  if (SOLUTION_SUCCESS_RE.test(message)) {
    return {
      type: 'solution:status',
      data: { solutionName: '', status: 'success', message: 'Upgraded successfully' },
    };
  }

  // Check solution skipped (already at target version)
  if (SOLUTION_SKIPPED_RE.test(message)) {
    return {
      type: 'solution:status',
      data: { solutionName: '', status: 'skipped', message: 'Already at target version' },
    };
  }

  // Check solution failure
  const failMatch = message.match(SOLUTION_FAILED_RE);
  if (failMatch) {
    return {
      type: 'solution:status',
      data: { solutionName: '', status: 'failed', message: message },
    };
  }

  // Check build phase (solution enters "building" status)
  if (BUILD_RUNNING_RE.test(message)) {
    return {
      type: 'solution:status',
      data: { solutionName: '', status: 'building' },
    };
  }

  return null;
}
