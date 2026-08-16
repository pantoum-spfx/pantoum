import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../utils/logger.js';
import type { PatchObject, AIAction } from '../../schema/patchSchema.js';
import { DEFAULTS, FILE_PATTERNS, SPFX_CONFIG_FILES } from '../../constants.js';
import { ESLINT_DEFAULTS, RETRY_DEFAULTS } from '../../defaults.js';
import type { PatchRepository } from '../patchRepository.js';
import {
  createRuntimeAdapter,
  getRuntimeLabel,
  resolveAgentProvider,
  resolveRuntimeModel,
} from '../../adapters/runtimeAdapterFactory.js';
import type { AgentProvider } from '../../defaults.js';
import { renderTemplate, type TemplateName, type TemplateVariables } from '../../utils/templateLoader.js';

function isFileEditingBashCommand(command: string | undefined): boolean {
  if (!command) return false;
  return (
    /(?:^|\s)(?:cat|tee)\b[\s\S]*?>/.test(command) ||
    /apply_patch/.test(command) ||
    /(?:^|\s)sed\b[\s\S]*?-i\b/.test(command) ||
    /(?:^|\s)perl\b[\s\S]*?-pi\b/.test(command) ||
    /(?:^|\s)node\b[\s\S]*(?:writeFileSync|appendFileSync|mkdirSync)/.test(command)
  );
}

function isEditingAction(action: { tool?: string; target?: string }): boolean {
  return action.tool === 'Edit' ||
    action.tool === 'MultiEdit' ||
    (action.tool === 'Bash' && isFileEditingBashCommand(action.target));
}

interface ErrorContext {
  solutionPath: string;
  solutionName: string;
  targetVersion: string;
  errorOutput: string;
  errorType: 'upgrade-report' | 'build' | 'test' | 'runtime';
  stage: 'build-fix' | 'post-upgrade';
  aiFixEslintProperly?: boolean;
  aiMaxRetries?: number;
  agentProvider?: AgentProvider;
  /** Set when the "failure" was forced by a warnings check on a SUCCESSFUL build —
   *  selects the warnings-cleanup prompt instead of the build-error prompt. */
  cleanupReason?: 'typescript' | 'sass' | 'eslint';
}

/**
 * ErrorAnalyzer - Generates prompts for Claude Code to fix SPFx upgrade errors
 * 
 * IMPORTANT: The prompting strategy emphasizes functionality preservation to prevent
 * Claude from breaking working code while fixing compilation errors.
 * 
 * Key principles:
 * 1. Code WAS WORKING before upgrade - respect existing logic
 * 2. Use 3-phase approach: Understand → Plan → Fix
 * 3. Default to ADDING compatibility code rather than REMOVING functionality
 * 4. State management and business logic must be preserved
 * 
 * This prevents issues like:
 * - Removing pagination state management
 * - Simplifying complex conditions to hardcoded values
 * - Deleting "unnecessary" code that's actually critical
 */
/**
 * A request the AI provider's service rejected (content filter, 4xx/5xx),
 * as opposed to the model failing at the task. These are backend failures;
 * they must surface prominently and never be silently folded into
 * "the AI could not fix it".
 */
export function isProviderServiceError(message: string): boolean {
  return /CAPIError|providerCallId=|content management policy|\bstatus=[45]\d\d\b/.test(message);
}

export class ErrorAnalyzer {
  private patchRepository?: PatchRepository;
  private providerErrorCount = 0;

  constructor(patchRepository?: PatchRepository) {
    this.patchRepository = patchRepository;
  }

  /** Requests rejected by the AI provider's service during this run */
  getProviderErrorCount(): number {
    return this.providerErrorCount;
  }
  
  /**
   * Analyze error and generate context for Claude Code to create patches
   */
  async analyzeError(context: ErrorContext): Promise<{
    analysisPrompt: string;
    contextFiles: string[];
    suggestedPatches: PatchObject[];
  }> {
    const { solutionPath, errorOutput, errorType, solutionName } = context;

    // Gather relevant context files
    const contextFiles = await this.gatherContextFiles(solutionPath, errorOutput);
    
    // Create analysis prompt for Claude Code
    const analysisPrompt = this.createAnalysisPrompt(context, contextFiles);
    
    // For now, return empty patches - Claude Code will generate them
    const suggestedPatches: PatchObject[] = [];
    
    logger.info(`→ Prepared error analysis for ${errorType} error in ${solutionName}`);
    
    return {
      analysisPrompt,
      contextFiles,
      suggestedPatches
    };
  }

