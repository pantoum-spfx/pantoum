import * as path from 'path';
import * as fs from 'fs';
import { stripAnsiCodes } from '../../utils/textUtils.js';
import { logger } from '../../utils/logger.js';
import { DEFAULT_CLAUDE_MODEL } from '../../defaults.js';
import type { SolutionReport, UpgradeOptions } from '../upgradeService/index.js';
import type { PatchRepository } from '../patchRepository.js';
import type { PatchObject } from '../../schema/patchSchema.js';

interface ReportOptions {
  reportsDir?: string;
  perSolutionReports?: boolean;
  patchRepository?: PatchRepository;
  upgradeOptions?: UpgradeOptions; // Include original upgrade options
  pantoumVersion?: string; // Pantoum version
}

export class ReportService {
  private pantoumVersion: string;

  constructor() {
    // Read version from package.json
    try {
      const currentFileUrl = new URL(import.meta.url);
      const packageJsonPath = path.join(path.dirname(currentFileUrl.pathname), '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      this.pantoumVersion = packageJson.version || '0.2.0-alpha';
    } catch {
      this.pantoumVersion = '0.2.0-alpha';
    }
  }

  /**
   * Save raw M365 CLI upgrade report
   */
  async saveRawReport(
    targetVersion: string,
    solutionName: string,
    reportJson?: string,
    options: ReportOptions = {},
    solutionPath?: string
  ): Promise<string> {
    const fileName = `pantoum_upgrade-report_${targetVersion}_${solutionName}.json`;
    
    let rawPath: string;
    if (options.perSolutionReports && solutionPath) {
      // When perSolutionReports is true, save in solution's pantoum_run folder
      const runId = options.patchRepository?.getRunId() ||
                    `${new Date().toISOString().slice(0,10).replace(/-/g,'')}_temp`;
      rawPath = path.join(solutionPath, `pantoum_run_${runId}`, fileName);
    } else if (options.patchRepository) {
      // Always use patchRepository's run directory for consistency
      const runDir = options.patchRepository.getRunDirectory();
      rawPath = path.join(runDir, fileName);
    } else {
      const baseDir = options.reportsDir || '.';
      rawPath = path.join(baseDir, fileName);
    }
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, reportJson ?? '', 'utf8');

    // Register the file if patchRepository is available
    if (options.patchRepository) {
      options.patchRepository.registerFile(rawPath);
    }

    return rawPath;
  }

  /**
   * Generate final upgrade report
   */
  async generateFinalReport(
    targetVersion: string,
    solutionReports: Record<string, SolutionReport>,
    options: ReportOptions = {}
  ): Promise<string> {
    const finalReport = {
      timestamp: new Date().toISOString(),
      targetVersion,
      runId: options.patchRepository?.getRunId(),
      solutions: solutionReports,
      summary: {
        totalSolutions: Object.keys(solutionReports).length,
        successful: Object.values(solutionReports).filter(r => this.isSolutionSuccessful(r)).length,
        skipped: Object.values(solutionReports).filter(r => r.skipped).length,
        failed: Object.values(solutionReports).filter(r => !r.skipped && !this.isSolutionSuccessful(r)).length,
        withBuildErrors: Object.values(solutionReports).filter(r =>
          r.buildErrors && r.buildErrors.length > 0
        ).length,
        totalClaudeFixAttempts: Object.values(solutionReports).reduce((sum, r) =>
          sum + (r.buildFixPatches?.length || 0), 0
        ),
        claudeFixDetails: this.generateClaudeFixSummary(solutionReports),
      },
    };

    let finalReportPath: string;
    if (options.patchRepository) {
      // Always use patchRepository's run directory for consistency
      const runDir = options.patchRepository.getRunDirectory();
      finalReportPath = path.join(runDir, `pantoum_final-report_${targetVersion}.json`);
    } else {
      const baseDir = options.reportsDir || '.';
      finalReportPath = path.join(baseDir, `pantoum_final-report_${targetVersion}.json`);
    }
    
    fs.mkdirSync(path.dirname(finalReportPath), { recursive: true });
    fs.writeFileSync(finalReportPath, JSON.stringify(finalReport, null, 2), 'utf8');

    // Register the file
    if (options.patchRepository) {
      options.patchRepository.registerFile(finalReportPath);
    }
    
    // Also save third-party updates report if any
    const hasThirdPartyUpdates = Object.values(solutionReports).some(r => r.thirdPartyUpdates);
    if (hasThirdPartyUpdates) {
      const thirdPartyReport = {
        timestamp: new Date().toISOString(),
        targetVersion,
        solutions: Object.entries(solutionReports)
          .filter(([_, report]) => report.thirdPartyUpdates)
          .map(([solutionPath, report]) => ({
            path: solutionPath,
            thirdPartyUpdates: report.thirdPartyUpdates
          }))
      };

      const thirdPartyPath = finalReportPath.replace('final-report', 'third-party-updates');
      fs.writeFileSync(thirdPartyPath, JSON.stringify(thirdPartyReport, null, 2), 'utf8');

      // Register the file
      if (options.patchRepository) {
        options.patchRepository.registerFile(thirdPartyPath);
      }

      logger.info('Third-party updates report saved to: %s', thirdPartyPath);
    }

    return finalReportPath;
  }

  /**
   * Generate error report
   */
  async generateErrorReport(
    targetVersion: string,
    error: Error,
    options: ReportOptions = {}
  ): Promise<string> {
    let errorLog: string;
    if (options.patchRepository) {
      // Always use patchRepository's run directory for consistency
      const runDir = options.patchRepository.getRunDirectory();
      errorLog = path.join(runDir, `pantoum_error_report_${targetVersion}.log`);
    } else {
      const baseDir = options.reportsDir || '.';
      errorLog = path.join(baseDir, `pantoum_error_report_${targetVersion}.log`);
    }

    fs.mkdirSync(path.dirname(errorLog), { recursive: true });
    fs.writeFileSync(errorLog, error.stack || error.message, 'utf8');

    // Register the file
    if (options.patchRepository) {
      options.patchRepository.registerFile(errorLog);
    }

    return errorLog;
  }

  /**
   * Generate simple report data
   */
  generateReportData(
    targetVersion: string,
    solutionReports: Record<string, any>
  ) {
    return {
      targetVersion,
      solutionReports,
      timestamp: new Date().toISOString(),
      summary: {
        totalSolutions: Object.keys(solutionReports).length,
        successful: Object.values(solutionReports).filter((r: any) => r.success).length,
        failed: Object.values(solutionReports).filter((r: any) => !r.success).length,
      },
    };
  }

