// src/core/claudeMigrationExecutor.ts
import { logger } from '../utils/logger.js';
import type { PatchObject } from '../schema/patchSchema.js';
import type { ThirdPartyUpdate } from '../schema/thirdPartySchema.js';
import type {
  VerificationResult,
  VerificationCheck,
  VerificationSummary,
  VerificationToolCall,
} from '../schema/verificationSchema.js';
import { DEFAULTS, TIMEOUTS } from '../constants.js';
import { VERIFICATION_DEFAULTS } from '../defaults.js';
import { renderTemplate, type TemplateVariables, type TemplateName } from '../utils/templateLoader.js';
import { sanitizeErrorForLogging, sanitizePathForPrompt } from '../utils/sanitize.js';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationLogEntry {
  timestamp: string;
  action: string;
  file?: string;
  details?: string;
  old_string?: string;
  new_string?: string;
  edits?: Array<{
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }>;
}

/**
 * Simple migration executor that uses Claude Code directly to migrate code
 */
export class ClaudeMigrationExecutor {
  private migrationLog: MigrationLogEntry[] = [];

  /**
   * Execute a migration using Claude Code with direct file editing
   */
  async executeMigration(
    solutionPath: string,
    packageName: string,
    fromVersion: string,
    toVersion: string,
    migrationContext: any,
    model: string = DEFAULTS.CLAUDE_MODEL,
    runDirectory?: string,
    debugReports?: boolean,
    thinkingEffort?: string
  ): Promise<PatchObject[]> {
    logger.info('🤖 Starting Claude migration for %s: v%s → v%s', packageName, fromVersion, toVersion);
    
    // Reset log for this migration
    this.migrationLog = [];
    
    try {
      // Build migration prompt with hints and documentation URLs
      const prompt = this.buildMigrationPrompt(packageName, fromVersion, toVersion, migrationContext);
      
      // Create custom logger that implements the Claude SDK Logger interface
      const migrationLogger = {
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
            const msg = `   [Claude]${level}: ${entry.message}`;
            logger.info(msg);
            this.parseAndLogAction(entry.message);
          } else if (typeof entry === 'string' && !entry.includes('Received message')) {
            logger.info(`   [Claude]: ${entry}`);
            this.parseAndLogAction(entry);
          }
        },
        error: (message: string, _context?: Record<string, any>) => {
          logger.error(`   [Claude Error]: ${message}`);
          this.migrationLog.push({
            timestamp: new Date().toISOString(),
            action: 'error',
            details: message
          });
        },
        warn: (message: string, _context?: Record<string, any>) => {
          logger.warn(`   [Claude Warning]: ${message}`);
        },
        info: (message: string, _context?: Record<string, any>) => {
          logger.info(`   [Claude Info]: ${message}`);
          this.parseAndLogAction(message);
        },
        debug: (message: string, _context?: Record<string, any>) => {
          // Filter out "Received message" debug logs
          if (!message.includes('Received message')) {
            logger.info(`   [Claude Debug]: ${message}`);
          }
        },
        trace: (message: string, _context?: Record<string, any>) => {
          // Usually we don't need trace level
          if (!message.includes('Received message')) {
            logger.info(`   [Claude Trace]: ${message}`);
          }
        }
      };

      // Import Claude Agent SDK (supports both subscription and ANTHROPIC_API_KEY auth)
      const { claude } = await import('../adapters/claudeAgentSdkAdapter.js');

      // Execute migration with Claude
      logger.info('   → Executing migration with Claude Code...');

      // Web browsing disabled — all migration instructions are self-contained
      const allowedTools = ['Read', 'Edit', 'Write', 'Grep', 'LS', 'MultiEdit', 'Bash'] as const;

      // Generate session label for correlation
      const sessionLabel = `migration_${packageName.replace(/[@/]/g, '_')}_${Date.now()}`;

      let claudeInstance = claude()
        .withModel(model)
        .inDirectory(solutionPath)
        .allowTools(...allowedTools)
        .withSessionId(`pantoum_${sessionLabel}`)
        .withLogger(migrationLogger);

      // Adaptive thinking effort
      if (thinkingEffort && thinkingEffort !== 'off') {
        claudeInstance = claudeInstance.withThinkingEffort(thinkingEffort);
      }

      // SDK-native debug trace file (when --debugReports is enabled)
      if (debugReports && runDirectory) {
        claudeInstance = claudeInstance.withDebugFile(
          path.join(runDirectory, `claude_debug_${sessionLabel}.jsonl`)
        );
      }