  /**
   * Create a detailed prompt for Claude Code to fix errors directly in files
   */
  private createAnalysisPrompt(context: ErrorContext, contextFiles: string[]): string {
    const { errorOutput, errorType, solutionName, targetVersion } = context;

    // Different prompts based on error type
    if (errorType === 'upgrade-report') {
      // M365 CLI errors - minimal fixes only
      const templateVars: TemplateVariables = {
        solutionName,
        errorOutput,
        contextFilesList: contextFiles.map(file => `- ${file}`).join('\n')
      };
      return renderTemplate('m365-cli-error-fix', templateVars);
    }

    // Warnings cleanup — the build SUCCEEDS; the failure was forced by a warnings
    // check. The build-error prompt must not be used here: it instructs the model
    // to only make the build compile and ignore everything else, so it correctly
    // no-ops on warnings and the cleanup never happens.
    if (context.cleanupReason) {
      const warningCount = (errorOutput.match(/warning:/gi) || []).length;
      const fixModeInstruction = context.aiFixEslintProperly === false
        ? 'Resolve each warning with a targeted `// eslint-disable-next-line <rule>` comment directly above the offending line. Do not change the code itself and do not edit the ESLint configuration.'
        : 'Fix the code itself. Do NOT suppress: no eslint-disable comments, no rule changes in .eslintrc.js / eslint.config.js, no tsconfig loosening.';
      const templateVars: TemplateVariables = {
        solutionName,
        targetVersion,
        warningKind: context.cleanupReason,
        warningCount: String(warningCount),
        fixModeInstruction,
        errorOutput,
        contextFilesList: contextFiles.map(file => `- ${file}`).join('\n')
      };
      return renderTemplate('lint-cleanup', templateVars);
    }
    
    // Build/test errors - comprehensive fixes with functionality preservation
    // Check if output contains TypeScript warnings (not just errors)
    // Use case-insensitive matching to catch all variations
    const hasTypeScriptWarnings = /warning:.*\(ts\d+\)/i.test(errorOutput);
    const targetDescription = hasTypeScriptWarnings
      ? `all ${errorType} errors AND warnings`
      : `this ${errorType} error`;

    const templateVars: TemplateVariables = {
      solutionName,
      targetVersion,
      targetDescription,
      errorType: errorType.toUpperCase(),
      errorOutput,
      contextFilesList: contextFiles.map(file => `- ${file}`).join('\n'),
      hasTypeScriptWarnings,
      maxBuildRetries: String(context.aiMaxRetries ?? RETRY_DEFAULTS.AI_MAX_RETRIES)
    };

    const prompt = renderTemplate('build-error-fix', templateVars);

    // Add ESLint optimization when AI is set to fix ESLint properly
    if (context.aiFixEslintProperly && errorType === 'build') {
      const eslintOptimization = this.detectAndCreateEslintOptimization(errorOutput);
      if (eslintOptimization) {
        // Prepend ESLint optimization to prompt
        return eslintOptimization + '\n\n' + prompt;
      }
    }

    return prompt;
  }

  /**
   * Detect ESLint warnings and create optimization prompt
   */
  private detectAndCreateEslintOptimization(errorOutput: string): string | null {
    // Parse ESLint warnings from the error output
    const eslintWarnings = errorOutput.match(/Warning - lint.*?: error ([@\w\/-]+):/g) || [];
    
    if (eslintWarnings.length === 0) {
      return null;
    }

    // Extract unique rule names
    const ruleNames = new Set<string>();
    for (const warning of eslintWarnings) {
      const match = warning.match(/error ([@\w\/-]+):/);
      if (match) {
        ruleNames.add(match[1]);
      }
    }

    // Only optimize if there are many warnings
    if (eslintWarnings.length < ESLINT_DEFAULTS.MIN_WARNINGS_FOR_OPTIMIZATION) {
      return null;
    }

    logger.info(`   → Detected ${eslintWarnings.length} ESLint warnings from ${ruleNames.size} rules`);
    logger.info(`   → Rules: ${Array.from(ruleNames).join(', ')}`);

    const templateVars: TemplateVariables = {
      warningCount: String(eslintWarnings.length),
      ruleCount: String(ruleNames.size),
      rulesList: Array.from(ruleNames).map(r => `'${r}'`).join(', '),
      rulesConfig: Array.from(ruleNames).map(rule => `    '${rule}': 'off'`).join(',\n')
    };

    return renderTemplate('eslint-optimization', templateVars);
  }

