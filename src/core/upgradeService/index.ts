import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../utils/logger.js';
import { loadManualSteps, loadManualConfig } from '../../utils/manualLoader.js';
import { execa } from 'execa';
import { rimraf } from 'rimraf';
import { RepositoryService } from '../repositoryService.js';
import { findSpfxSolutions } from '../../solutionScanner.js';
import { runSpfxUpgrade } from '../../m365cli.js';
import { PatchService } from '../patchService.js';
import { ReportService } from '../reportService/index.js';
import { ClaudeMigrationExecutor } from '../claudeMigrationExecutor.js';
import type { PatchObject } from '../../schema/patchSchema.js';
import type { ApplyResult } from '../../patchApplier.js';
import type { M365UpgradeReport } from '../../schema/m365UpgradeReport.js';
import { TIMEOUTS, DEFAULTS, type EnvInjectionStrategy } from '../../constants.js';
import { RETRY_DEFAULTS } from '../../defaults.js';
import { ThirdPartyDependencyService } from '../thirdPartyDependencyService.js';
import { detectPackageManager, getInstallCommand, getInstallCommandString } from '../../utils/packageManager.js';
import type { ThirdPartyReport } from '../../schema/thirdPartySchema.js';
import type { VersionUpdateOptions } from '../versionUpdateService.js';
import { runSuccessSteps } from './successSteps.js';
import { ComplexityAnalyzer } from '../complexityAnalyzer/index.js';
import type { SolutionComplexity } from '../../schema/complexityTypes.js';
import { getVersion } from '../../utils/version.js';
import { writeHistoryEntry } from '../historyWriter.js';
import type { HistoryEntry } from '../../schema/historyTypes.js';

type ParseUpgradeResult = {
  items: M365UpgradeReport;
  alreadyAtTarget: boolean;
  cliMessage?: string;
};

type OutputOptions = {
  reportsDir?: string; // Where to save reports (default: cwd)
  perSolutionReports?: boolean; // Save per-solution reports in solution dirs
  markdown?: boolean; // Generate markdown report (default: true)
  writeHistory?: boolean; // Write per-run history file (default: true)
  historyRoot?: string; // Where to write pantoum_history/ (default: repoRoot)
};

export interface UpgradeOptions {
  localPath?: string;
  includeSolutions?: string[];
  excludeSolutions: string[];
  excludePatchIds: string[];
  targetVersion: string;
  manualConfig?: string;
  outputOptions?: OutputOptions;
  flags: {
    onSingleSolutionFail: 'halt' | 'continue';
    silent: boolean;
    aiFixM365Errors: boolean;
    aiFixBuildErrors: boolean;
    claudeModel: string;
    updateThirdPartyDeps?: 'none' | 'patch' | 'minor' | 'major';
    updateThirdPartyDevDeps?: 'none' | 'patch';
    cleanInstallAfterDepUpdate?: boolean;
    aiFixThirdPartyErrors?: boolean;
    aiFixEslintProperly?: boolean;
    aiFixTypeScriptWarnings?: boolean;
    aiMaxRetries?: number; // Max AI retry iterations for error fixing (1-10)
    thinkingEffort?: string; // Adaptive thinking effort level: 'off' | 'low' | 'medium' | 'high' | 'max'
    envInjectionStrategy?: EnvInjectionStrategy; // How to handle env vars in SPFx 1.22+ Heft
  };
  versionUpdateOptions?: VersionUpdateOptions;
  complexityOptions?: {
    enabled: boolean;
    includeDevDependencies?: boolean;
  };
  debugOptions?: {
    debugReports?: boolean;
  };
}

export interface UpgradeResult {
  success: boolean;
  reportPath: string;
}

export interface SolutionReport {
  patches: PatchObject[];
  applyResults?: ApplyResult[];
  error?: string;
  m365CliError?: string;
  buildErrors?: string[];
  buildFixPatches?: PatchObject[];
  thirdPartyUpdates?: ThirdPartyReport;
  complexity?: SolutionComplexity;
  skipped?: boolean;
  skipReason?: string;
  claudeActions?: Array<{
    timestamp: string;
    stage: 'upgrade-fix' | 'build-fix';
    tool: string;
    action: string;
    target?: string;
    details?: string;
  }>;
  // Agent SDK Metrics (available when using Claude Agent SDK)
  claudeMetrics?: {
    tokens: {
      input: number;
      output: number;
      total: number;
      cacheRead?: number;
      cacheCreation?: number;
    };
    cost: number;
    performance: {
      durationMs: number;
      durationApiMs?: number;
      turns: number;
    };
    sessions: Array<{
      sessionId?: string;
      stage: string;
      toolUsage: Array<{
        name: string;
        count: number;
      }>;
    }>;
  };
}

export class UpgradeService {
  private repositoryService: RepositoryService;
  private patchService: PatchService;
  private reportService: ReportService;
  private thirdPartyService: ThirdPartyDependencyService;

  constructor() {
    this.repositoryService = new RepositoryService();
    this.patchService = new PatchService(); // Will be reinitialized with perSolutionReports flag
    this.reportService = new ReportService();
    this.thirdPartyService = new ThirdPartyDependencyService();
  }