  /**
   * Generate Claude fix summary
   */
  private generateClaudeFixSummary(solutionReports: Record<string, SolutionReport>) {
    const claudeActions: any[] = [];
    let aggregatedMetrics: any = null;

    // Extract all Claude actions from patches and aggregate metrics
    Object.entries(solutionReports).forEach(([solutionPath, report]) => {
      if (report.patches) {
        report.patches.forEach((patch: any) => {
          if (patch.type === 'claudeActions' && patch.claudeActions) {
            claudeActions.push({
              solution: path.basename(solutionPath),
              stage: patch.stage,
              actionCount: patch.claudeActions.length,
              actions: patch.claudeActions.filter((a: any) => a.tool === 'Edit' || a.tool === 'MultiEdit')
                .map((a: any) => ({
                  tool: a.tool,
                  target: path.basename(a.target || ''),
                  timestamp: a.timestamp
                }))
            });
          }
        });
      }

      // Aggregate Claude metrics if available
      if (report.claudeMetrics) {
        if (!aggregatedMetrics) {
          aggregatedMetrics = {
            tokens: {
              input: 0,
              output: 0,
              total: 0,
              cacheRead: 0,
              cacheCreation: 0
            },
            totalCost: 0,
            totalDurationMs: 0,
            totalTurns: 0,
            sessionCount: 0,
            toolUsage: new Map<string, number>()
          };
        }

        const metrics = report.claudeMetrics;
        aggregatedMetrics.tokens.input += metrics.tokens.input;
        aggregatedMetrics.tokens.output += metrics.tokens.output;
        aggregatedMetrics.tokens.total += metrics.tokens.total;
        aggregatedMetrics.tokens.cacheRead += metrics.tokens.cacheRead || 0;
        aggregatedMetrics.tokens.cacheCreation += metrics.tokens.cacheCreation || 0;
        aggregatedMetrics.totalCost += metrics.cost;
        aggregatedMetrics.totalDurationMs += metrics.performance.durationMs;
        aggregatedMetrics.totalTurns += metrics.performance.turns;
        aggregatedMetrics.sessionCount += metrics.sessions.length;

        // Aggregate tool usage
        metrics.sessions.forEach(session => {
          session.toolUsage.forEach(tool => {
            aggregatedMetrics.toolUsage.set(
              tool.name,
              (aggregatedMetrics.toolUsage.get(tool.name) || 0) + tool.count
            );
          });
        });
      }
    });

    // Convert tool usage map to array for serialization
    const toolUsageArray = aggregatedMetrics
      ? Array.from(aggregatedMetrics.toolUsage.entries() as IterableIterator<[string, number]>).map(([name, count]) => ({ name, count }))
      : [];

    return {
      totalClaudeActions: claudeActions.reduce((sum, ca) => sum + ca.actionCount, 0),
      totalEditActions: claudeActions.reduce((sum, ca) =>
        sum + ca.actions.length, 0
      ),
      fixedSolutions: claudeActions.map(ca => ca.solution).filter((v, i, a) => a.indexOf(v) === i),
      actionsByStage: {
        'build-fix': claudeActions.filter(ca => ca.stage === 'build-fix').length,
        'post-upgrade': claudeActions.filter(ca => ca.stage === 'post-upgrade').length,
      },
      details: claudeActions,
      // Include aggregated metrics if available
      ...(aggregatedMetrics && {
        metrics: {
          tokens: aggregatedMetrics.tokens,
          totalCost: aggregatedMetrics.totalCost,
          totalDurationMs: aggregatedMetrics.totalDurationMs,
          avgDurationMs: Math.round(aggregatedMetrics.totalDurationMs / aggregatedMetrics.sessionCount),
          totalTurns: aggregatedMetrics.totalTurns,
          sessionCount: aggregatedMetrics.sessionCount,
          toolUsage: toolUsageArray
        }
      })
    };
  }

  /**
   * Save per-solution metadata (non-invasive)
   */
  async savePerSolutionMetadata(
    solutionPath: string,
    solutionName: string,
    targetVersion: string,
    solutionReport: SolutionReport,
    options: ReportOptions = {},
    patchRepository?: any
  ): Promise<string> {
    // Create metadata object with all solution data
    const metadata = {
      timestamp: new Date().toISOString(),
      solutionName,
      solutionPath,
      targetVersion,
      pantoumVersion: options.pantoumVersion || this.pantoumVersion,
      upgradeOptions: options.upgradeOptions,
      report: solutionReport,
      summary: {
        totalPatches: solutionReport.patches?.length || 0,
        patchesApplied: solutionReport.applyResults?.filter(r => r.success).length || 0,
        hasM365CliError: !!solutionReport.m365CliError,
        hasBuildErrors: (solutionReport.buildErrors?.length || 0) > 0,
        buildFixAttempts: solutionReport.buildFixPatches?.length || 0,
        claudeActionsCount: this.countClaudeActions(solutionReport),
        status: this.calculateSolutionStatus(solutionReport)
      }
    };

    // Save metadata JSON - always save in run directory if available
    let metadataPath: string;
    if (patchRepository && patchRepository.getSolutionRunDirectory) {
      const runDir = patchRepository.getSolutionRunDirectory(solutionName);
      fs.mkdirSync(runDir, { recursive: true });
      metadataPath = path.join(runDir, `pantoum_metadata_${targetVersion}.json`);
    } else if (patchRepository && patchRepository.getRunDirectory) {
      const runDir = patchRepository.getRunDirectory();
      fs.mkdirSync(runDir, { recursive: true });
      metadataPath = path.join(runDir, `pantoum_metadata_${targetVersion}.json`);
    } else {
      // Fallback to solution directory only if no run directory available
      metadataPath = path.join(solutionPath, `pantoum_metadata_${targetVersion}.json`);
    }
    
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    // Register the file
    if (patchRepository && patchRepository.registerFile) {
      patchRepository.registerFile(metadataPath);
    }

    return metadataPath;
  }