  /**
   * Gather relevant context files based on error analysis
   */
  private async gatherContextFiles(solutionPath: string, errorOutput: string): Promise<string[]> {
    const contextFiles: string[] = [];
    
    // Always include package.json
    const packageJsonPath = path.join(solutionPath, FILE_PATTERNS.PACKAGE_JSON);
    if (fs.existsSync(packageJsonPath)) {
      contextFiles.push(packageJsonPath);
    }

    // Include tsconfig.json for TypeScript errors
    if (errorOutput.includes('TS') || errorOutput.includes('TypeScript')) {
      const tsconfigPath = path.join(solutionPath, FILE_PATTERNS.TSCONFIG_JSON);
      if (fs.existsSync(tsconfigPath)) {
        contextFiles.push(tsconfigPath);
      }
    }

    // Include SPFx config files
    for (const configFile of SPFX_CONFIG_FILES) {
      const configPath = path.join(solutionPath, configFile);
      if (fs.existsSync(configPath)) {
        contextFiles.push(configPath);
      }
    }

    // Include source files mentioned in error
    const sourceFileMatches = errorOutput.match(/[\w\/\\-]+\.(?:ts|tsx|js|jsx)/g);
    if (sourceFileMatches) {
      for (const sourceFile of sourceFileMatches) {
        const fullPath = path.join(solutionPath, sourceFile);
        if (fs.existsSync(fullPath)) {
          contextFiles.push(fullPath);
        }
      }
    }

    return contextFiles;
  }