  async upgradeRepository(options: UpgradeOptions): Promise<UpgradeResult> {
    const {
      localPath,
      excludeSolutions,
      excludePatchIds,
      targetVersion,
      manualConfig,
      flags,
      outputOptions,
    } = options;

    let repoRoot = '';
    const solutionReports: Record<string, SolutionReport> = {};
    const startTime = Date.now();
    const startTimestamp = new Date().toISOString();

    try {
      logger.info('🚀 Starting SPFx upgrade to version %s', targetVersion);
      
      logger.info('📂 Loading manual configuration...');
      const manualAll = loadManualSteps(manualConfig || DEFAULTS.PATCHES_FILE);
      const fullManualConfig = loadManualConfig(manualConfig || DEFAULTS.PATCHES_FILE);

      logger.info('📦 Opening repository...');
      const { rootPath } = await this.repositoryService.openRepository(localPath);
      repoRoot = rootPath;
      logger.info('   ✓ Repository ready at %s', repoRoot);

      // Reinitialize PatchService with perSolutionReports flag if needed
      if (outputOptions?.perSolutionReports) {
        this.patchService = new PatchService(undefined, true);
      }

      let solutions: string[];

      if (options.includeSolutions && options.includeSolutions.length > 0) {
        // Webapp already validated these paths during scan — skip full directory scan
        logger.info('🔍 Using %d pre-selected solution(s)...', options.includeSolutions.length);
        solutions = options.includeSolutions.map(s => {
          const resolved = path.resolve(s);
          return path.relative(repoRoot, resolved);
        });
      } else {
        logger.info('🔍 Scanning for SPFx solutions...');
        solutions = await findSpfxSolutions(repoRoot, excludeSolutions);
      }

      logger.info('   ✓ Found %d solution(s): %s', solutions.length, solutions.join(', '));
      if (solutions.length === 0) throw new Error('No SPFx solutions found.');

      for (const solPathRel of solutions) {
        const absoluteSolutionPath = path.resolve(repoRoot, solPathRel);
        const solutionName = path.basename(solPathRel);
        solutionReports[solPathRel] = { patches: [] };

        try {
          logger.info('');
          logger.info('📦 [%d/%d] Processing solution: %s', solutions.indexOf(solPathRel) + 1, solutions.length, solutionName);
          await this.processSolution({
            solPathRel,
            absoluteSolutionPath,
            solutionName,
            targetVersion,
            excludePatchIds,
            manualAll,
            flags,
            solutionReports,
            manualConfig,
            fullManualConfig,
            outputOptions: options.outputOptions,
            versionUpdateOptions: options.versionUpdateOptions,
            complexityOptions: options.complexityOptions,
            debugReports: options.debugOptions?.debugReports,
          });
        } catch (solErr: any) {
          logger.error('❌ Solution %s failed: %s', solutionName, solErr.message);
          
          // Record the error in the solution report
          solutionReports[solPathRel].error = solErr.message;
          
          // Save error log in solution's run directory
          const runDir = this.patchService.patchRepo.getSolutionRunDirectory(solutionName);
          const solErrorLog = path.join(runDir, `pantoum_error_${targetVersion}_${solutionName}.log`);
          fs.mkdirSync(path.dirname(solErrorLog), { recursive: true });
          fs.writeFileSync(solErrorLog, solErr.stack || solErr.message, 'utf8');
          logger.error('   → See detailed error in %s', solErrorLog);
          
          if (flags.onSingleSolutionFail === 'continue') {
            logger.info('   → Continuing with next solution...');
            continue;
          } else {
            throw solErr;
          }
        }

        // Generate per-solution report regardless of success/failure
        if (options.outputOptions?.perSolutionReports) {
          try {
            logger.info('');
            logger.info('   📝 Saving per-solution report...');

            const metadataPath = await this.reportService.savePerSolutionMetadata(
              absoluteSolutionPath,
              solutionName,
              targetVersion,
              solutionReports[solPathRel],
              {
                ...options.outputOptions,
                upgradeOptions: options,
                pantoumVersion: getVersion()
              },
              this.patchService.patchRepo
            );
            logger.info('     → Metadata saved: %s', metadataPath);

            const markdownPath = await this.reportService.generatePerSolutionMarkdownReport(
              absoluteSolutionPath,
              solutionName,
              targetVersion,
              this.patchService.patchRepo
            );
            logger.info('     → Markdown report saved: %s', markdownPath);
          } catch (reportErr: any) {
            logger.warn('   ⚠️  Failed to save per-solution report: %s', reportErr.message);
          }
        }
      }

      // Check if any solution had build errors
      const solutionsWithErrors = Object.entries(solutionReports)
        .filter(([_, report]) => report.buildErrors && report.buildErrors.length > 0);
      
      logger.info('');
      if (solutionsWithErrors.length > 0) {
        logger.error('⚠️  Build errors found in %d solution(s)', solutionsWithErrors.length);
      } else {
        logger.info('✅ All solutions built successfully!');
      }
      
      logger.info('🎯 Upgrade process completed for all solutions');

      // Get pantoum version from package.json
      const pantoumVersion = getVersion();
      
      // Aggregate Claude metrics from patches before generating reports
      this.aggregateClaudeMetrics(solutionReports);

      const reportOptions = {
        ...options.outputOptions,
        patchRepository: this.patchService.patchRepo,
        upgradeOptions: options,
        pantoumVersion
      };

      const finalReportPath = await this.reportService.generateFinalReport(
        targetVersion,
        solutionReports,
        reportOptions
      );

      logger.info('📝 Final JSON report saved to: %s', finalReportPath);
      
      // Generate markdown report if enabled (default: true)
      // Skip the global markdown report if per-solution reports are enabled
      if (options.outputOptions?.markdown !== false && !options.outputOptions?.perSolutionReports) {
        const markdownReportPath = await this.reportService.generateMarkdownReport(
          targetVersion,
          solutionReports,
          reportOptions
        );
        
        logger.info('📄 Markdown report saved to: %s', markdownReportPath);
      } else if (options.outputOptions?.perSolutionReports) {
        logger.info('📄 Skipping global markdown report (per-solution reports enabled)');
      }

      // Return success false if any solution had errors
      const hasErrors = solutionsWithErrors.length > 0 ||
                       Object.values(solutionReports).some(r => r.error);

      if (!hasErrors) {
        logger.info('🎉 SPFx upgrade completed successfully!');
      } else {
        logger.error('❌ SPFx upgrade completed with errors');
      }

      // Write history entry if enabled (default: true)
      if (outputOptions?.writeHistory !== false) {
        try {
          const runId = this.patchService.patchRepo.getRunId();
          const someSucceeded = Object.values(solutionReports).some(r => !r.error && !r.skipped);
          const entry: HistoryEntry = {
            runId,
            timestamp: startTimestamp,
            completedAt: new Date().toISOString(),
            rootPath: repoRoot,
            targetVersion,
            status: hasErrors ? (someSucceeded ? 'partial' : 'failed') : 'success',
            solutions: solutions.map((s) => ({
              path: s,
              name: path.basename(s),
              success: !solutionReports[s]?.error && !solutionReports[s]?.skipped,
            })),
            reportPath: path.dirname(finalReportPath),
            durationMs: Date.now() - startTime,
            summary: {
              total: solutions.length,
              succeeded: Object.values(solutionReports).filter(r => !r.error && !r.skipped).length,
              failed: Object.values(solutionReports).filter(r => r.error).length,
              skipped: Object.values(solutionReports).filter(r => r.skipped).length,
            },
          };
          writeHistoryEntry(outputOptions?.historyRoot || repoRoot, entry);
          logger.info('📜 History entry saved to pantoum_history/pantoum_run_%s.json', runId);
        } catch (histErr: any) {
          logger.warn('⚠️ Failed to write history entry: %s', histErr.message);
        }
      }

      return { success: !hasErrors, reportPath: finalReportPath };

    } catch (err: any) {
      logger.error('❌ Upgrade failed: %s', err.message);
      if (err.stack) logger.info(err.stack);
      
      const errorLog = await this.reportService.generateErrorReport(
        targetVersion, 
        err, 
        { ...options.outputOptions, patchRepository: this.patchService.patchRepo }
      );
      logger.error('   → See full error details in %s', errorLog);
      return { success: false, reportPath: errorLog };
    }
  }