  /**
   * Generate per-solution markdown report from metadata (non-invasive)
   */
  async generatePerSolutionMarkdownReport(
    solutionPath: string,
    solutionName: string,
    targetVersion: string,
    patchRepository?: any
  ): Promise<string> {
    // Read the metadata JSON - check run directory first, then fallback to solution directory
    let metadataPath: string;

    if (patchRepository && patchRepository.getSolutionRunDirectory) {
      const runDir = patchRepository.getSolutionRunDirectory(solutionName);
      metadataPath = path.join(runDir, `pantoum_metadata_${targetVersion}.json`);
    } else if (patchRepository && patchRepository.getRunDirectory) {
      const runDir = patchRepository.getRunDirectory();
      metadataPath = path.join(runDir, `pantoum_metadata_${targetVersion}.json`);
    } else {
      // Fallback to solution directory for backward compatibility
      metadataPath = path.join(solutionPath, `pantoum_metadata_${targetVersion}.json`);
    }

    // For backward compatibility, check solution directory if not found in run directory
    if (!fs.existsSync(metadataPath)) {
      const solutionMetadataPath = path.join(solutionPath, `pantoum_metadata_${targetVersion}.json`);
      if (fs.existsSync(solutionMetadataPath)) {
        metadataPath = solutionMetadataPath;
      }
    }
    
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Metadata not found at ${metadataPath}`);
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const { solutionName: metaSolutionName, report, summary, upgradeOptions, pantoumVersion, timestamp } = metadata;
    
    // Build markdown report
    let markdown = `# SPFx Upgrade Report - ${metaSolutionName}\n\n`;
    markdown += `## Summary\n`;
    markdown += `- **Solution**: ${metaSolutionName}\n`;
    markdown += `- **Target Version**: ${targetVersion}\n`;
    markdown += `- **Date**: ${timestamp}\n`;
    markdown += `- **Pantoum Version**: ${pantoumVersion}\n`;
    markdown += `- **Status**: ${summary.status}\n\n`;
    
    // Command used
    if (upgradeOptions) {
      markdown += `## Command Used\n`;
      markdown += '```bash\n';
      markdown += this.buildCommandString(upgradeOptions);
      markdown += '\n```\n\n';
    }
    
    // Patches section
    if (report.patches && report.patches.length > 0) {
      const m365Patches = report.patches.filter((p: PatchObject) => !p.stage || p.stage === 'upgrade');
      const manualPatches = report.patches.filter((p: PatchObject) => p.stage && p.stage !== 'upgrade' && (p as any).type !== 'claudeActions');
      const claudePatches = report.patches.filter((p: any) => p.type === 'claudeActions');
      
      // Also check buildFixPatches for Claude actions
      const claudeBuildFixPatches = report.buildFixPatches?.filter((p: any) => p.type === 'claudeActions') || [];
      const allClaudePatches = [...claudePatches, ...claudeBuildFixPatches];
      
      const totalPatches = report.patches.length + (report.buildFixPatches?.length || 0);
      markdown += `## Patches Applied (${totalPatches} total)\n\n`;
      
      if (m365Patches.length > 0) {
        markdown += `### M365 CLI Patches (${m365Patches.length})\n\n`;
        m365Patches.forEach((patch: PatchObject) => {
          markdown += this.formatPatchMarkdown(patch);
        });
      }
      
      if (manualPatches.length > 0) {
        markdown += `### Manual Configuration Patches (${manualPatches.length})\n\n`;
        manualPatches.forEach((patch: PatchObject) => {
          markdown += this.formatPatchMarkdown(patch);
        });
      }
      
      if (allClaudePatches.length > 0) {
        markdown += `### AI Fixes Applied (${allClaudePatches.length})\n\n`;
        allClaudePatches.forEach((patch: any, index: number) => {
          markdown += this.formatClaudePatchMarkdown(patch, index + 1);
        });

        // Add aggregated metrics summary if available
        const metricsPatches = allClaudePatches.filter((p: any) => p.claudeMetrics);
        if (metricsPatches.length > 0) {
          let totalTokens = { input: 0, output: 0, total: 0, cacheRead: 0 };
          let totalCost = 0;
          let totalDuration = 0;
          let totalTurns = 0;

          metricsPatches.forEach((patch: any) => {
            const m = patch.claudeMetrics;
            totalTokens.input += m.tokens.input;
            totalTokens.output += m.tokens.output;
            totalTokens.total += m.tokens.total;
            totalTokens.cacheRead += m.tokens.cacheRead || 0;
            totalCost += m.cost;
            totalDuration += m.performance.durationMs;
            totalTurns += m.performance.turns;
          });

          markdown += `### 📊 Total AI Usage Metrics\n\n`;
          markdown += `- **Total Tokens**: ${totalTokens.input.toLocaleString()} input / ${totalTokens.output.toLocaleString()} output (${totalTokens.total.toLocaleString()} total)`;
          if (totalTokens.cacheRead > 0) {
            markdown += ` • Cache: ${totalTokens.cacheRead.toLocaleString()} read`;
          }
          markdown += `\n`;
          markdown += `- **Total Cost**: $${totalCost.toFixed(4)}\n`;
          markdown += `- **Total Duration**: ${(totalDuration / 1000).toFixed(1)} seconds\n`;
          markdown += `- **Total Turns**: ${totalTurns}\n`;
          markdown += `- **Efficiency**: ${(totalTokens.total / totalTurns).toFixed(0)} tokens/turn • $${(totalCost / metricsPatches.length).toFixed(4)}/fix\n\n`;
        }
      }
    }
    
    // Build verification
    if (report.buildErrors !== undefined) {
      markdown += `## Build Verification\n`;
      if (report.buildErrors.length === 0) {
        markdown += `- **Status**: ✅ All build steps pass\n\n`;
      } else {
        markdown += `- **Status**: ❌ ${report.buildErrors.length} errors\n\n`;
      }
    }
    
    // Third-party dependency updates
    if (report.thirdPartyUpdates) {
      markdown += `## Third-Party Dependency Updates\n\n`;
      const tpu = report.thirdPartyUpdates;

      markdown += `**Analysis**: ${tpu.eligiblePackages} of ${tpu.totalPackages} packages eligible for updates\n\n`;

      if (tpu.updates.length > 0) {
        markdown += `### Applied Updates\n\n`;
        markdown += `| Package | Type | From | To | Status |\n`;
        markdown += `|---------|------|------|----|--------|\n`;
        tpu.updates.forEach((update: any) => {
          markdown += `| ${update.name} | ${update.isDevDependency ? 'devDep' : 'dep'} | ${update.currentVersion} | ${update.latestVersion} | ✅ Updated |\n`;
        });
        markdown += `\n`;
      }

      if (tpu.skipped.length > 0) {
        markdown += `### Skipped Updates\n\n`;
        markdown += `| Package | Available | Reason |\n`;
        markdown += `|---------|-----------|--------|\n`;
        tpu.skipped.forEach((update: any) => {
          markdown += `| ${update.name} | ${update.latestVersion} | ${update.skipReason || 'Strategy limit'} |\n`;
        });
        markdown += `\n`;
      }

      if (tpu.buildErrors && tpu.buildErrors.length > 0) {
        markdown += `### Build Results\n`;
        markdown += `- Initial build after updates: ❌ Failed\n`;
        if (tpu.claudeFixes && tpu.claudeFixes.length > 0) {
          markdown += `- Claude fixes applied: ${tpu.claudeFixes.length}\n`;
        }
        markdown += `- Final build status: ${tpu.finalBuildSuccess ? '✅ Passed' : '❌ Failed'}\n`;

        if (!tpu.finalBuildSuccess) {
          markdown += `\n⚠️ **Manual intervention required** - some issues could not be automatically resolved\n`;
        }
        markdown += `\n`;
      } else if (tpu.updates.length > 0) {
        markdown += `### Build Results\n`;
        markdown += `- Build after updates: ✅ All tests pass\n\n`;
      }
    }

    // Configuration  
    if (upgradeOptions?.manualConfig) {
      markdown += `## Configuration\n`;
      markdown += `- **Patch File**: ${path.basename(upgradeOptions.manualConfig)}\n\n`;
    }
    
    // Save markdown report - always in pantoum_run folder if available
    let markdownPath: string;
    if (patchRepository && patchRepository.getSolutionRunDirectory) {
      const runDir = patchRepository.getSolutionRunDirectory(solutionName);
      markdownPath = path.join(runDir, `Pantoum_Upgrade_Report_${targetVersion}.md`);
    } else if (patchRepository && patchRepository.getRunDirectory) {
      const runDir = patchRepository.getRunDirectory();
      markdownPath = path.join(runDir, `Pantoum_Upgrade_Report_${targetVersion}.md`);
    } else {
      // Fallback to solution directory
      markdownPath = path.join(solutionPath, `Pantoum_Upgrade_Report_${targetVersion}.md`);
    }
    
    fs.writeFileSync(markdownPath, markdown, 'utf8');

    // Register the file
    if (patchRepository && patchRepository.registerFile) {
      patchRepository.registerFile(markdownPath);
    }

    return markdownPath;
  }