      claudeInstance = claudeInstance
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
            } else if ('url' in tool.input) {
              target = tool.input.url as string;
              detail = `: ${target}`;
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
              const oldStr = (tool.input.old_string as string).substring(0, 50);
              const newStr = (tool.input.new_string as string).substring(0, 50);
              description = `Changing "${oldStr}..." to "${newStr}..."`;
            }
          }
          
          logger.info(`   ${emoji} ${tool.name}${detail}`);
          if (description) {
            logger.info(`      → ${description}`);
          }
          
          // Track in migration log with full Edit details
          const logEntry: MigrationLogEntry = {
            timestamp: new Date().toISOString(),
            action: tool.name.toLowerCase(),
            file: target,
            details: description || `Using ${tool.name} tool`
          };
          
          // For Edit operations, capture the full old/new strings
          if (tool.name === 'Edit' && tool.input && typeof tool.input === 'object') {
            if ('old_string' in tool.input && 'new_string' in tool.input) {
              (logEntry as any).old_string = tool.input.old_string;
              (logEntry as any).new_string = tool.input.new_string;
            }
          }
          
          // For MultiEdit operations, capture all edits
          if (tool.name === 'MultiEdit' && tool.input && typeof tool.input === 'object') {
            if ('edits' in tool.input && Array.isArray(tool.input.edits)) {
              (logEntry as any).edits = tool.input.edits;
            }
          }
          
          this.migrationLog.push(logEntry);
        })
        .onAssistant((content) => {
          // Log assistant's migration explanations (but keep them brief)
          if (content && typeof content === 'string') {
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
              // Look for key migration actions
              for (const line of lines) {
                if (line.includes('Updating') || line.includes('Migrating') || 
                    line.includes('Fixed') || line.includes('Changed') ||
                    line.includes('Replaced') || line.includes('Added')) {
                  const trimmedLine = line.substring(0, 100);
                  logger.info(`   🔄 ${trimmedLine}${trimmedLine.length >= 100 ? '...' : ''}`);
                  break; // Just log the first relevant action
                }
              }
            }
          }
        })
        .skipPermissions();

      // Execute query with metrics
      const queryBuilder = claudeInstance.query(prompt);
      const result = await (queryBuilder as any).asText(true); // Request metrics

      let response: string;
      let metrics: any = undefined;

      if (typeof result === 'object' && 'response' in result && 'metrics' in result) {
        response = result.response;
        metrics = result.metrics;

        // Log detailed metrics
        logger.info('   📊 Migration Metrics:');
        logger.info('      • Tokens: %d input / %d output (Total: %d)',
          metrics.inputTokens || 0,
          metrics.outputTokens || 0,
          metrics.totalTokens || 0
        );
        if (metrics.cacheReadTokens) {
          logger.info('      • Cache: %d tokens read', metrics.cacheReadTokens);
        }
        logger.info('      • Cost: $%s', (metrics.costUSD || 0).toFixed(4));
        logger.info('      • Duration: %dms (API: %dms)',
          metrics.durationMs || 0,
          metrics.durationApiMs || 0
        );
        logger.info('      • Turns: %d', metrics.turns || 1);

        if (metrics.toolExecutions && metrics.toolExecutions.length > 0) {
          logger.info('      • Tool Executions: %d', metrics.toolExecutions.length);

          // Aggregate tool usage
          const toolCounts: Record<string, number> = {};
          for (const exec of metrics.toolExecutions) {
            toolCounts[exec.name] = (toolCounts[exec.name] || 0) + 1;
          }

          for (const [toolName, count] of Object.entries(toolCounts)) {
            logger.info('         - %s: %d times', toolName, count);
          }
        }

        if (metrics.permissionDenials && metrics.permissionDenials.length > 0) {
          logger.warn('      ⚠️ Permission Denials: %d', metrics.permissionDenials.length);
        }

        if (metrics.stopReason && metrics.stopReason !== 'end_turn') {
          logger.warn('      ⚠️ Stop reason: %s (response may be incomplete)', metrics.stopReason);
        }
      } else {
        // Fallback if metrics not available
        response = typeof result === 'string' ? result : result.response;
      }

      logger.info('   ✅ Claude Code migration completed successfully!');
      
      // Create a summary patch for reporting
      const summaryPatch = this.createMigrationSummaryPatch(
        packageName,
        fromVersion,
        toVersion,
        response,
        metrics
      );
      
      return [summaryPatch];
      
    } catch (error: any) {
      logger.error('❌ Migration failed: %s', error.message || error);
      
      // Log more details about the error
      if (error.exitCode !== undefined) {
        logger.error('   → Claude exited with code: %d', error.exitCode);
      }
      if (error.stack) {
        logger.error('   → Stack trace: %s', sanitizeErrorForLogging(error));
      }
      
      // Save migration log for debugging
      const errorLog = {
        timestamp: new Date().toISOString(),
        package: packageName,
        fromVersion,
        toVersion,
        error: sanitizeErrorForLogging(error),
        exitCode: error.exitCode,
        migrationLog: this.migrationLog
      };

      const errorPath = path.join(runDirectory || solutionPath, `pantoum_claude_migration_error_${Date.now()}.json`);
      fs.writeFileSync(errorPath, JSON.stringify(errorLog, null, 2), { encoding: DEFAULTS.ENCODING as BufferEncoding, mode: 0o600 });
      logger.error('   → Migration log saved to: %s', errorPath);
      
      throw error;
    }
  }

  /**
   * Build a comprehensive migration prompt with hints and docs
   * Uses templates from src/templates/ for migration instructions
   */
  private buildMigrationPrompt(
    packageName: string,
    fromVersion: string,
    toVersion: string,
    migrationContext: any
  ): string {
    const majorFrom = fromVersion.split('.')[0];
    const majorTo = toVersion === 'removed' ? '0' : toVersion.split('.')[0];

    // Determine if this is a removal/replacement migration
    const isRemoval = toVersion === 'removed';

    // Template variables for substitution
    const templateVars: TemplateVariables = {
      packageName,
      fromVersion,
      toVersion,
      fromMajor: majorFrom,
      toMajor: majorTo,
      actualTargetVersion: migrationContext?.actualTargetVersion || toVersion,
      isRemoval
    };

    // Build the preamble - use template for removal or standard preamble
    let prompt = isRemoval
      ? renderTemplate('migration-preamble-removal', templateVars)
      : renderTemplate('migration-preamble', templateVars);

    if (!prompt) {
      throw new Error(`Migration preamble template not found. Ensure templates exist in src/templates/`);
    }


    // Select template: explicit template field or package-based match
    let templateName: TemplateName | undefined;

    if (migrationContext?.template) {
      templateName = migrationContext.template as TemplateName;
    } else if (packageName === '@pnp/sp' && majorTo === '4') {
      templateName = 'pnp-v4-migration';
    } else if (packageName.includes('@microsoft/mgt')) {
      templateName = 'mgt-migration';
    }

    if (!templateName) {
      throw new Error(`No migration template configured for ${packageName}. Add an aiContext with a template field in manual config.`);
    }

    logger.info('PIPELINE:3:template:rendered=%s,package=%s', templateName, packageName);
    const templateContent = renderTemplate(templateName, templateVars);

    // Templates are the single source of truth - no inline fallbacks
    if (!templateContent) {
      throw new Error(`Migration template not found for ${packageName}. Ensure template exists in src/templates/`);
    }

    prompt += templateContent;

    // Append runtime-detected context (env injection, SCSS issues)
    if (migrationContext?.envInjectionDetails) {
      const details = migrationContext.envInjectionDetails;
      prompt += '\n## Environment Variable Details\n\n';

      if (details.sourceFilesWithProcessEnv?.length) {
        prompt += 'Files using process.env.*:\n';
        details.sourceFilesWithProcessEnv.forEach((f: string) => {
          prompt += `- ${sanitizePathForPrompt(f)}\n`;
        });
      }

      if (details.envFiles?.length) {
        prompt += '\nEnvironment files to read values from:\n';
        details.envFiles.forEach((f: string) => {
          prompt += `- ${sanitizePathForPrompt(f)}\n`;
        });
      }
    }

    if (migrationContext?.scssDetails) {
      const details = migrationContext.scssDetails;
      prompt += '\n## SCSS Files to Fix\n\n';

      if (details.filesWithIssues?.length) {
        prompt += 'Files with declaration order issues:\n';
        details.filesWithIssues.forEach((f: string) => {
          prompt += `- ${sanitizePathForPrompt(f)}\n`;
        });
      }
    }

    return prompt;
  }

  /**
   * Parse Claude's log messages to understand what was changed
   */
  private parseAndLogAction(message: string): void {
    const entry: MigrationLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'unknown',
      details: message
    };

    // Parse different types of Claude actions
    if (message.includes('Reading file') || message.includes('read file')) {
      entry.action = 'read';
      const fileMatch = message.match(/['"](.*?)['"]/);
      if (fileMatch) entry.file = fileMatch[1];
    } else if (message.includes('Editing file') || message.includes('edit file') || message.includes('Updating')) {
      entry.action = 'edit';
      const fileMatch = message.match(/['"](.*?)['"]/);
      if (fileMatch) entry.file = fileMatch[1];
    } else if (message.includes('Writing file') || message.includes('Creating file')) {
      entry.action = 'write';
      const fileMatch = message.match(/['"](.*?)['"]/);
      if (fileMatch) entry.file = fileMatch[1];
    } else if (message.includes('grep') || message.includes('search')) {
      entry.action = 'search';
    } else {
      // Skip unrecognised log messages — actual tool usage is already
      // captured by the onToolUse handler with proper tool metadata.
      return;
    }

    this.migrationLog.push(entry);
  }

  /**
   * Create a summary patch that documents what Claude did
   */
  private createMigrationSummaryPatch(
    packageName: string,
    fromVersion: string,
    toVersion: string,
    claudeResponse: string,
    metrics?: any
  ): PatchObject {
    // Extract unique files that were modified
    const filesModified = new Set<string>();
    const changes: string[] = [];
    
    // Analyze the migration log
    this.migrationLog.forEach(entry => {
      if (entry.action === 'edit' && entry.file) {
        filesModified.add(entry.file);
      }
    });
    
    // Parse Claude's response for a summary
    if (claudeResponse) {
      // Look for common patterns in Claude's response
      const lines = claudeResponse.split('\n');
      lines.forEach(line => {
        if (line.includes('Updated') || line.includes('Fixed') || line.includes('Changed') || line.includes('Added')) {
          changes.push(line.trim());
        }
      });
    }
    
    // If we didn't capture specific changes, create a generic summary
    if (changes.length === 0) {
      changes.push(`Migrated ${packageName} from ${fromVersion} to ${toVersion}`);
      changes.push(`Modified ${filesModified.size} files`);
      
      // Count action types
      const actionCounts = new Map<string, number>();
      this.migrationLog.forEach(entry => {
        const count = actionCounts.get(entry.action) || 0;
        actionCounts.set(entry.action, count + 1);
      });
      
      actionCounts.forEach((count, action) => {
        if (action !== 'unknown') {
          changes.push(`${count} ${action} operations`);
        }
      });
    }
    
    // Convert migration log to claudeActions format for detailed reporting
    const claudeActions = this.migrationLog.map(entry => {
      const action: any = {
        timestamp: entry.timestamp,
        tool: entry.action === 'edit' ? 'Edit' : 
              entry.action === 'read' ? 'Read' :
              entry.action === 'write' ? 'Write' :
              entry.action === 'search' ? 'Grep' : entry.action,
        action: entry.action,
        target: entry.file,
        details: entry.details,
        result: 'success'
      };
      
      // Include old_string and new_string for Edit operations
      if (entry.old_string && entry.new_string) {
        action.old_string = entry.old_string;
        action.new_string = entry.new_string;
      }
      
      // Include edits array for MultiEdit operations
      if (entry.edits) {
        action.edits = entry.edits;
      }
      
      return action;
    });
    
    const patch: PatchObject = {
      id: `MIG-${packageName.replace('@', '').replace('/', '-').toUpperCase()}-COMPLETE`,
      title: `${packageName} Migration to v${toVersion}`,
      description: `Complete migration from ${fromVersion} to ${toVersion} performed by Claude Code`,
      type: 'claudeActions',
      file: 'MIGRATION_SUMMARY.md',
      stage: 'post-upgrade',
      claudeActions,
      migrationDetails: {
        filesModified: Array.from(filesModified),
        changes,
        fromVersion,
        toVersion,
        packageName,
        timestamp: new Date().toISOString(),
        ...(metrics && {
          metrics: {
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
            sessionId: metrics.sessionId,
            stopReason: metrics.stopReason
          }
        })
      }
    };
    return patch;
  }

  // ============================================================================
  // VERIFICATION SYSTEM (Claude Self-Verification)
  // ============================================================================

  /**
   * Build the verification prompt with explicit grep commands.
   * Forces Claude to run verification commands and show evidence.
   */
  private buildVerificationPrompt(
    packageName: string,
    fromVersion: string,
    toVersion: string,
    migrationLog: MigrationLogEntry[],
    migrationContext?: any
  ): string {
    // Get patterns to verify based on package type (config-driven or hardcoded fallback)
    const verificationPatterns = this.getVerificationPatterns(packageName, fromVersion, toVersion, migrationContext);

    // Format migration log for context
    const changesDescription = this.formatMigrationLogForVerification(migrationLog);

    // Build verification checks section
    const verificationChecks = verificationPatterns.map((p, i) => `### Check ${i + 1}: ${p.description}
**Pattern that should NOT exist:** \`${p.pattern}\`
**Run this command:**
\`\`\`bash
grep -rn '${p.pattern}' src/ --include="*.ts" --include="*.tsx"
\`\`\`
**Expected result:** No matches (command returns nothing)
`).join('\n');

    // Build check results template
    const checkResultsTemplate = verificationPatterns.map((p, i) =>
      `- Check ${i + 1} [${p.description}]: [VERIFIED/NOT_VERIFIED]`
    ).join('\n');

    const templateVars: TemplateVariables = {
      changesDescription,
      verificationChecks,
      totalChecks: String(verificationPatterns.length),
      checkResultsTemplate,
      hasChecks: verificationPatterns.length > 0
    };

    return renderTemplate('migration-verification', templateVars);
  }

  /**
   * Get verification patterns based on package and version.
   * Each pattern represents something that should NOT exist after migration.
   * Checks migrationContext.verificationPatterns first (from pantoum.patches.yml),
   * then falls back to hardcoded defaults.
   */
  private getVerificationPatterns(
    packageName: string,
    _fromVersion: string,
    toVersion: string,
    migrationContext?: any
  ): { pattern: string; description: string }[] {
    // Config-driven patterns take priority
    if (migrationContext?.verificationPatterns?.length) {
      return migrationContext.verificationPatterns;
    }

    // Hardcoded fallbacks for backwards compatibility
    const majorTo = toVersion.split('.')[0];

    // PnP v4 patterns - comprehensive verification for @pnp/sp migration
    if (packageName === '@pnp/sp' && majorTo === '4') {
      return [
        { pattern: '\\.data\\.ID', description: 'Remove .data wrapper from ID access' },
        { pattern: '\\.data\\.Id', description: 'Remove .data wrapper from Id access' },
        { pattern: '@pnp/common', description: 'Replace @pnp/common with @pnp/core' },
        { pattern: '@pnp/odata', description: 'Replace @pnp/odata with @pnp/queryable' },
        { pattern: '\\.item\\.', description: 'Replace .item chaining with getById()' },
        { pattern: 'presets/all', description: 'Replace presets/all with selective imports' },
      ];
    }

    // React 17+ patterns - deprecated lifecycle methods
    if (packageName === 'react' && Number(majorTo) >= 17) {
      return [
        { pattern: 'componentWillReceiveProps', description: 'Replace componentWillReceiveProps with componentDidUpdate' },
        { pattern: 'UNSAFE_componentWillReceiveProps', description: 'Replace UNSAFE_componentWillReceiveProps with componentDidUpdate' },
        { pattern: 'componentWillMount', description: 'Replace componentWillMount with componentDidMount or constructor' },
        { pattern: 'componentWillUpdate', description: 'Replace componentWillUpdate with componentDidUpdate' },
      ];
    }

    // MGT (Microsoft Graph Toolkit) patterns - when removing/migrating @microsoft/mgt-spfx
    if (packageName.includes('@microsoft/mgt') || packageName === '@microsoft/mgt-spfx') {
      return [
        { pattern: '@microsoft/mgt-react', description: 'Remove @microsoft/mgt-react imports (use web components)' },
        { pattern: '@microsoft/mgt-spfx', description: 'Replace @microsoft/mgt-spfx with mgt-element + mgt-sharepoint-provider' },
        { pattern: "import.*Person.*from.*mgt", description: 'Remove Person component import (use <mgt-person> web component)' },
        { pattern: "import.*PeoplePicker.*from.*mgt", description: 'Remove PeoplePicker import (use <mgt-people-picker> web component)' },
      ];
    }

    return [];
  }

  /**
   * Format migration log for verification context
   */
  private formatMigrationLogForVerification(log: MigrationLogEntry[]): string {
    // Group by file
    const fileEdits = new Map<string, string[]>();

    for (const entry of log) {
      if ((entry.action === 'edit' || entry.action === 'multiedit') && entry.file) {
        if (!fileEdits.has(entry.file)) {
          fileEdits.set(entry.file, []);
        }

        if (entry.old_string && entry.new_string) {
          const oldStr = entry.old_string.substring(0, 60);
          const newStr = entry.new_string.substring(0, 60);
          fileEdits.get(entry.file)!.push(
            `"${oldStr}${oldStr.length >= 60 ? '...' : ''}" → "${newStr}${newStr.length >= 60 ? '...' : ''}"`
          );
        }
      }
    }

    if (fileEdits.size === 0) {
      return 'No edit operations were recorded during migration.';
    }

    let output = 'Files modified:\n';
    for (const [file, edits] of fileEdits) {
      output += `- ${file} (${edits.length} edits)\n`;
    }

    output += '\nChanges made:\n';
    for (const [file, edits] of fileEdits) {
      for (const edit of edits.slice(0, 5)) { // Limit to first 5 edits per file
        output += `- ${path.basename(file)}: ${edit}\n`;
      }
      if (edits.length > 5) {
        output += `  ... and ${edits.length - 5} more edits\n`;
      }
    }

    return output;
  }

  /**
   * Build prompt for fixing specific issues found during verification
   */
  private buildFixPrompt(
    packageName: string,
    failedChecks: VerificationCheck[]
  ): string {
    // Build issues list for template
    const issuesList = failedChecks.map(check => `### ${check.instruction}

**Pattern that should NOT exist:** \`${check.pattern}\`

**Locations to fix:**
${check.findings?.map(f => `- ${f}`).join('\n') || 'Run grep to find locations'}

**Action:** Find and replace this pattern according to the ${packageName} migration guide.
`).join('\n');

    const templateVars: TemplateVariables = { issuesList };
    return renderTemplate('migration-fix', templateVars);
  }

  /**
   * Parse verification output from Claude
   */
  private parseVerificationResult(
    claudeOutput: string,
    patterns: { pattern: string; description: string }[]
  ): VerificationCheck[] {
    const checks: VerificationCheck[] = [];

    for (const pattern of patterns) {
      // Look for the check result in Claude's output
      const checkRegex = new RegExp(
        `Check \\d+.*?${pattern.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?(VERIFIED|NOT_VERIFIED)`,
        'i'
      );
      const match = claudeOutput.match(checkRegex);

      const status = match?.[1]?.toUpperCase() === 'VERIFIED' ? 'VERIFIED' : 'NOT_VERIFIED';

      // Try to find any remaining occurrences mentioned
      const findings: string[] = [];
      const locationRegex = new RegExp(`(src/[^:]+\\.tsx?):(\\d+)`, 'g');

      // Only look for findings if NOT_VERIFIED
      if (status === 'NOT_VERIFIED') {
        // Look for file:line patterns near this check's section
        const sectionRegex = new RegExp(
          `${pattern.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=Check \\d+|VERIFICATION SUMMARY|$)`,
          'i'
        );
        const sectionMatch = claudeOutput.match(sectionRegex);
        if (sectionMatch) {
          let locationMatch;
          while ((locationMatch = locationRegex.exec(sectionMatch[0])) !== null) {
            findings.push(`${locationMatch[1]}:${locationMatch[2]}`);
          }
        }
      }

      checks.push({
        instruction: pattern.description,
        pattern: pattern.pattern,
        command: `grep -rn '${pattern.pattern}' src/ --include="*.ts" --include="*.tsx"`,
        status,
        evidence: match?.[0] || 'Unable to parse verification result',
        findings: findings.length > 0 ? findings : undefined
      });
    }

    return checks;
  }

  /**
   * Run verification phase using Claude
   */
  async runVerification(
    solutionPath: string,
    packageName: string,
    fromVersion: string,
    toVersion: string,
    migrationLog: MigrationLogEntry[],
    model: string = DEFAULTS.CLAUDE_MODEL,
    runDirectory?: string,
    iteration: number = 1,
    debugReports?: boolean,
    migrationContext?: any
  ): Promise<VerificationResult> {
    logger.info('🔍 Running migration verification (iteration %d)...', iteration);

    const verificationPrompt = this.buildVerificationPrompt(
      packageName,
      fromVersion,
      toVersion,
      migrationLog,
      migrationContext
    );

    const patterns = this.getVerificationPatterns(packageName, fromVersion, toVersion, migrationContext);

    if (patterns.length === 0) {
      logger.info('PIPELINE:3:migration:verification=skipped,package=%s', packageName);
      logger.info('   → No verification patterns defined for %s', packageName);
      return {
        timestamp: new Date().toISOString(),
        packageName,
        fromVersion,
        toVersion,
        verified: 0,
        total: 0,
        allPassed: true,
        iteration,
        checks: [],
        toolCalls: []
      };
    }

    // Track all tool calls during verification
    const verificationToolCalls: VerificationToolCall[] = [];

    try {
      // Import Claude Agent SDK (supports both subscription and ANTHROPIC_API_KEY auth)
      const { claude } = await import('../adapters/claudeAgentSdkAdapter.js');

      // Execute verification with Claude - WITH TOOL TRACKING
      const sessionLabel = `verify_${packageName.replace(/[@/]/g, '_')}_iter${iteration}_${Date.now()}`;

      let claudeInstance = claude()
        .withModel(model)
        .inDirectory(solutionPath)
        .allowTools('Grep', 'Bash', 'Read')
        .withSessionId(`pantoum_${sessionLabel}`);

      if (debugReports && runDirectory) {
        claudeInstance = claudeInstance.withDebugFile(
          path.join(runDirectory, `claude_debug_${sessionLabel}.jsonl`)
        );
      }

      claudeInstance = claudeInstance.onToolUse((tool) => {
          // Capture ALL tool calls for traceability
          const toolCall: VerificationToolCall = {
            timestamp: new Date().toISOString(),
            tool: tool.name,
            input: tool.input as Record<string, any> || {}
          };
          verificationToolCalls.push(toolCall);

          // Log tool usage
          const toolEmojis: Record<string, string> = {
            'Grep': '🔍',
            'Read': '📖',
            'Bash': '🖥️'
          };
          const emoji = toolEmojis[tool.name] || '🔧';

          if (tool.name === 'Grep' && tool.input && typeof tool.input === 'object' && 'pattern' in tool.input) {
            logger.info(`   ${emoji} Verification grep: "${tool.input.pattern}"`);
          } else if (tool.name === 'Bash' && tool.input && typeof tool.input === 'object' && 'command' in tool.input) {
            const cmd = tool.input.command as string;
            if (cmd.includes('grep')) {
              logger.info(`   ${emoji} Verification bash grep: %s`, cmd.substring(0, 80));
            }
          }
        })
        .skipPermissions();

      const result = await claudeInstance.query(verificationPrompt).asText();
      const claudeOutput = typeof result === 'string' ? result : (result as any).response || '';

      // Parse verification results and enhance with grep outputs
      const checks = this.parseVerificationResultWithGrepOutput(claudeOutput, patterns, verificationToolCalls);
      const verified = checks.filter(c => c.status === 'VERIFIED').length;

      logger.info('   → Verification complete: %d/%d checks passed', verified, checks.length);
      logger.info('   → Captured %d tool calls', verificationToolCalls.length);

      // Save verification debug file for traceability
      if (runDirectory) {
        const debugPath = path.join(
          runDirectory,
          `claude_debug_verification_iter${iteration}_${Date.now()}.json`
        );
        const debugData = {
          iteration,
          timestamp: new Date().toISOString(),
          packageName,
          fromVersion,
          toVersion,
          prompt: verificationPrompt,
          claudeOutput,
          toolCalls: verificationToolCalls,
          parsedChecks: checks,
          summary: {
            verified,
            total: checks.length,
            allPassed: verified === checks.length
          }
        };
        fs.writeFileSync(debugPath, JSON.stringify(debugData, null, 2), { encoding: DEFAULTS.ENCODING as BufferEncoding, mode: 0o600 });
        logger.info('   → Debug file saved: %s', path.basename(debugPath));
      }

      return {
        timestamp: new Date().toISOString(),
        packageName,
        fromVersion,
        toVersion,
        verified,
        total: checks.length,
        allPassed: verified === checks.length,
        iteration,
        checks,
        toolCalls: verificationToolCalls
      };
    } catch (error: any) {
      logger.error('   → Verification failed: %s', error.message);

      // Save error debug file
      if (runDirectory) {
        const debugPath = path.join(
          runDirectory,
          `claude_debug_verification_error_iter${iteration}_${Date.now()}.json`
        );
        fs.writeFileSync(debugPath, JSON.stringify({
          iteration,
          timestamp: new Date().toISOString(),
          error: sanitizeErrorForLogging(error),
          toolCalls: verificationToolCalls,
          prompt: verificationPrompt
        }, null, 2), { encoding: DEFAULTS.ENCODING as BufferEncoding, mode: 0o600 });
      }

      // Return failed result with captured tool calls
      return {
        timestamp: new Date().toISOString(),
        packageName,
        fromVersion,
        toVersion,
        verified: 0,
        total: patterns.length,
        allPassed: false,
        iteration,
        checks: patterns.map(p => ({
          instruction: p.description,
          pattern: p.pattern,
          command: `grep -rn '${p.pattern}' src/`,
          status: 'NOT_VERIFIED' as const,
          evidence: `Verification error: ${error.message}`
        })),
        toolCalls: verificationToolCalls
      };
    }
  }

  /**
   * Parse verification result and enhance checks with actual grep output from tool calls
   */
  private parseVerificationResultWithGrepOutput(
    claudeOutput: string,
    patterns: { pattern: string; description: string }[],
    toolCalls: VerificationToolCall[]
  ): VerificationCheck[] {
    // Get basic parsed checks
    const checks = this.parseVerificationResult(claudeOutput, patterns);

    // Enhance each check with grep output from tool calls
    for (const check of checks) {
      // Find grep tool calls that match this pattern
      const matchingGrepCalls = toolCalls.filter(tc => {
        if (tc.tool === 'Grep' && tc.input.pattern) {
          return check.pattern.includes(tc.input.pattern) || tc.input.pattern.includes(check.pattern);
        }
        if (tc.tool === 'Bash' && tc.input.command) {
          const cmd = tc.input.command as string;
          return cmd.includes('grep') && cmd.includes(check.pattern);
        }
        return false;
      });

      // Add grep output if we found matching tool calls
      if (matchingGrepCalls.length > 0) {
        const grepCall = matchingGrepCalls[0];
        check.grepOutput = grepCall.output || `Tool call: ${grepCall.tool} with input: ${JSON.stringify(grepCall.input)}`;

        // If command wasn't set, derive it from tool call
        if (!check.command && grepCall.tool === 'Bash') {
          check.command = grepCall.input.command as string;
        } else if (!check.command && grepCall.tool === 'Grep') {
          check.command = `grep pattern="${grepCall.input.pattern}" path="${grepCall.input.path || 'src/'}"`;
        }
      }
    }

    return checks;
  }

  /**
   * Run the fix phase to address issues found during verification
   * Returns a list of fixes applied for traceability
   */
  async runFix(
    solutionPath: string,
    packageName: string,
    failedChecks: VerificationCheck[],
    model: string = DEFAULTS.CLAUDE_MODEL,
    runDirectory?: string,
    iteration: number = 1,
    debugReports?: boolean
  ): Promise<Array<{ file: string; pattern: string; action: string }>> {
    logger.info('🔧 Running fix phase for %d issues (iteration %d)...', failedChecks.length, iteration);

    const fixPrompt = this.buildFixPrompt(packageName, failedChecks);
    const fixesApplied: Array<{ file: string; pattern: string; action: string }> = [];

    try {
      // Import Claude Agent SDK (supports both subscription and ANTHROPIC_API_KEY auth)
      const { claude } = await import('../adapters/claudeAgentSdkAdapter.js');

      const sessionLabel = `fix_${packageName.replace(/[@/]/g, '_')}_iter${iteration}_${Date.now()}`;

      let claudeInstance = claude()
        .withModel(model)
        .inDirectory(solutionPath)
        .allowTools('Read', 'Edit', 'Grep', 'Write')
        .withSessionId(`pantoum_${sessionLabel}`);

      if (debugReports && runDirectory) {
        claudeInstance = claudeInstance.withDebugFile(
          path.join(runDirectory, `claude_debug_${sessionLabel}.jsonl`)
        );
      }

      claudeInstance = claudeInstance.onToolUse((tool) => {
          // Track Edit operations for fix log
          if (tool.name === 'Edit' && tool.input && typeof tool.input === 'object') {
            const input = tool.input as Record<string, any>;
            if (input.file_path) {
              // Determine which pattern this edit is for
              const matchingCheck = failedChecks.find(check =>
                input.old_string && (input.old_string as string).includes(check.pattern.replace(/\\/g, ''))
              );

              fixesApplied.push({
                file: input.file_path as string,
                pattern: matchingCheck?.pattern || 'unknown',
                action: `Edit: "${(input.old_string as string)?.substring(0, 40)}..." → "${(input.new_string as string)?.substring(0, 40)}..."`
              });

              logger.info('   ✏️ Fix applied to %s', path.basename(input.file_path as string));
            }
          }
        })
        .skipPermissions();

      await claudeInstance.query(fixPrompt).asText();

      logger.info('   → Fix phase completed: %d edits applied', fixesApplied.length);

      // Save fix debug file
      if (runDirectory) {
        const debugPath = path.join(
          runDirectory,
          `claude_debug_fix_iter${iteration}_${Date.now()}.json`
        );
        fs.writeFileSync(debugPath, JSON.stringify({
          iteration,
          timestamp: new Date().toISOString(),
          failedChecks,
          fixesApplied,
          prompt: fixPrompt
        }, null, 2), { encoding: DEFAULTS.ENCODING as BufferEncoding, mode: 0o600 });
        logger.info('   → Fix debug file saved: %s', path.basename(debugPath));
      }
    } catch (error: any) {
      logger.error('   → Fix phase failed: %s', error.message);
    }

    return fixesApplied;
  }

  /**
   * Execute migration with verification loop
   */
  async executeMigrationWithVerification(
    solutionPath: string,
    packageName: string,
    fromVersion: string,
    toVersion: string,
    migrationContext: any,
    model: string = DEFAULTS.CLAUDE_MODEL,
    runDirectory?: string,
    debugReports?: boolean,
    maxRetries?: number,
    thinkingEffort?: string
  ): Promise<{ patches: PatchObject[]; verification?: VerificationSummary }> {
    // Step 1: Run initial migration
    const patches = await this.executeMigration(
      solutionPath,
      packageName,
      fromVersion,
      toVersion,
      migrationContext,
      model,
      runDirectory,
      debugReports,
      thinkingEffort
    );

    // Check if verification is enabled
    if (!VERIFICATION_DEFAULTS.ENABLED) {
      logger.info('   → Verification disabled, skipping');
      return { patches };
    }

    // Get verification patterns (config-driven or hardcoded fallback)
    const patterns = this.getVerificationPatterns(packageName, fromVersion, toVersion, migrationContext);
    if (patterns.length === 0) {
      logger.info('PIPELINE:3:migration:verification=skipped,package=%s', packageName);
      logger.info('   → No verification patterns for %s, skipping verification', packageName);
      return { patches };
    }

    // Step 2: Verification loop
    const allResults: VerificationResult[] = [];
    let lastResult: VerificationResult | undefined;

    const maxIterations = maxRetries ?? VERIFICATION_DEFAULTS.MAX_ITERATIONS;
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      logger.info('🔍 Verification pass %d/%d...', iteration, maxIterations);

      // Run verification with tool tracking
      const result = await this.runVerification(
        solutionPath,
        packageName,
        fromVersion,
        toVersion,
        this.migrationLog,
        model,
        runDirectory,
        iteration,
        debugReports,
        migrationContext
      );
      allResults.push(result);
      lastResult = result;

      if (result.allPassed) {
        logger.info('✅ All %d verification checks passed!', result.total);
        break;
      }

      const failedChecks = result.checks.filter(c => c.status === 'NOT_VERIFIED');
      logger.warn('⚠️ %d/%d checks failed', failedChecks.length, result.total);

      // Log failed checks with grep output for traceability
      for (const check of failedChecks) {
        logger.warn('   ❌ %s', check.instruction);
        if (check.grepOutput) {
          logger.warn('      grep output: %s', check.grepOutput.substring(0, 100));
        }
        if (check.findings) {
          for (const finding of check.findings.slice(0, 3)) {
            logger.warn('      → %s', finding);
          }
          if (check.findings.length > 3) {
            logger.warn('      → ... and %d more', check.findings.length - 3);
          }
        }
      }

      // If this is the last iteration, don't try to fix
      if (iteration === maxIterations) {
        logger.error('❌ Verification failed after %d iterations', iteration);
        break;
      }

      // Run fix phase and capture fixes applied
      logger.info('🔄 Attempting to fix %d issues...', failedChecks.length);
      const fixesApplied = await this.runFix(
        solutionPath,
        packageName,
        failedChecks,
        model,
        runDirectory,
        iteration,
        debugReports
      );

      // Store fixes applied in the result for this iteration
      result.fixesApplied = fixesApplied;
    }

    // Build verification summary with all iteration data
    const summary: VerificationSummary = {
      status: lastResult?.allPassed ? 'PASSED' : 'FAILED',
      totalIterations: allResults.length,
      finalResult: lastResult!,
      allResults, // All iterations with tool calls and fixes
      ...(lastResult && !lastResult.allPassed && {
        remainingIssues: lastResult.checks
          .filter(c => c.status === 'NOT_VERIFIED')
          .map(c => ({
            pattern: c.pattern,
            locations: c.findings || []
          }))
      })
    };

    return { patches, verification: summary };
  }

  /**
   * Execute third-party package migration to fix breaking changes
   */
  async executeThirdPartyMigration(
    solutionPath: string,
    updates: ThirdPartyUpdate[],
    buildErrors: string[]
  ): Promise<PatchObject[]> {
    logger.info('🤖 Analyzing third-party update breaking changes...');
    
    // Only focus on major updates as they're most likely to cause issues
    const majorUpdates = updates.filter(u => u.updateType === 'major');
    
    if (majorUpdates.length === 0 && updates.length > 0) {
      logger.info('   → No major updates detected, errors may be unrelated to dependency updates');
    }
    
    const templateVars: TemplateVariables = {
      updatedPackagesList: updates.map(u => `- ${u.name}: ${u.currentVersion} → ${u.latestVersion} (${u.updateType} update)`).join('\n'),
      buildErrors: buildErrors.slice(0, 20).join('\n') + (buildErrors.length > 20 ? '\n... and ' + (buildErrors.length - 20) + ' more errors' : ''),
      majorUpdatesList: majorUpdates.map(u => u.name).join(', ') || 'none'
    };
    const prompt = renderTemplate('third-party-migration', templateVars);

    try {
      // Reset log
      this.migrationLog = [];
      
      // Use simple exec to invoke Claude Code
      const { execSync } = await import('child_process');
      
      // Create a temporary file with the prompt
      const tempPromptFile = path.join(solutionPath, '.claude-third-party-prompt.txt');
      fs.writeFileSync(tempPromptFile, prompt, DEFAULTS.ENCODING);
      
      logger.info('   → Invoking Claude to analyze and fix breaking changes...');
      
      // Execute Claude Code with the prompt
      // Note: This assumes Claude Code CLI is available
      try {
        execSync(`claude-code --path "${solutionPath}" --prompt-file "${tempPromptFile}" --auto-approve`, {
          cwd: solutionPath,
          stdio: 'inherit',
          timeout: TIMEOUTS.CLAUDE_MIGRATION
        });
      } catch (error) {
        logger.warn('   → Claude Code execution completed (may have encountered some issues)');
      }
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempPromptFile);
      } catch (e) {
        logger.info('   → Failed to clean up temp file %s: %s', tempPromptFile, e);
      }
      
      // Log what was changed
      logger.info('   → Claude migration completed');
      
      // Create patch objects from the migration log
      const patches: PatchObject[] = this.migrationLog
        .filter(entry => entry.action === 'edit' || entry.action === 'write')
        .map((entry, index): PatchObject => ({
          id: `third-party-claude-fix-${index}`,
          type: 'claudeActions',
          title: `Fix breaking changes from third-party updates`,
          description: entry.details || `Modified ${entry.file}`,
          file: entry.file || '',
          claudeActions: [{
            timestamp: new Date().toISOString(),
            tool: entry.action === 'edit' ? 'Edit' : 'Write',
            action: entry.action,
            target: entry.file,
            details: entry.details
          }]
        }));
      
      logger.info(`   → Generated ${patches.length} fixes for breaking changes`);
      
      return patches;
    } catch (error) {
      logger.error('Failed to execute third-party migration:', error);
      return [];
    }
  }
}