  private async processSolution(params: {
    solPathRel: string;
    absoluteSolutionPath: string;
    solutionName: string;
    targetVersion: string;
    excludePatchIds: string[];
    manualAll: any[];
    flags: UpgradeOptions['flags'];
    solutionReports: Record<string, SolutionReport>;
    manualConfig?: string;
    fullManualConfig?: any;
    outputOptions?: UpgradeOptions['outputOptions'];
    versionUpdateOptions?: VersionUpdateOptions;
    complexityOptions?: UpgradeOptions['complexityOptions'];
    debugReports?: boolean;
  }) {
    const {
      solPathRel,
      absoluteSolutionPath,
      solutionName,
      targetVersion,
      excludePatchIds,
      manualAll,
      flags,
      solutionReports,
      manualConfig,
      fullManualConfig,
      outputOptions,
      versionUpdateOptions,
      complexityOptions,
      debugReports,
    } = params;

    // Initialize patch repository for this solution
    // Always pass solution path so debug files go to solution's pantoum_run directory
    await this.patchService.patchRepo.initializePatchRepository(
      solutionName,
      targetVersion,
      absoluteSolutionPath
    );

    // Get current SPFx version from .yo-rc.json for downgrade check
    const yoRcPath = path.join(absoluteSolutionPath, '.yo-rc.json');
    let currentVersion: string | null = null;

    if (fs.existsSync(yoRcPath)) {
      try {
        const yoRc = JSON.parse(fs.readFileSync(yoRcPath, 'utf-8'));
        const spfxGenerator = yoRc['@microsoft/generator-sharepoint'];
        if (spfxGenerator?.version) {
          currentVersion = spfxGenerator.version;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Block downgrades - PANTOUM only supports upgrades
    if (currentVersion) {
      const semver = await import('semver');
      const cleanCurrent = semver.default.clean(currentVersion);
      const cleanTarget = semver.default.clean(targetVersion);

      if (cleanCurrent && cleanTarget) {
        if (semver.default.lt(cleanTarget, cleanCurrent)) {
          const error = new Error(
            `Downgrade not allowed: ${currentVersion} → ${targetVersion}. ` +
            `PANTOUM only supports upgrades. Current solution is already at ${currentVersion}.`
          );
          logger.error('   ❌ %s', error.message);
          throw error;
        }

        if (semver.default.eq(cleanTarget, cleanCurrent)) {
          // Already at target version - skip with message
          logger.info('   ⏭️  Solution already at target version %s, skipping', targetVersion);
          solutionReports[solPathRel].skipped = true;
          solutionReports[solPathRel].skipReason = `Already at target version ${targetVersion}`;
          return;
        }
      }
    }

    // Analyze complexity if enabled
    if (complexityOptions?.enabled) {
      logger.info('   📊 Analyzing solution complexity...');
      try {
        // Use the currentVersion we already detected (or default to 1.0.0)
        const versionForAnalysis = currentVersion || '1.0.0';

        const complexityAnalyzer = new ComplexityAnalyzer();
        const complexityResult = await complexityAnalyzer.analyzeSolution(
          absoluteSolutionPath,
          versionForAnalysis,
          targetVersion,
          { includeDevDependencies: complexityOptions.includeDevDependencies }
        );

        // Store complexity in solution report
        solutionReports[solPathRel].complexity = complexityResult;

        logger.info('   → Complexity level: %s (%d/100)',
          complexityResult.overall.level.toUpperCase(),
          Math.round(complexityResult.overall.value)
        );

        // Log key factors
        if (complexityResult.factors.versionJump) {
          logger.info('     • Version jump: %s', complexityResult.factors.versionJump.label);
        }
        if (complexityResult.factors.components) {
          logger.info('     • Components: %s', complexityResult.factors.components.label);
        }
        if (complexityResult.factors.dependencies?.production?.outdatedCount > 0) {
          logger.info('     • Dependencies: %s', complexityResult.factors.dependencies.production.label);
        }
      } catch (complexityError: any) {
        logger.warn('   ⚠️ Complexity analysis failed: %s', complexityError.message);
        // Continue with upgrade even if complexity analysis fails
      }
    }

    // 1) Run M365 CLI
    logger.info('   [1/3] Running M365 CLI upgrade...');
    logger.info('PIPELINE:1:m365cli:event=start');
    const m365Start = Date.now();
    const cliResult = await runSpfxUpgrade(absoluteSolutionPath, targetVersion);
    logger.info('   [Timing] M365 CLI took %ss', ((Date.now() - m365Start) / 1000).toFixed(1));

    // Only save raw report if we have actual content
    if (cliResult.reportJson) {
      const rawPath = await this.reportService.saveRawReport(
        targetVersion, 
        solutionName, 
        cliResult.reportJson,
        { ...outputOptions, patchRepository: this.patchService.patchRepo },
        absoluteSolutionPath
      );
      logger.info('   → Raw upgrade report saved: %s', rawPath);
    }

    if (!cliResult.success) {
      logger.error('   ❌ M365 CLI failed: %s', cliResult.error ?? 'Unknown error');
      // Record the error in the solution report
      solutionReports[solPathRel].m365CliError = cliResult.error || 'Unknown M365 CLI error';

      // Generate patches to fix M365 CLI errors (if enabled)
      if (cliResult.error && flags.aiFixM365Errors) {
        logger.info('   🔧 Generating patches to fix M365 CLI error...');

        // Let Claude analyze and fix the error
        await this.patchService.generateErrorPatches(
          absoluteSolutionPath,
          solutionName,
          targetVersion,
          cliResult.error,
          'upgrade-report',
          flags.claudeModel,
          flags.aiFixEslintProperly ?? true,
          debugReports
        );

        // Claude fixes files directly now, so always retry after analysis
        // Add a small delay to ensure file changes are written to disk
        logger.info('   ⏳ Waiting for file changes to sync...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

        logger.info('   🔁 Retrying M365 CLI after Claude fixes...');
        const retryResult = await runSpfxUpgrade(absoluteSolutionPath, targetVersion);

        if (retryResult.success) {
          logger.info('   ✅ M365 CLI succeeded after fixes!');
          logger.info('PIPELINE:1:m365cli:event=complete,m365CliSuccess=true,m365ErrorTemplateUsed=true');
          // Continue with the retry result
          Object.assign(cliResult, retryResult);
        } else {
          logger.error('   ❌ M365 CLI still failing: %s', retryResult.error);
          logger.info('PIPELINE:1:m365cli:event=complete,m365CliSuccess=false,m365ErrorTemplateUsed=true');
          if (flags.onSingleSolutionFail === 'continue') {
            logger.info('   → Continuing with next solution...');
            return;
          } else {
            throw new Error(`M365 CLI error persists: ${retryResult.error}`);
          }
        }
      } else {
        logger.info('PIPELINE:1:m365cli:event=complete,m365CliSuccess=false,m365ErrorTemplateUsed=false');
      }
    } else {
      logger.info('PIPELINE:1:m365cli:event=complete,m365CliSuccess=true,m365ErrorTemplateUsed=false');
    }

    if (!cliResult.reportJson) {
      if (flags.onSingleSolutionFail === 'continue') {
        return;
      } else {
        throw new Error('M365 CLI did not return any JSON report, check upgrade report');
      }
    }

    // 2) Parse JSON
    const parseResult = this.parseUpgradeReport(cliResult.reportJson, solutionName, targetVersion, flags, absoluteSolutionPath, outputOptions);
    if (!parseResult) return;

    // Check if already at target version - skip all processing
    if (parseResult.alreadyAtTarget) {
      logger.info('   ✓ M365 CLI: %s', parseResult.cliMessage);
      logger.info('   → Skipping upgrade (no changes needed)');

      solutionReports[solPathRel].skipped = true;
      solutionReports[solPathRel].skipReason = parseResult.cliMessage;
      solutionReports[solPathRel].patches = [];

      return;
    }

    const rawReportArray = parseResult.items;

    // 3) Generate patches
    logger.info('   [2/3] Generating patches...');
    logger.info('PIPELINE:2:patches:event=start');
    const patchGenStart = Date.now();
    const patches = await this.patchService.generateAllPatches({
      solutionPath: absoluteSolutionPath,
      upgradeReport: rawReportArray,
      excludePatchIds,
      manualSteps: manualAll,
      targetVersion,
      solutionName,
      manualConfig: fullManualConfig,
      versionUpdateOptions: versionUpdateOptions,
      claudeModel: flags.claudeModel,
      envInjectionStrategy: flags.envInjectionStrategy,
      debugReports,
      aiMaxRetries: flags.aiMaxRetries,
      thinkingEffort: flags.thinkingEffort,
    });

    solutionReports[solPathRel].patches = patches;
    // Emit Phase 2 detail: count FN##### patches and identify deterministic patches
    const fnPatches = patches.filter(p => p.id.startsWith('FN'));
    const deterministicIds = patches
      .filter(p => p.id.startsWith('SCRIPT') || p.id.startsWith('ENV') || p.id.startsWith('SASS'))
      .map(p => p.id);
    logger.info('PIPELINE:2:patches:event=complete,fnCount=%d,deterministic=%s',
      fnPatches.length, deterministicIds.join('+') || 'none');
    logger.info('   ✓ Generated %d patches', patches.length);
    logger.info('   [Timing] Patch generation took %ss', ((Date.now() - patchGenStart) / 1000).toFixed(1));

    // 4) Apply patches
    logger.info('   → Applying patches...');
    const patchApplyStart = Date.now();
    const applyResults = await this.patchService.applyPatches(
      absoluteSolutionPath,
      patches,
      solutionName,
      targetVersion
    );
    solutionReports[solPathRel].applyResults = applyResults;
    logger.info('   [Timing] Patch application took %ss', ((Date.now() - patchApplyStart) / 1000).toFixed(1));

    const failed = applyResults.filter(r => !r.success);
    const succeeded = applyResults.filter(r => r.success);
    
    if (failed.length) {
      const errorMsg = `Some patches failed:\n` +
        failed.map(f => `• ${f.patch.id}: ${f.message}`).join('\n');
      
      logger.error('   ❌ %d patches failed:', failed.length);
      failed.forEach(f => logger.error('      • %s: %s', f.patch.id, f.message));
      
      // If onSingleSolutionFail is 'continue', log but don't throw
      if (flags.onSingleSolutionFail === 'continue') {
        logger.warn('   ⚠️  Continuing despite patch failures (--onSingleSolutionFail=continue)');
        logger.info('   ✅ %d/%d patches applied successfully', succeeded.length, applyResults.length);
        
        // Record patch failures in solution report
        solutionReports[solPathRel].error = errorMsg;
      } else {
        throw new Error(errorMsg);
      }
    } else {
      logger.info('   ✓ All patches applied successfully');
    }

    // 5) Known build script fixes now handled by YAML deterministic step HEFTFIX001

    // 6) Run success steps and capture build results (Phases 4, 5, 7)
    logger.info('   [3/3] Running build and test...');
    logger.info('PIPELINE:5:build:event=start');
    const buildStart = Date.now();
    const buildResults = await this.runSuccessSteps(
      absoluteSolutionPath,
      solutionName,
      targetVersion,
      flags,
      manualConfig,
      debugReports
    );
    logger.info('   [Timing] Build and test took %ss', ((Date.now() - buildStart) / 1000).toFixed(1));

    // Store build results in solution report
    solutionReports[solPathRel].buildErrors = buildResults.buildErrors;
    solutionReports[solPathRel].buildFixPatches = buildResults.buildFixPatches;

    // Emit Phase 5 complete
    const buildSuccess = buildResults.buildErrors.length === 0;
    const buildFixAttempts = buildResults.buildFixPatches.length > 0 ? buildResults.buildFixPatches.length : 0;
    logger.info('PIPELINE:5:build:event=complete,buildSuccess=%s,buildErrorTemplateUsed=%s,buildFixAttempts=%d',
      buildSuccess, buildFixAttempts > 0, buildFixAttempts);

    // Check if there were build errors and handle based on flag
    if (buildResults.buildErrors.length > 0) {
      logger.error('   ❌ Build failed with %d errors', buildResults.buildErrors.length);

      if (flags.onSingleSolutionFail === 'halt') {
        const errorMsg = `Build/test errors in ${solPathRel}:\n${buildResults.buildErrors.join('\n')}`;
        throw new Error(errorMsg);
      }
      // Even with 'continue', record that we had errors
      solutionReports[solPathRel].error = `Build failed with ${buildResults.buildErrors.length} errors`;
    } else {
      logger.info('   ✅ Solution upgraded successfully!');
    }

    // 6) Optional: Update third-party dependencies after successful SPFx upgrade
    if ((flags.updateThirdPartyDeps && flags.updateThirdPartyDeps !== 'none') ||
        (flags.updateThirdPartyDevDeps && flags.updateThirdPartyDevDeps !== 'none')) {
      logger.info('   [4/4] Updating third-party dependencies...');
      logger.info('PIPELINE:6:thirdparty:event=start');

      const thirdPartyReport = await this.processThirdPartyUpdates({
        absoluteSolutionPath,
        solutionName,
        targetVersion,
        flags,
        manualConfig,
        solutionReports,
        solPathRel,
        debugReports
      });
      
      const updatedCount = thirdPartyReport?.updates?.length ?? 0;
      const thirdPartyTemplateUsed = (thirdPartyReport?.claudeFixes?.length ?? 0) > 0;
      logger.info('PIPELINE:6:thirdparty:event=complete,thirdPartyTemplateUsed=%s,packagesUpdated=%d',
        thirdPartyTemplateUsed, updatedCount);
      solutionReports[solPathRel].thirdPartyUpdates = thirdPartyReport;
    } else {
      logger.info('PIPELINE:6:thirdparty:event=skip');
    }
  }

  private parseUpgradeReport(
    reportJson: string,
    solutionName: string,
    targetVersion: string,
    flags: UpgradeOptions['flags'],
    _absoluteSolutionPath: string,
    _outputOptions?: OutputOptions
  ): ParseUpgradeResult | null {
    try {
      const parsed = JSON.parse(reportJson);

      // M365 CLI returns a string message when no upgrade is needed
      if (typeof parsed === 'string') {
        return {
          items: [],
          alreadyAtTarget: true,
          cliMessage: parsed
        };
      }

      if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array or string, got ${typeof parsed}`);
      }
      return {
        items: parsed,
        alreadyAtTarget: false
      };
    } catch (parseErr: any) {
      const msg = `Invalid JSON from M365 CLI: ${parseErr.message}`;
      logger.error(msg);

      // Get run ID and determine error report location
      const runId = this.patchService?.patchRepo?.getRunId() ||
                    `${new Date().toISOString().slice(0,10).replace(/-/g,'')}_temp`;
      // Use patchRepository to determine the correct directory
      const errorDir = this.patchService?.patchRepo
        ? this.patchService.patchRepo.getRunDirectory()
        : path.join('.', `pantoum_run_${runId}`);

      // Ensure directory exists
      fs.mkdirSync(errorDir, { recursive: true });

      const errorPath = path.join(errorDir, `pantoum_error-report_${targetVersion}_${solutionName}.log`);
      fs.writeFileSync(errorPath, reportJson, DEFAULTS.ENCODING);

      // Register the error file
      if (this.patchService?.patchRepo) {
        this.patchService.patchRepo.registerFile(errorPath);
      }

      if (flags.onSingleSolutionFail === 'continue') {
        return null;
      }
      throw new Error(msg);
    }
  }


  private async runSuccessSteps(
    absoluteSolutionPath: string,
    solutionName: string,
    targetVersion: string,
    flags: UpgradeOptions['flags'],
    manualConfig?: string,
    debugReports?: boolean
  ): Promise<{ buildErrors: string[]; buildFixPatches: PatchObject[] }> {
    // Delegate to extracted module
    return runSuccessSteps(
      absoluteSolutionPath,
      solutionName,
      targetVersion,
      flags,
      manualConfig,
      this.patchService,
      debugReports
    );
  }

  /**
   * Process third-party dependency updates after successful SPFx upgrade
   */
  private async processThirdPartyUpdates(params: {
    absoluteSolutionPath: string;
    solutionName: string;
    targetVersion: string;
    flags: UpgradeOptions['flags'];
    manualConfig?: string;
    solutionReports: Record<string, SolutionReport>;
    solPathRel: string;
    debugReports?: boolean;
  }): Promise<ThirdPartyReport> {
    const {
      absoluteSolutionPath,
      solutionName,
      targetVersion,
      flags,
      manualConfig,
      debugReports,
    } = params;
    
    const packageJsonPath = path.join(absoluteSolutionPath, 'package.json');
    const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    const totalPackages = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }).length;
    
    // Analyze dependencies for eligible updates
    const updates = await this.thirdPartyService.analyzeDependencies(
      packageJsonPath,
      flags.updateThirdPartyDeps || 'none',
      flags.updateThirdPartyDevDeps || 'none'
    );
    
    // Check if we have any eligible updates
    const eligibleUpdates = updates.filter(u => !u.skipped);
    if (eligibleUpdates.length === 0) {
      logger.info('   → No eligible third-party packages to update (all are SPFx-related or up-to-date)');
      return {
        eligiblePackages: 0,
        totalPackages,
        updates: [],
        skipped: updates.filter(u => u.skipped),
        patches: [],
        finalBuildSuccess: true
      };
    }
    
    // Log what we're about to update
    logger.info(`   → Found ${eligibleUpdates.length} eligible package(s) for update:`);
    eligibleUpdates.forEach(pkg => {
      logger.info(`      • ${pkg.name}: ${pkg.currentVersion} → ${pkg.latestVersion} (${pkg.updateType})`);
    });
    
    // Log what we're skipping
    const skippedUpdates = updates.filter(u => u.skipped);
    if (skippedUpdates.length > 0) {
      logger.info(`   → Skipping ${skippedUpdates.length} update(s):`);
      skippedUpdates.forEach(pkg => {
        logger.info(`      • ${pkg.name}: ${pkg.latestVersion} (${pkg.skipReason})`);
      });
    }
    
    // Generate and apply patches
    logger.info('   → Applying updates...');
    const patches = await this.thirdPartyService.generateUpdatePatches(eligibleUpdates);
    const thirdPartyApplyResults = await this.patchService.applyPatches(
      absoluteSolutionPath,
      patches,
      solutionName,
      targetVersion
    );
    const thirdPartyFailed = thirdPartyApplyResults.filter(r => !r.success);
    if (thirdPartyFailed.length > 0) {
      logger.error('   ❌ %d third-party patch(es) failed to apply:', thirdPartyFailed.length);
      thirdPartyFailed.forEach(f => logger.error('      • %s: %s', f.patch.id, f.message));
    }
    
    // Clean install if requested
    if (flags.cleanInstallAfterDepUpdate) {
      logger.info('   → Cleaning node_modules...');
      try {
        // Only delete node_modules, keep package-lock.json for npm ci
        await rimraf(path.join(absoluteSolutionPath, 'node_modules'));
      } catch (error) {
        logger.warn('   → Failed to clean node_modules, continuing anyway...');
      }
    }

    // Detect package manager and run install
    // Note: npm ci won't work here because we just modified package.json
    const pm = detectPackageManager(absoluteSolutionPath);
    const installCmd = getInstallCommand(pm);
    logger.info('   → Running %s...', getInstallCommandString(pm));
    await execa(installCmd[0], installCmd.slice(1), {
      cwd: absoluteSolutionPath,
      timeout: TIMEOUTS.BUILD_COMMAND
    });
    
    // Re-run success steps (including M999999 build)
    logger.info('   → Re-running build to verify updates...');
    const postUpdateBuild = await this.runSuccessSteps(
      absoluteSolutionPath,
      solutionName,
      targetVersion,
      flags,
      manualConfig,
      debugReports
    );
    
    // Handle errors with Claude if needed - with retry logic
    let allClaudeFixes: PatchObject[] = [];
    let finalBuildSuccess = postUpdateBuild.buildErrors.length === 0;
    let finalBuildErrors = postUpdateBuild.buildErrors;
    
    if (postUpdateBuild.buildErrors.length > 0 && flags.aiFixThirdPartyErrors) {
      logger.info('   → Build failed after updates, invoking Claude to fix breaking changes...');
      
      // Only send Claude the packages we actually updated
      const majorUpdates = eligibleUpdates.filter(u => u.updateType === 'major');
      if (majorUpdates.length > 0) {
        logger.info(`   → ${majorUpdates.length} major update(s) detected, likely causing issues`);
      }
      
      // Retry logic for third-party fixes
      const MAX_THIRD_PARTY_RETRIES = flags.aiMaxRetries ?? RETRY_DEFAULTS.AI_MAX_RETRIES;
      let retryCount = 0;
      let remainingErrors = [...postUpdateBuild.buildErrors];
      const claudeExecutor = new ClaudeMigrationExecutor();
      
      while (retryCount < MAX_THIRD_PARTY_RETRIES && remainingErrors.length > 0) {
        logger.info(`   → Claude fix attempt ${retryCount + 1} of ${MAX_THIRD_PARTY_RETRIES}...`);
        
        // Generate fixes for current errors
        const claudeFixes = await claudeExecutor.executeThirdPartyMigration(
          absoluteSolutionPath,
          eligibleUpdates,
          remainingErrors
        );
        
        if (claudeFixes.length === 0) {
          logger.warn('   → Claude could not generate fixes for these errors');
          break; // No point retrying if Claude can't generate fixes
        }
        
        logger.info(`   → Claude generated ${claudeFixes.length} fix(es), applying...`);
        allClaudeFixes.push(...claudeFixes);

        const claudeApplyResults = await this.patchService.applyPatches(
          absoluteSolutionPath,
          claudeFixes,
          solutionName,
          targetVersion
        );
        const claudeApplyFailed = claudeApplyResults.filter(r => !r.success);
        if (claudeApplyFailed.length > 0) {
          logger.error('   ❌ %d Claude fix patch(es) failed to apply:', claudeApplyFailed.length);
          claudeApplyFailed.forEach(f => logger.error('      • %s: %s', f.patch.id, f.message));
        }

        // Verify the fixes
        logger.info('   → Verifying fixes (attempt %d)...', retryCount + 1);
        const verifyBuild = await this.runSuccessSteps(
          absoluteSolutionPath,
          solutionName,
          targetVersion,
          flags,
          manualConfig,
          debugReports
        );
        
        const previousErrorCount = remainingErrors.length;
        remainingErrors = verifyBuild.buildErrors;
        finalBuildErrors = remainingErrors;
        
        if (remainingErrors.length === 0) {
          finalBuildSuccess = true;
          logger.info('   ✅ All third-party update issues resolved!');
          break;
        }
        
        // Check if we're making progress
        if (remainingErrors.length >= previousErrorCount) {
          logger.warn('   → Not making progress (errors: %d -> %d), stopping retries', 
            previousErrorCount, remainingErrors.length);
          break;
        }
        
        logger.info('   → Reduced errors from %d to %d, retrying...', 
          previousErrorCount, remainingErrors.length);
        retryCount++;
      }
      
      // Final status
      if (remainingErrors.length > 0) {
        finalBuildSuccess = false;
        logger.error('   ✖ Build still failing after %d Claude attempt(s) - manual intervention required', 
          retryCount + 1);
        logger.error('   → Remaining errors:');
        finalBuildErrors.forEach(err => logger.error(`      ${err}`));
      }
    } else if (postUpdateBuild.buildErrors.length > 0) {
      logger.error('   ✖ Build failed after third-party updates');
      logger.error('   → Errors:');
      postUpdateBuild.buildErrors.forEach(err => logger.error(`      ${err}`));
    }
    
    // Create comprehensive report
    return this.thirdPartyService.createReport(
      updates,
      patches,
      postUpdateBuild.buildErrors,
      allClaudeFixes,
      finalBuildSuccess,
      totalPackages
    );
  }

  /**
   * Aggregate Claude metrics from all patches in solution reports
   */
  private aggregateClaudeMetrics(solutionReports: Record<string, SolutionReport>): void {
    for (const [_solPath, report] of Object.entries(solutionReports)) {
      let aggregatedMetrics: any = null;

      // Check all patches for Claude metrics
      const allPatches = [...(report.patches || []), ...(report.buildFixPatches || [])];

      for (const patch of allPatches) {
        if ((patch as any).claudeMetrics) {
          const metrics = (patch as any).claudeMetrics;

          if (!aggregatedMetrics) {
            aggregatedMetrics = {
              tokens: {
                input: 0,
                output: 0,
                total: 0,
                cacheRead: 0,
                cacheCreation: 0
              },
              cost: 0,
              performance: {
                durationMs: 0,
                durationApiMs: 0,
                turns: 0
              },
              sessions: []
            };
          }

          // Aggregate token counts
          aggregatedMetrics.tokens.input += metrics.tokens?.input || 0;
          aggregatedMetrics.tokens.output += metrics.tokens?.output || 0;
          aggregatedMetrics.tokens.total += metrics.tokens?.total || 0;
          aggregatedMetrics.tokens.cacheRead += metrics.tokens?.cacheRead || 0;
          aggregatedMetrics.tokens.cacheCreation += metrics.tokens?.cacheCreation || 0;

          // Aggregate costs
          aggregatedMetrics.cost += metrics.cost || 0;

          // Aggregate performance
          aggregatedMetrics.performance.durationMs += metrics.performance?.durationMs || 0;
          aggregatedMetrics.performance.durationApiMs += metrics.performance?.durationApiMs || 0;
          aggregatedMetrics.performance.turns += metrics.performance?.turns || 0;

          // Collect session info with tool usage
          if (metrics.sessionId || metrics.toolUsage) {
            const toolUsage = metrics.toolUsage || [];

            // Convert tool usage array to aggregated counts
            const toolCounts: { name: string; count: number }[] = [];
            if (Array.isArray(toolUsage)) {
              const toolMap = new Map<string, number>();
              for (const tool of toolUsage) {
                const name = tool.name;
                const count = tool.count || 1;
                toolMap.set(name, (toolMap.get(name) || 0) + count);
              }
              toolMap.forEach((count, name) => {
                toolCounts.push({ name, count });
              });
            }

            aggregatedMetrics.sessions.push({
              sessionId: metrics.sessionId,
              stage: (patch as any).stage || 'unknown',
              toolUsage: toolCounts
            });
          }
        }
      }

      // Store aggregated metrics in the solution report
      if (aggregatedMetrics) {
        report.claudeMetrics = aggregatedMetrics;
      }
    }
  }
}