  /**
   * Is a solution successful? Build status is the ultimate arbiter:
   * if the build succeeded, the solution is successful even if M365 CLI
   * emitted warnings that Claude subsequently rescued.
   */
  private isSolutionSuccessful(report: SolutionReport): boolean {
    if (report.skipped) return false;
    if (report.error) return false;
    const hasBuildErrors = !!(report.buildErrors && report.buildErrors.length > 0);
    return !hasBuildErrors;
  }

  /**
   * Calculate solution status
   */
  private calculateSolutionStatus(report: SolutionReport): string {
    // Check if skipped (already at target version)
    if (report.skipped) {
      return '⏭️ Skipped (already at target)';
    }

    // First check if there's a general error (exception during processing)
    if (report.error) {
      return '❌ Failed';
    }

    if (this.isSolutionSuccessful(report)) {
      // Build succeeded
      if (report.m365CliError) {
        // M365 CLI had errors but solution still built successfully
        return '✅ Success (M365 CLI had warnings)';
      }
      return '✅ Success';
    }

    // Build failed
    if (report.buildFixPatches && report.buildFixPatches.length > 0) {
      // Claude tried to fix but build still failed
      return '❌ Failed (with AI fixes)';
    }
    if (report.m365CliError) {
      // Both M365 CLI and build failed
      return '❌ Failed (M365 CLI error + build errors)';
    }
    return '❌ Failed (build errors)';
  }

  /**
   * Count Claude actions in report
   */
  private countClaudeActions(report: SolutionReport): number {
    let count = 0;
    
    // Count Claude actions in main patches array
    report.patches?.forEach((patch: any) => {
      if (patch.type === 'claudeActions' && patch.claudeActions) {
        count += patch.claudeActions.length;
      }
    });
    
    // Count Claude actions in buildFixPatches array
    report.buildFixPatches?.forEach((patch: any) => {
      if (patch.type === 'claudeActions' && patch.claudeActions) {
        count += patch.claudeActions.length;
      }
    });
    
    return count;
  }

  /**
   * Build command string from options
   */
  private buildCommandString(upgradeOptions: any): string {
    const commandParts = ['pantoum'];
    if (upgradeOptions.localPath) commandParts.push(`--local-path ${upgradeOptions.localPath}`);
    if (upgradeOptions.repoUrl) commandParts.push(`--repoUrl ${upgradeOptions.repoUrl}`);
    commandParts.push(`--toVersion ${upgradeOptions.targetVersion}`);
    if (upgradeOptions.excludePatchIds?.length) {
      commandParts.push(`--excludePatchIds ${upgradeOptions.excludePatchIds.join(',')}`);
    }
    if (upgradeOptions.flags?.onSingleSolutionFail !== 'halt') {
      commandParts.push(`--onSingleSolutionFail ${upgradeOptions.flags.onSingleSolutionFail}`);
    }
    if (upgradeOptions.outputOptions?.perSolutionReports) {
      commandParts.push('--perSolutionReports true');
    }
    if (upgradeOptions.flags?.aiFixM365Errors) {
      commandParts.push('--aiFixM365Errors true');
    }
    if (upgradeOptions.flags?.aiFixBuildErrors) {
      commandParts.push('--aiFixBuildErrors true');
    }
    return commandParts.join(' \\\\\n  ');
  }

  /**
   * Format patch as markdown
   */
  private formatPatchMarkdown(patch: PatchObject): string {
    let md = `#### ${patch.id}: ${patch.title || patch.description}\n`;
    md += `- **Description**: ${patch.description}\n`;
    
    if (patch.type === 'updateDependency' || patch.type === 'removeDependency') {
      const p = patch as any;
      md += `- **Type**: ${patch.type}\n`;
      md += `- **Package**: ${p.packageName || p.package}\n`;
      if (p.newVersion) md += `- **New Version**: ${p.newVersion}\n`;
      if (p.dependencyType) md += `- **Dependency Type**: ${p.dependencyType}\n`;
    } else if (patch.type === 'updateJsonSnippet') {
      const p = patch as any;
      md += `- **Type**: ${patch.type}\n`;
      md += `- **File**: ${p.file}\n`;
      md += `- **Changes**: ${JSON.stringify(p.jsonSnippet, null, 2)}\n`;
    } else if (patch.type === 'runShellCommand') {
      const p = patch as any;
      md += `- **Type**: ${patch.type}\n`;
      md += `- **Command**: \`${p.command}\`\n`;
    }
    
    md += '\n';
    return md;
  }