  /**
   * Execute Claude Code analysis using simplified SDK
   */
  async executeClaudeCodeAnalysis(
    analysisPrompt: string,
    _contextFiles: string[],
    solutionPath: string,
    model: string = DEFAULTS.CLAUDE_MODEL,
    errorType?: 'upgrade-report' | 'build' | 'test' | 'runtime',
    runDirectory?: string,
    debugReports?: boolean,
    thinkingEffort?: string,
    agentProvider?: AgentProvider
  ): Promise<{ patches: PatchObject[], actions: AIAction[], claudeSummary?: string, metrics?: import('../../adapters/types.js').RuntimeMetrics }> {
    const claudeActions: AIAction[] = [];
    const provider = resolveAgentProvider(model, agentProvider);
    const runtimeModel = resolveRuntimeModel(model, provider);
    const runtimeLabel = getRuntimeLabel(provider);
    
    try {
      logger.info('🤖 %s analyzing %s errors...', runtimeLabel, analysisPrompt.includes('build') ? 'build' : 'error');
      
      // Create custom logger that implements the runtime adapter Logger interface
      const errorFixLogger = {
        log: (entry: any) => {
          // Filter out debug-level "Received message" logs
          if (entry && typeof entry === 'object' && 'level' in entry && entry.level >= 3) {
            if (entry.message && entry.message.includes('Received message')) {
              return; // Skip these noisy debug messages
            }
          }
          
          // Log other messages
          if (entry && typeof entry === 'object' && 'message' in entry) {
            const level = entry.level !== undefined ? `[${entry.level}]` : '';
            const msg = `   [${runtimeLabel}]${level}: ${entry.message}`;
            logger.info(msg);
          } else if (typeof entry === 'string' && !entry.includes('Received message')) {
            logger.info(`   [${runtimeLabel}]: ${entry}`);
          }
        },
        error: (message: string, _context?: Record<string, any>) => logger.error(`   [${runtimeLabel} Error]: ${message}`),
        warn: (message: string, _context?: Record<string, any>) => logger.warn(`   [${runtimeLabel} Warning]: ${message}`),
        info: (message: string, _context?: Record<string, any>) => logger.info(`   [${runtimeLabel}]: ${message}`),
        debug: (message: string, _context?: Record<string, any>) => {
          // Filter out "Received message" debug logs
          if (!message.includes('Received message')) {
            logger.info(`   [${runtimeLabel} Debug]: ${message}`);
          }
        },
        trace: (message: string, _context?: Record<string, any>) => {
          // Usually we don't need trace level
          if (!message.includes('Received message')) {
            logger.info(`   [${runtimeLabel} Trace]: ${message}`);
          }
        }
      };
      
      const runtime = await createRuntimeAdapter(provider);

      logger.info('   → Starting error analysis with %s (model: %s)...', runtimeLabel, runtimeModel);

      const sessionLabel = `error_${errorType || 'unknown'}_${Date.now()}`;

      // For upgrade-report errors, don't allow Bash to prevent build attempts
      let claudeInstance = runtime
        .withModel(runtimeModel)
        .inDirectory(solutionPath)
        .withSessionId(`pantoum_${sessionLabel}`)
        .withLogger(errorFixLogger);

      // SDK-native debug trace file (when --debugReports is enabled)
      if (debugReports && runDirectory) {
        claudeInstance = claudeInstance.withDebugFile(
          path.join(runDirectory, `ai_debug_${sessionLabel}.jsonl`)
        );
      }

      // Adaptive thinking effort
      if (thinkingEffort && thinkingEffort !== 'off') {
        claudeInstance = claudeInstance.withThinkingEffort(thinkingEffort);
      }

      // Set allowed tools based on error type
      if (errorType === 'upgrade-report') {
        claudeInstance.allowTools('Read', 'Edit', 'Write', 'MultiEdit', 'Bash');
      } else {
        // For build errors, allow Bash but with Node version restrictions in the prompt
        claudeInstance.allowTools('Read', 'Edit', 'Write', 'MultiEdit', 'Grep', 'LS', 'Bash');
      }
      
      // Execute query - handle metrics if using agent SDK
      let response: string;
      let metrics: any = undefined;

      const claudeQuery = claudeInstance
        .onToolUse((tool) => {
          // Skip internal tools
          if (tool.name === 'TodoWrite' || tool.name === 'TodoRead') {
            return;
          }
          
          // Log tool usage with emojis for clarity
          const toolEmojis: Record<string, string> = {
            'Read': '📖',
            'Edit': '✏️',
            'Write': '💾',
            'Grep': '🔍',
            'LS': '📁',
            'Bash': '🖥️'
          };
          const emoji = toolEmojis[tool.name] || '🔧';
          
          // Extract file path or relevant info from input
          let detail = '';
          let target = '';
          let description = '';
          
          if (tool.input && typeof tool.input === 'object') {
            // Get target file/path
            if ('file_path' in tool.input) {
              target = tool.input.file_path as string;
              detail = `: ${target}`;
            } else if ('path' in tool.input) {
              target = tool.input.path as string;
              detail = `: ${target}`;
            } else if ('pattern' in tool.input) {
              target = tool.input.pattern as string;
              detail = `: searching for "${target}"`;
            } else if ('command' in tool.input) {
              target = tool.input.command as string;
              detail = `: ${target}`;
            }
            
            // Get description if available
            if ('description' in tool.input) {
              description = tool.input.description as string;
            }
            
            // For Edit operations, show what's being changed
            if (tool.name === 'Edit' && 'old_string' in tool.input && 'new_string' in tool.input) {
              const oldStr = tool.input.old_string as string;
              const newStr = tool.input.new_string as string;
              // Create a concise description while preserving full context
              const oldPreview = oldStr.length > 80 ? oldStr.substring(0, 80) + '...' : oldStr;
              const newPreview = newStr.length > 80 ? newStr.substring(0, 80) + '...' : newStr;
              description = `Changing "${oldPreview}" to "${newPreview}"`;
            }
          }
          
          logger.info(`   ${emoji} ${tool.name}${detail}`);
          if (description) {
            logger.info(`      → ${description}`);
          }
          
          // Track the action
          const action: AIAction = {
            timestamp: new Date().toISOString(),
            tool: tool.name,
            action: tool.name.toLowerCase(),
            target: target,
            details: description || `Using ${tool.name} tool`,
            result: 'success' // Will be updated if error occurs
          };
          
          // For Edit operations, store the full old/new strings for report generation
          if (tool.name === 'Edit' && 'old_string' in tool.input && 'new_string' in tool.input) {
            (action as any).old_string = tool.input.old_string;
            (action as any).new_string = tool.input.new_string;
          }

          claudeActions.push(action);

          // Action tracking - warn at milestones but don't abort
          // The runtime edits files directly, so even many actions can be legitimate
          if (claudeActions.length === 20) {
            logger.warn('   ⚠️ %s has made 20 actions', runtimeLabel);
          } else if (claudeActions.length === 40) {
            logger.warn('   ⚠️ %s has made 40 actions - this is taking a while', runtimeLabel);
          } else if (claudeActions.length === 60) {
            logger.warn('   ⚠️ %s has made 60 actions - complex solution', runtimeLabel);
          }
        })
        .onAssistant((content) => {
          // Log assistant's explanations (but keep them brief)
          if (content && typeof content === 'string') {
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
              // Just log the first line as a summary
              const firstLine = lines[0].substring(0, 100);
              if (firstLine.length > 10) {
                logger.info(`   💭 ${runtimeLabel}: ${firstLine}${firstLine.length >= 100 ? '...' : ''}`);
              }
            }
          }
        })
        .skipPermissions();

      // Execute with metrics
      const queryBuilder = claudeQuery.query(analysisPrompt);
      const claudeResult = await (queryBuilder as any).asText(true); // Request metrics

      if (typeof claudeResult === 'object' && 'response' in claudeResult && 'metrics' in claudeResult) {
        response = claudeResult.response;
        metrics = claudeResult.metrics;

        // Log detailed metrics
        logger.info('   📊 Analysis Metrics:');
        logger.info('      • Tokens: %d input / %d output (Total: %d)',
          metrics.inputTokens || 0,
          metrics.outputTokens || 0,
          metrics.totalTokens || 0
        );
        if (metrics.cacheReadTokens) {
          logger.info('      • Cache: %d tokens read', metrics.cacheReadTokens);
        }
        logger.info('      • Cost: $%s', (metrics.costUSD || 0).toFixed(4));
        logger.info('      • Duration: %dms', metrics.durationMs || 0);
        logger.info('      • Turns: %d', metrics.turns || 1);

        if (metrics.stopReason && metrics.stopReason !== 'end_turn') {
          logger.warn('      ⚠️ Stop reason: %s (response may be incomplete)', metrics.stopReason);
        }
      } else {
        // Fallback if metrics not available
        response = typeof claudeResult === 'string' ? claudeResult : claudeResult.response;
      }

      logger.info('✅ %s completed error fixes', runtimeLabel);
      
      // Log summary of actions
      if (claudeActions.length > 0) {
        logger.info('   📊 Summary: %d actions performed', claudeActions.length);
        const editCount = claudeActions.filter(a => isEditingAction(a)).length;
        const readCount = claudeActions.filter(a => a.tool === 'Read').length;
        if (editCount > 0) logger.info('      • %d files edited', editCount);
        if (readCount > 0) logger.info('      • %d files read', readCount);
      }
      
      // Extract Claude's summary from the response
      let claudeSummary: string | undefined;
      try {
        // Look for structured summaries in Claude's response
        if (response && typeof response === 'string') {
          // Try to extract "## Fixed Issues:" section
          const fixedIssuesMatch = response.match(/##\s*Fixed Issues:?\s*\n([\s\S]*?)(?=\n##|$)/i);
          if (fixedIssuesMatch) {
            claudeSummary = fixedIssuesMatch[1].trim();
          } else {
            // Try to extract summary section
            const summaryMatch = response.match(/##\s*Summary:?\s*\n([\s\S]*?)(?=\n##|$)/i);
            if (summaryMatch) {
              claudeSummary = summaryMatch[1].trim();
            } else {
              // Look for bullet points at the end
              const lines = response.split('\n');
              const bulletPoints: string[] = [];
              let foundBullets = false;
              
              // Scan from end backwards for bullet points
              for (let i = lines.length - 1; i >= 0 && i >= lines.length - 20; i--) {
                const line = lines[i].trim();
                if (line.match(/^[-•*]\s+.+/) || line.match(/^\d+\.\s+.+/)) {
                  bulletPoints.unshift(line);
                  foundBullets = true;
                } else if (foundBullets && line === '') {
                  // Continue collecting if we hit empty lines
                  continue;
                } else if (foundBullets && !line.match(/^[-•*\d]/)) {
                  // Stop if we hit non-bullet content
                  break;
                }
              }
              
              if (bulletPoints.length > 2) {
                claudeSummary = bulletPoints.join('\n');
              }
            }
          }
        }
      } catch (err) {
        logger.warn('   → Failed to extract %s summary: %s', runtimeLabel, err);
      }
      
      // Save AI runtime debug output to file
      try {
        // Save to run directory if provided, otherwise to solution directory
        const debugDir = runDirectory || solutionPath;
        const debugPath = path.join(debugDir, `ai_debug_${errorType}_${Date.now()}.json`);
        const debugContent = {
          timestamp: new Date().toISOString(),
          solutionPath,
          errorType,
          prompt: analysisPrompt,
          response: response,
          actions: claudeActions,
          claudeSummary: claudeSummary,
          summary: {
            totalActions: claudeActions.length,
            edits: claudeActions.filter(a => isEditingAction(a)).length,
            reads: claudeActions.filter(a => a.tool === 'Read').length,
            bashCommands: claudeActions.filter(a => a.tool === 'Bash').length
          }
        };
        fs.mkdirSync(path.dirname(debugPath), { recursive: true });
        fs.writeFileSync(debugPath, JSON.stringify(debugContent, null, 2), DEFAULTS.ENCODING);
        logger.info('   → %s debug output saved: %s', runtimeLabel, debugPath);

        // Register the file with patchRepository if available
        if (this.patchRepository) {
          this.patchRepository.registerFile(debugPath);
        }
      } catch (saveErr) {
        logger.warn('   → Failed to save %s debug output: %s', runtimeLabel, saveErr);
      }
      
      // Since the runtime fixes files directly, return empty patches array
      // The fixes are already applied to the files
      // Include metrics if available
      const result: any = { patches: [], actions: claudeActions, claudeSummary };
      if (metrics) {
        result.metrics = {
          tokens: {
            input: metrics.inputTokens || 0,
            output: metrics.outputTokens || 0,
            total: metrics.totalTokens || 0,
            cacheRead: metrics.cacheReadTokens,
            cacheCreation: metrics.cacheCreationTokens
          },
          cost: metrics.costUSD || 0,
          performance: {
            durationMs: metrics.durationMs || 0,
            durationApiMs: metrics.durationApiMs,
            turns: metrics.turns || 1
          },
          toolUsage: metrics.toolExecutions || [],
          sessionId: metrics.sessionId
        };
      }

      return result;
      
    } catch (error: any) {
      logger.error('❌ %s analysis failed: %s', runtimeLabel, error.message || error);

      if (isProviderServiceError(String(error.message ?? ''))) {
        this.providerErrorCount++;
        logger.error('   🚫 The AI provider rejected this request (service-side failure, not a code problem)');
        logger.error('   → Provider rejections this solution: %d', this.providerErrorCount);
      }

      // Log more details about the error
      if (error.exitCode !== undefined) {
        logger.error('   → %s exited with code: %d', runtimeLabel, error.exitCode);
      }
      
      // Check for specific error patterns
      if (error.message?.includes('exit code 1')) {
        logger.error('   → Try authenticating the selected AI runtime');
        logger.error('   → Or check if the runtime is still processing');
      }
      
      if (error.message?.includes('timeout')) {
        logger.error('   → Request timeout - check network connection');
      }
      
      if (error.message?.includes('ENOENT')) {
        logger.error('   → %s not found - check installation', runtimeLabel);
      }
      
      // Save analysis for manual review (in run directory if available)
      const fallbackPath = path.join(runDirectory || solutionPath, `pantoum_error_analysis_${Date.now()}.md`);
      const fallbackContent = `# Error Analysis (Failed)\n\nError: ${error.message}\n\n## Original Analysis Prompt:\n\n${analysisPrompt}`;
      fs.writeFileSync(fallbackPath, fallbackContent, DEFAULTS.ENCODING);
      logger.info('   → Saved analysis for manual review: %s', fallbackPath);
      
      // Track the error
      claudeActions.push({
        timestamp: new Date().toISOString(),
        tool: runtimeLabel,
        action: 'error',
        target: 'analysis',
        details: error.message,
        result: 'error'
      });
      
      return { patches: [], actions: claudeActions, claudeSummary: undefined, metrics: undefined };
    }
  }
  
}