  /**
   * Format Claude patch as markdown
   */
  private formatClaudePatchMarkdown(patch: any, index: number): string {
    let md = `#### ${index}. ${patch.stage === 'build-fix' ? 'Build Error Fix' : 'Upgrade Error Fix'}\n`;
    md += `- **${patch.description}**\n`;

    // If Claude provided a summary, show it first
    if (patch.claudeSummary) {
      md += `\n**Summary:**\n${patch.claudeSummary}\n`;
    }

    // Add metrics if available
    if (patch.claudeMetrics) {
      const metrics = patch.claudeMetrics;
      md += `\n**📊 AI Metrics:**\n`;
      md += `- **Tokens**: ${metrics.tokens.input.toLocaleString()} input / ${metrics.tokens.output.toLocaleString()} output (Total: ${metrics.tokens.total.toLocaleString()})`;
      if (metrics.tokens.cacheRead) {
        md += ` • Cache: ${metrics.tokens.cacheRead.toLocaleString()} read`;
      }
      md += `\n`;
      md += `- **Cost**: $${metrics.cost.toFixed(4)}\n`;
      md += `- **Performance**: ${(metrics.performance.durationMs / 1000).toFixed(1)}s • ${metrics.performance.turns} turn${metrics.performance.turns !== 1 ? 's' : ''}\n`;

      // Show tool usage if available
      if (metrics.toolUsage && metrics.toolUsage.length > 0) {
        // Count tool usage by name (toolUsage is an array of individual tool calls)
        const toolCounts = new Map<string, number>();
        metrics.toolUsage.forEach((t: any) => {
          if (['Read', 'Edit', 'MultiEdit', 'Bash'].includes(t.name)) {
            toolCounts.set(t.name, (toolCounts.get(t.name) || 0) + 1);
          }
        });

        if (toolCounts.size > 0) {
          const toolSummary = Array.from(toolCounts.entries())
            .map(([name, count]) => `${name}: ${count}`)
            .join(' • ');
          md += `- **Tools Used**: ${toolSummary}\n`;
        }
      } else if (metrics.sessions && metrics.sessions.length > 0) {
        // Fallback: aggregate tool usage from sessions if available
        const toolMap = new Map<string, number>();
        metrics.sessions.forEach((session: any) => {
          if (session.toolUsage) {
            session.toolUsage.forEach((tool: any) => {
              // Check if it's a count object or individual call
              const count = tool.count || 1;
              toolMap.set(tool.name, (toolMap.get(tool.name) || 0) + count);
            });
          }
        });

        if (toolMap.size > 0) {
          const toolSummary = Array.from(toolMap.entries())
            .filter(([name]) => ['Read', 'Edit', 'MultiEdit', 'Bash'].includes(name))
            .map(([name, count]) => `${name}: ${count}`)
            .join(' • ');
          if (toolSummary) {
            md += `- **Tools Used**: ${toolSummary}\n`;
          }
        }
      }
    }
    
    // Otherwise fall back to the original analysis
    // Extract specific errors that were fixed from the error prompt
    const errorsSummary = this.extractErrorsSummary(patch.errorPrompt);
    if (errorsSummary.length > 0) {
      md += `- **Errors Fixed:**\n`;
      errorsSummary.forEach(error => {
        md += `  - ${error}\n`;
      });
    }
    
    if (patch.claudeActions && patch.claudeActions.length > 0) {
      // Group actions by type
      const readActions = patch.claudeActions.filter((a: any) => a.tool === 'Read');
      const editActions = patch.claudeActions.filter((a: any) => a.tool === 'Edit' || a.tool === 'MultiEdit');
      const bashActions = patch.claudeActions.filter((a: any) => a.tool === 'Bash');
      // Show what files were examined
      if (readActions.length > 0) {
        md += `\n- **Files Examined (${readActions.length}):**\n`;
        const uniqueFiles = [...new Set(readActions.map((a: any) => path.basename(a.target || 'unknown')))];
        uniqueFiles.forEach((fileName) => {
          md += `  - ${fileName}\n`;
        });
      }
      
      // Group files for summary
      let fileGroups: Record<string, any[]> = {};
      
      // Show detailed list of all individual edits
      if (editActions.length > 0) {
        // Group by file for better organization
        editActions.forEach((action: any) => {
          const file = action.target || 'unknown';
          if (!fileGroups[file]) fileGroups[file] = [];
          fileGroups[file].push(action);
        });
        
        const fileCount = Object.keys(fileGroups).length;
        const changeCount = editActions.length;
        
        md += `\n**Detailed Changes (${fileCount} files, ${changeCount} individual edits):**\n\n`;
        
        // Sort files by number of changes (most changes first)
        const sortedFiles = Object.entries(fileGroups).sort((a, b) => b[1].length - a[1].length);
        
        sortedFiles.forEach(([file, actions]) => {
          const fileName = path.basename(file);
          
          // Check if this file has MultiEdit operations (case-insensitive)
          const hasMultiEdit = actions.some((a: any) => (a.tool || '').toLowerCase() === 'multiedit');
          
          if (hasMultiEdit) {
            // For MultiEdit, show all changes in one block
            md += `**${fileName}:**\n\n`;
            actions.forEach((action: any) => {
              const fixDescription = this.getFixDescriptionForAction(action, patch.errorPrompt, fileName);
              md += `\`\`\`diff\n${fixDescription}\n\`\`\`\n\n`;
            });
          } else {
            // Regular format for individual edits
            md += `**${fileName} (${actions.length} changes):**\n\n`;
            
            // Show each change as a simple diff
            actions.forEach((action: any, actionIndex: number) => {
              const fixDescription = this.getFixDescriptionForAction(action, patch.errorPrompt, fileName);
              
              // Format as a code block if it contains newlines (multi-line diff)
              if (fixDescription.includes('\n')) {
                md += `${actionIndex + 1}. \n\`\`\`diff\n${fixDescription}\n\`\`\`\n\n`;
              } else {
                // Single line change
                md += `${actionIndex + 1}. \`${fixDescription}\`\n`;
              }
            });
          }
          md += '\n';
        });
      }
      
      // Show build verification steps (filter out internal Claude search commands)
      const filteredBashActions = bashActions.filter((action: any) => {
        const command = action.target || action.details || '';
        // Filter out internal Claude search/exploration commands
        return !command.includes('find node_modules') && 
               !command.includes('xargs grep') &&
               !command.includes('grep -l') &&
               !command.includes('head -') &&
               !command.match(/grep\s+-[A-Z]+\d*\s+-[A-Z]+\d*/); // grep with multiple flags
      });
      
      if (filteredBashActions.length > 0) {
        md += `- **Build Verification Steps:**\n`;
        let buildAttemptCount = 0;
        filteredBashActions.forEach((action: any, actionIndex: number) => {
          const command = action.target || action.details || 'unknown command';
          if (command.includes('gulp build')) {
            buildAttemptCount++;
            const isLastBuild = actionIndex === filteredBashActions.length - 1 || 
              !filteredBashActions.slice(actionIndex + 1).some((a: any) => 
                (a.target || a.details || '').includes('gulp build'));
            
            if (buildAttemptCount === 1) {
              md += `  - Initial SPFx build to identify errors\n`;
            } else if (isLastBuild) {
              md += `  - Final build verification after all fixes applied\n`;
            } else {
              md += `  - Build attempt #${buildAttemptCount} to check remaining errors\n`;
            }
          } else if (command.includes('npm install')) {
            md += `  - Installed dependencies\n`;
          } else if (command.includes('npm run')) {
            const scriptName = command.match(/npm run (\S+)/)?.[1] || 'script';
            md += `  - Ran npm script: ${scriptName}\n`;
          } else if (command.includes('npm')) {
            md += `  - ${command}\n`;
          } else {
            md += `  - Executed: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}\n`;
          }
        });
      }
      
      // Summary of what was accomplished
      if (editActions.length > 0) {
        md += `- **Result**: Successfully fixed ${editActions.length} issue${editActions.length !== 1 ? 's' : ''} across ${Object.keys(fileGroups).length} file${Object.keys(fileGroups).length !== 1 ? 's' : ''}\n`;
      } else if (patch.claudeActions && patch.claudeActions.length > 0) {
        md += `- **Result**: Analyzed the codebase and verified the build\n`;
      }
    }

    // Show verification results if available (from Claude Self-Verification)
    if (patch.migrationDetails?.verification) {
      const v = patch.migrationDetails.verification;
      md += `\n**🔍 Migration Verification:**\n`;
      md += `- **Status**: ${v.status === 'PASSED' ? '✅ PASSED' : '⚠️ FAILED'}\n`;
      md += `- **Checks**: ${v.passedChecks}/${v.totalChecks} passed\n`;
      md += `- **Total Iterations**: ${v.totalIterations}\n\n`;

      // TRACEABLE: Show per-iteration details with grep output and fixes
      if (v.iterations && v.iterations.length > 0) {
        v.iterations.forEach((iter: any, iterIndex: number) => {
          md += `#### Iteration ${iter.iteration || (iterIndex + 1)}${iter.allPassed ? ' ✅' : ' ❌'}\n\n`;

          // Show verification checks table for this iteration
          if (iter.checks && iter.checks.length > 0) {
            md += `| Pattern | Command | Result | Findings |\n`;
            md += `|---------|---------|--------|----------|\n`;
            iter.checks.forEach((check: any) => {
              const statusIcon = check.status === 'VERIFIED' ? '✅ Clean' : '❌ FOUND';
              const command = check.command ? `\`${check.command.substring(0, 40)}...\`` : '-';
              const findings = check.findings && check.findings.length > 0
                ? check.findings.slice(0, 2).map((f: string) => `\`${f}\``).join(', ') + (check.findings.length > 2 ? ` +${check.findings.length - 2}` : '')
                : '-';
              md += `| \`${check.pattern}\` | ${command} | ${statusIcon} | ${findings} |\n`;
            });
            md += `\n`;
          }

          // Show grep output evidence (if available)
          const checksWithGrepOutput = iter.checks?.filter((c: any) => c.grepOutput && c.grepOutput.length > 0) || [];
          if (checksWithGrepOutput.length > 0) {
            md += `<details>\n<summary>📋 Grep Output Evidence (${checksWithGrepOutput.length} commands)</summary>\n\n`;
            checksWithGrepOutput.forEach((check: any) => {
              md += `**${check.instruction}:**\n`;
              md += `\`\`\`\n${check.grepOutput.substring(0, 500)}${check.grepOutput.length > 500 ? '\n...(truncated)' : ''}\n\`\`\`\n\n`;
            });
            md += `</details>\n\n`;
          }

          // Show tool calls for this iteration
          if (iter.toolCalls && iter.toolCalls.length > 0) {
            const grepCalls = iter.toolCalls.filter((tc: any) =>
              tc.tool === 'Grep' || (tc.tool === 'Bash' && tc.input?.command?.includes('grep'))
            );
            if (grepCalls.length > 0) {
              md += `<details>\n<summary>🔍 Tool Calls (${grepCalls.length} grep commands)</summary>\n\n`;
              grepCalls.forEach((tc: any, tcIndex: number) => {
                const input = tc.tool === 'Bash' ? tc.input?.command : tc.input?.pattern;
                md += `${tcIndex + 1}. \`${tc.tool}\`: ${input?.substring(0, 60) || 'N/A'}${input && input.length > 60 ? '...' : ''}\n`;
              });
              md += `\n</details>\n\n`;
            }
          }

          // Show fixes applied after this iteration (if not last iteration)
          if (iter.fixesApplied && iter.fixesApplied.length > 0) {
            md += `**Fixes Applied After Iteration ${iter.iteration || (iterIndex + 1)}:**\n`;
            iter.fixesApplied.forEach((fix: any) => {
              md += `- \`${path.basename(fix.file)}\`: ${fix.action}\n`;
            });
            md += `\n`;
          }
        });
      } else {
        // Fallback to old format if iterations not available
        if (v.checks && v.checks.length > 0) {
          md += `**Verification Checks:**\n`;
          v.checks.forEach((check: any) => {
            const icon = check.status === 'VERIFIED' ? '✅' : '❌';
            md += `- ${icon} ${check.instruction}\n`;
            if (check.status === 'NOT_VERIFIED' && check.findings && check.findings.length > 0) {
              check.findings.slice(0, 3).forEach((finding: string) => {
                md += `  - Remaining: \`${finding}\`\n`;
              });
              if (check.findings.length > 3) {
                md += `  - ... and ${check.findings.length - 3} more\n`;
              }
            }
          });
        }
      }

      if (v.status === 'FAILED' && v.remainingIssues && v.remainingIssues.length > 0) {
        md += `\n**⚠️ Remaining Issues (manual review required):**\n`;
        v.remainingIssues.forEach((issue: any) => {
          md += `- Pattern \`${issue.pattern}\`: ${issue.locations.length} occurrence${issue.locations.length !== 1 ? 's' : ''}\n`;
          issue.locations.slice(0, 5).forEach((loc: string) => {
            md += `  - \`${loc}\`\n`;
          });
          if (issue.locations.length > 5) {
            md += `  - ... and ${issue.locations.length - 5} more\n`;
          }
        });
      }
    }

    md += '\n';
    return md;
  }

  /**
   * Generate comprehensive markdown upgrade report
   */
  async generateMarkdownReport(
    targetVersion: string,
    solutionReports: Record<string, SolutionReport>,
    options: ReportOptions = {}
  ): Promise<string> {
    const { upgradeOptions, pantoumVersion = this.pantoumVersion } = options;
    const runId = options.patchRepository?.getRunId() || 'unknown';
    const runDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Calculate summary statistics
    const totalSolutions = Object.keys(solutionReports).length;
    const skippedSolutions = Object.values(solutionReports).filter(r => r.skipped).length;
    const successfulSolutions = Object.values(solutionReports).filter(r => this.isSolutionSuccessful(r)).length;

    const solutionsWithWarnings = Object.values(solutionReports).filter(r =>
      this.isSolutionSuccessful(r) && r.buildFixPatches && r.buildFixPatches.length > 0
    ).length;
    
    // Build command line representation
    const commandParts = ['pantoum'];
    if (upgradeOptions) {
      if (upgradeOptions.localPath) commandParts.push(`--local-path ${upgradeOptions.localPath}`);
      commandParts.push(`--toVersion ${upgradeOptions.targetVersion}`);
      if (upgradeOptions.excludePatchIds?.length) commandParts.push(`--excludePatchIds ${upgradeOptions.excludePatchIds.join(',')}`);
      if (upgradeOptions.flags.onSingleSolutionFail !== 'halt') commandParts.push(`--onSingleSolutionFail ${upgradeOptions.flags.onSingleSolutionFail}`);
      if (upgradeOptions.outputOptions?.perSolutionReports) commandParts.push('--perSolutionReports true');
      if (upgradeOptions.flags.aiFixM365Errors) commandParts.push('--aiFixM365Errors true');
      if (upgradeOptions.flags.aiFixBuildErrors) commandParts.push('--aiFixBuildErrors true');
      if (upgradeOptions.flags.claudeModel !== DEFAULT_CLAUDE_MODEL) commandParts.push(`--agentModel ${upgradeOptions.flags.claudeModel}`);
    }
    
    // Start building markdown
    let markdown = `# SPFx Upgrade Report

## Metadata
- **Pantoum Version**: ${pantoumVersion}
- **Run Date**: ${runDate}
- **Run ID**: ${runId}

## Command Used
\`\`\`bash
${commandParts.join(' \\\n  ')}
\`\`\`

## Upgrade Summary
- **Target SPFx Version**: ${targetVersion}
- **Total Solutions**: ${totalSolutions}
- **Status**: ${
      successfulSolutions + skippedSolutions === totalSolutions ? '✅ All succeeded' :
      successfulSolutions === 0 && skippedSolutions === 0 ? '❌ All failed' :
      `⚠️ ${successfulSolutions}/${totalSolutions} succeeded`
    }${skippedSolutions > 0 ? ` (${skippedSolutions} skipped - already at target)` : ''}${solutionsWithWarnings > 0 ? ` (${solutionsWithWarnings} with AI fixes)` : ''}

## Solutions Processed
`;

    // Process each solution
    Object.entries(solutionReports).forEach(([solutionPath, report]) => {
      const solutionName = path.basename(solutionPath);
      const wasSkipped = report.skipped;
      const status = this.isSolutionSuccessful(report);
      const hadClaudeFixes = (report.buildFixPatches && report.buildFixPatches.length > 0) ||
        (report.patches && report.patches.some((p: any) => p.type === 'claudeActions'));

      // Check if Graph permissions were added
      const graphPermissionsPatch = report.patches?.find((p: any) =>
        p.id === 'M000007' || // Our Graph permissions manual step
        (p.description && p.description.includes('Graph API permissions'))
      );

      // Determine status text
      let statusText: string;
      if (wasSkipped) {
        statusText = `⏭️ Skipped (${report.skipReason || 'already at target'})`;
      } else if (status) {
        statusText = '✅ Upgraded successfully' + (hadClaudeFixes ? ' (with AI fixes)' : '');
      } else {
        statusText = '❌ Failed' + (hadClaudeFixes ? ' (with AI fixes)' : '');
      }

      markdown += `
### 📦 ${solutionName}
- **Status**: ${statusText}
`;

      // Show Graph permissions requirement if applicable
      if (graphPermissionsPatch) {
        markdown += `- **⚠️ Admin Action Required**: Graph API permissions need approval in SharePoint Admin Center\n`;
      }
      
      // Show errors if any
      if (report.error) {
        markdown += `- **Error**: ${report.error}\n`;
      }
      if (report.m365CliError) {
        markdown += `- **M365 CLI Error**: ${report.m365CliError}\n`;
      }

      // Show patches applied
      const totalPatches = report.patches?.length || 0;
      if (totalPatches > 0) {
        const m365Patches = report.patches?.filter((p: any) => p.id.startsWith('FN')).length || 0;
        const manualPatches = report.patches?.filter((p: any) => p.id.startsWith('M')).length || 0;
        const claudePatches = report.patches?.filter((p: any) => p.type === 'claudeActions').length || 0;
        
        markdown += `
#### Patches Applied (${totalPatches} total)
`;
        if (m365Patches > 0) markdown += `- ✅ ${m365Patches} M365 CLI patches\n`;
        if (manualPatches > 0) markdown += `- ✅ ${manualPatches} Manual patches\n`;
        if (claudePatches > 0) markdown += `- 🤖 ${claudePatches} AI fix sessions\n`;
      }

      // Show Claude fixes details
      const claudeActionPatches = report.patches?.filter((p: any) => p.type === 'claudeActions') || [];
      if (claudeActionPatches.length > 0) {
        markdown += `
#### AI Fixes Applied
`;
        claudeActionPatches.forEach((patch: any, index: number) => {
          const editActions = patch.claudeActions?.filter((a: any) => a.tool === 'Edit') || [];
          markdown += `${index + 1}. **${patch.stage === 'build-fix' ? 'M365 CLI Error Fix' : 'Build Error Fix'}**\n`;
          editActions.forEach((action: any) => {
            const fileName = path.basename(action.target || 'unknown');
            markdown += `   - Fixed: ${fileName}\n`;
            if (action.details) {
              markdown += `   - ${action.details}\n`;
            }
          });
        });
      }

      // Show Claude Agent SDK Metrics if available
      if (report.claudeMetrics) {
        const metrics = report.claudeMetrics;
        markdown += `
#### 📊 AI Performance Metrics
- **Tokens**: ${metrics.tokens.input.toLocaleString()} input / ${metrics.tokens.output.toLocaleString()} output (Total: ${metrics.tokens.total.toLocaleString()})`;

        if (metrics.tokens.cacheRead) {
          markdown += `\n- **Cache Usage**: ${metrics.tokens.cacheRead.toLocaleString()} tokens from cache`;
        }

        markdown += `
- **Cost**: $${metrics.cost.toFixed(4)} USD
- **Performance**: ${(metrics.performance.durationMs / 1000).toFixed(1)}s total (${metrics.performance.turns} turn${metrics.performance.turns !== 1 ? 's' : ''})`;

        if (metrics.sessions && metrics.sessions.length > 0) {
          markdown += `\n- **Sessions**: ${metrics.sessions.length} AI session${metrics.sessions.length !== 1 ? 's' : ''}`;

          // Aggregate tool usage across sessions
          const toolUsageMap = new Map<string, number>();
          metrics.sessions.forEach(session => {
            session.toolUsage.forEach(tool => {
              toolUsageMap.set(tool.name, (toolUsageMap.get(tool.name) || 0) + tool.count);
            });
          });

          if (toolUsageMap.size > 0) {
            markdown += '\n- **Tool Usage**:';
            Array.from(toolUsageMap.entries()).forEach(([tool, count]) => {
              markdown += `\n  - ${tool}: ${count} time${count !== 1 ? 's' : ''}`;
            });
          }
        }
      }

      // Show build status
      if (report.buildErrors && report.buildErrors.length > 0) {
        markdown += `
#### Build Status
- **Initial**: ❌ Failed (${report.buildErrors.length} errors)
- **After AI fixes**: ${report.buildErrors.length === 0 ? '✅ Success' : '❌ Still failing'}
`;
      } else if (hadClaudeFixes) {
        markdown += `
#### Build Status
- ✅ Build passing after AI fixes
`;
      }

    });

    // Check if any solutions need Graph permissions
    const solutionsNeedingGraphPermissions = Object.entries(solutionReports).filter(([_, report]) => 
      report.patches?.some((p: any) => 
        p.id === 'M000007' || 
        (p.description && p.description.includes('Graph API permissions'))
      )
    );
    
    // Add admin actions section if needed
    if (solutionsNeedingGraphPermissions.length > 0) {
      markdown += `
## ⚠️ ADMIN ACTIONS REQUIRED

### Graph API Permissions
The following solutions require Graph API permissions to be approved in SharePoint Admin Center:

${solutionsNeedingGraphPermissions.map(([solutionPath, _]) => 
  `- ${path.basename(solutionPath)}`
).join('\n')}

#### Steps to Approve Permissions:
1. Deploy each solution to the app catalog
2. Navigate to SharePoint Admin Center
3. Go to **Advanced** → **API access**
4. Find **"TermStore.Read.All"** for **"Microsoft Graph"**
5. Click **Approve**
6. Wait 5-10 minutes for permissions to propagate

> **Note**: Without these permissions, Graph API calls (particularly termStore operations) will fail with 403 errors.
`;
    }
    
    // Add detailed reports section
    const jsonReportName = `pantoum_final-report_${targetVersion}.json`;
    markdown += `
## Detailed Reports
- [📊 Full JSON Report](./${jsonReportName})
- [📁 Run Directory](./pantoum_run_${runId}/)
`;

    // Add configuration section if manual config was used
    if (upgradeOptions?.manualConfig) {
      markdown += `
## Configuration Used
- **Patch File**: ${upgradeOptions.manualConfig}
`;
    }

    // Save the markdown report
    let markdownPath: string;
    if (options.patchRepository) {
      const runDir = options.patchRepository.getRunDirectory();
      markdownPath = path.join(runDir, `Pantoum_Upgrade_Report_${targetVersion}.md`);
    } else {
      const baseDir = options.reportsDir || '.';
      markdownPath = path.join(baseDir, `Pantoum_Upgrade_Report_${targetVersion}.md`);
    }
    
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, markdown, 'utf8');

    // Register the file
    if (options.patchRepository) {
      options.patchRepository.registerFile(markdownPath);
    }

    return markdownPath;
  }

  /**
   * Extract errors summary from error prompt
   */
  private extractErrorsSummary(errorPrompt?: string): string[] {
    if (!errorPrompt) return [];
    
    const errors: string[] = [];
    const lines = errorPrompt.split('\n');
    
    for (const line of lines) {
      // Strip ANSI color codes from the line
      const cleanLine = stripAnsiCodes(line);
      
      // TypeScript errors
      const tsErrorMatch = cleanLine.match(/error TS\d+: (.+)/);
      if (tsErrorMatch) {
        errors.push(tsErrorMatch[1]);
        continue;
      }
      
      // React/ESLint warnings
      const lintMatch = cleanLine.match(/error ([\w\/-]+): (.+)/);
      if (lintMatch && !cleanLine.includes('error TS')) {
        errors.push(`${lintMatch[1]}: ${lintMatch[2]}`);
        continue;
      }
      
      // PnP/SPFx specific errors
      if (cleanLine.includes('has no exported member')) {
        const memberMatch = cleanLine.match(/Module .+ has no exported member '([^']+)'/);
        if (memberMatch) {
          errors.push(`Removed deprecated import: ${memberMatch[1]}`);
        }
      } else if (cleanLine.includes('does not exist on type')) {
        const propMatch = cleanLine.match(/Property '([^']+)' does not exist on type '([^']+)'/);
        if (propMatch) {
          errors.push(`Fixed ${propMatch[2]}.${propMatch[1]} property access`);
        }
      } else if (cleanLine.includes('Object literal may only specify known properties')) {
        const contextMatch = cleanLine.match(/and '([^']+)' does not exist in type '([^']+)'/);
        if (contextMatch) {
          errors.push(`Fixed ${contextMatch[2]} initialization with correct properties`);
        }
      }
    }
    
    // Remove duplicates and return
    return [...new Set(errors)];
  }

  /**
   * Get a meaningful fix description for an action
   */
  private getFixDescriptionForAction(action: any, _errorPrompt?: string, _fileName?: string): string {
    // For MultiEdit operations, handle the edits array (case-insensitive check)
    const toolName = (action.tool || '').toLowerCase();
    if (toolName === 'multiedit' && action.edits && Array.isArray(action.edits)) {
      // Format all edits from the MultiEdit operation
      const editsFormatted = action.edits.map((edit: any, index: number) => {
        if (edit.old_string && edit.new_string) {
          return this.formatFullCodeChange(edit.old_string, edit.new_string, index + 1);
        }
        return `Edit ${index + 1}: ${edit.details || 'Code change'}`;
      });
      return editsFormatted.join('\n\n');
    }
    
    // If we have full old_string/new_string from the action, show the full change
    if (action.old_string && action.new_string) {
      return this.formatFullCodeChange(action.old_string, action.new_string);
    }
    
    // Otherwise check if we have old_string/new_string info in the details (from Claude actions)
    const details = action.details || '';
    if (details.includes('Changing "') && details.includes('" to "')) {
      const changeMatch = details.match(/Changing "([^"]+)(?:\.\.\.)?" to "([^"]+)(?:\.\.\.)?"/);
      if (changeMatch) {
        const [, oldStr, newStr] = changeMatch;
        return this.generateSimpleDiff(oldStr, newStr);
      }
    }
    
    // Fallback to showing whatever detail we have
    return details || 'Code change';
  }

  /**
   * Format full code changes with proper diff display
   */
  private formatFullCodeChange(oldStr: string, newStr: string, editNumber?: number): string {
    // Skip if strings are identical
    if (oldStr === newStr) {
      return editNumber ? `Edit ${editNumber}: No changes` : 'No changes';
    }
    
    // Truncate very long strings intelligently
    const maxLength = 1000;
    const truncate = (str: string): string => {
      if (str.length <= maxLength) return str;
      
      // Try to find a good truncation point (end of line, statement, etc.)
      const truncateAt = Math.min(
        str.lastIndexOf('\n', maxLength) > 0 ? str.lastIndexOf('\n', maxLength) : maxLength,
        str.lastIndexOf(';', maxLength) > 0 ? str.lastIndexOf(';', maxLength) + 1 : maxLength
      );
      
      return str.substring(0, truncateAt) + '\n... (truncated)';
    };
    
    const oldTrunc = truncate(oldStr);
    const newTrunc = truncate(newStr);
    
    // Format as a proper diff
    const oldLines = oldTrunc.split('\n');
    const newLines = newTrunc.split('\n');
    
    // Simple diff format
    let diff = '';
    if (editNumber) {
      diff += `Edit ${editNumber}:\n`;
    }
    
    // Show what was removed
    if (oldTrunc.trim()) {
      diff += oldLines.map(line => `- ${line}`).join('\n');
    }
    
    // Add separator if both old and new exist
    if (oldTrunc.trim() && newTrunc.trim()) {
      diff += '\n';
    }
    
    // Show what was added
    if (newTrunc.trim()) {
      diff += newLines.map(line => `+ ${line}`).join('\n');
    }
    
    return diff;
  }


  /**
   * Generate a simple diff description showing what changed
   */
  private generateSimpleDiff(oldStr: string, newStr: string): string {
    // Normalize the strings - remove extra whitespace and truncate if too long
    const normalizeForDiff = (str: string): string => {
      // Remove leading/trailing whitespace from each line
      const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // If multi-line, take the first meaningful line
      if (lines.length > 1) {
        // For imports, show the full import statement
        if (lines[0].startsWith('import')) {
          const importEnd = lines.findIndex(l => l.includes('from') || l.endsWith(';'));
          if (importEnd >= 0) {
            return lines.slice(0, importEnd + 1).join(' ');
          }
        }
        return lines[0];
      }
      
      // For single line, trim to reasonable length
      const trimmed = lines[0] || str.trim();
      if (trimmed.length > 100) {
        return trimmed.substring(0, 100) + '...';
      }
      return trimmed;
    };
    
    const oldNorm = normalizeForDiff(oldStr);
    const newNorm = normalizeForDiff(newStr);
    
    // If strings are identical after normalization, look for additions
    if (oldNorm === newNorm) {
      // Check if new has additional lines (like added imports)
      const oldLines = oldStr.split('\n').filter(l => l.trim());
      const newLines = newStr.split('\n').filter(l => l.trim());
      
      if (newLines.length > oldLines.length) {
        // Find what was added
        const added = newLines.filter(line => 
          !oldLines.some(oldLine => oldLine.trim() === line.trim())
        );
        if (added.length > 0) {
          return `+ ${normalizeForDiff(added[0])}`;
        }
      }
    }
    
    // If old string is empty, it's an addition
    if (!oldStr.trim() && newStr.trim()) {
      return `+ ${newNorm}`;
    }
    
    // If new string is empty, it's a deletion
    if (oldStr.trim() && !newStr.trim()) {
      return `- ${oldNorm}`;
    }
    
    // Otherwise show both old and new
    return `- ${oldNorm}\n   + ${newNorm}`;
  }
}
