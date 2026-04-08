import { generatePatchesHybrid } from '../patchGeneratorDeterministic.js';
import { applyPatches, ApplyResult } from '../patchApplier.js';
import { conditionMet, toPatch, type ConditionContext } from "../utils/manualLoader.js";
import { logger } from '../utils/logger.js';
import type { PatchObject } from '../schema/patchSchema.js';
import type { M365UpgradeReport } from '../schema/m365UpgradeReport.js';
import type { ManualStep, ManualConfig } from '../schema/manualConfig.js';
import { PatchRepository } from './patchRepository.js';
import { ErrorAnalyzer } from './errorAnalyzer/index.js';
import { DEFAULTS, type EnvInjectionStrategy } from '../constants.js';
import { ClaudeMigrationExecutor } from './claudeMigrationExecutor.js';
import { VersionUpdateService } from './versionUpdateService.js';
import { getRenderedTemplates, clearTemplateLog } from '../utils/templateLoader.js';
import * as fs from 'fs';
import * as path from 'path';

interface GeneratePatchesOptions {
  solutionPath: string;
  upgradeReport: M365UpgradeReport;
  excludePatchIds: string[];
  manualSteps: ManualStep[];
  targetVersion: string;
  solutionName: string;
  manualConfig?: ManualConfig;
  versionUpdateOptions?: import('./versionUpdateService.js').VersionUpdateOptions;
  claudeModel?: string;
  envInjectionStrategy?: EnvInjectionStrategy;
  debugReports?: boolean;
  aiMaxRetries?: number;
  thinkingEffort?: string;
}

export class PatchService {
  public patchRepo: PatchRepository;
  private errorAnalyzer: ErrorAnalyzer;
  private migrationExecutor: ClaudeMigrationExecutor;
  private versionUpdateService: VersionUpdateService;
  private claudeActionCounter = 0;

  constructor(basePath?: string, perSolutionReports: boolean = false) {
    this.patchRepo = new PatchRepository(basePath, perSolutionReports);
    this.errorAnalyzer = new ErrorAnalyzer(this.patchRepo);
    this.migrationExecutor = new ClaudeMigrationExecutor();
    this.versionUpdateService = new VersionUpdateService();
  }

  /**
   * Generate all patches for a solution (auto + manual post)
   */
  async generateAllPatches(options: GeneratePatchesOptions): Promise<PatchObject[]> {
    const {
      solutionPath,
      upgradeReport,
      excludePatchIds,
      manualSteps,
      targetVersion,
      solutionName,
      manualConfig,
      versionUpdateOptions,
      envInjectionStrategy,
    } = options;

    const allPatches: PatchObject[] = [];

    // 1) Generate patches deterministically
    logger.info('✨ Generating patches from upgrade report...');
    const autoPatches = await generatePatchesHybrid(
      excludePatchIds,
      solutionPath,
      upgradeReport,
      5,
      true, // useDeterministic
      envInjectionStrategy ?? 'webpack-patch'
    );

    // 2b) Process patches that require Claude migration analysis (Phase 3)
    // This handles M365 CLI patches like FN015010 (gulpfile removal) that need intelligent migration
    logger.info('PIPELINE:3:migration:event=start');
    clearTemplateLog();
    for (const patch of autoPatches) {
      const patchAny = patch as any;
      if (patchAny.requiresMigrationAnalysis && patchAny.aiContext && manualConfig?.aiContexts) {
        const contextKey = patchAny.aiContext;
        const aiContext = manualConfig.aiContexts[contextKey];

        if (aiContext) {
          logger.info('🔄 Patch %s requires Claude migration analysis (context: %s)', patch.id, contextKey);

          // Enhance context with patch-specific details (e.g., envInjectionDetails, scssDetails)
          // CRITICAL: Pass the actual SPFx target version to prevent Claude from guessing
          const enhancedContext = {
            ...aiContext,
            patchId: patch.id,
            patchTitle: patch.title,
            customPatterns: patchAny.customPatterns,
            gulpfileContent: patchAny.gulpfileContent,
            envInjectionDetails: patchAny.envInjectionDetails,
            scssDetails: patchAny.scssDetails,
            actualTargetVersion: targetVersion,  // The EXACT version to use
          };

          // Use descriptive package names for special contexts
          let packageName = contextKey;
          if (contextKey === 'gulpfile-custom-logic') {
            packageName = 'gulpfile.js (Heft migration)';
          }

          // Execute Claude migration - pass actual SPFx target version
          const runDirectory = this.patchRepo.getSolutionRunDirectory(solutionName);
          const { patches: migrationPatches } = await this.migrationExecutor.executeMigrationWithVerification(
            solutionPath,
            packageName,
            'gulp',  // from (build system)
            targetVersion,  // to = actual SPFx target version (e.g., "1.22.1")
            enhancedContext,
            options.claudeModel || DEFAULTS.CLAUDE_MODEL,
            runDirectory,
            options.debugReports,
            options.aiMaxRetries,
            options.thinkingEffort
          );

          // Add migration patches to auto patches
          migrationPatches.forEach(p => p.stage = 'upgrade');
          autoPatches.push(...migrationPatches);

          logger.info('   ✅ Claude migration completed, generated %d additional patches', migrationPatches.length);
        }
      }
    }

    // Emit Phase 3 complete with templates rendered during migrations
    const migrateTemplates = getRenderedTemplates();
    if (migrateTemplates.length > 0) {
      logger.info('PIPELINE:3:migration:event=complete,templatesRendered=%s', migrateTemplates.join('+'));
    } else {
      logger.info('PIPELINE:3:migration:event=complete,templatesRendered=none');
    }

    // Mark auto patches with upgrade stage
    autoPatches.forEach(patch => {
      patch.stage = patch.stage || 'upgrade';
    });
    allPatches.push(...autoPatches);

    // 2) Manual post-steps (Phase 4)
    // Build condition context with instruction IDs for condition evaluation
    const instructionIds = upgradeReport.map((instr: any) => instr.id).filter(Boolean);
    const conditionContext = { instructionIds };

    const allPostSteps = manualSteps.filter(s => s.when === 'post' && s.enabled !== false);
    const postSteps = allPostSteps.filter(s => conditionMet(s.condition, solutionPath, conditionContext));
    const skippedPostSteps = allPostSteps.length - postSteps.length;
    logger.info('PIPELINE:4:post:event=start');

    for (const step of postSteps) {
      const patches = await this.processManualStep(step, solutionPath, targetVersion, manualConfig, options.claudeModel, options.debugReports, options.aiMaxRetries);
      patches.forEach(p => p.stage = 'post-upgrade');
      allPatches.push(...patches);
    }

    logger.info('PIPELINE:4:post:event=complete,manualStepsRan=%d,manualStepsSkipped=%d',
      postSteps.length, skippedPostSteps);
    
    // 3) Version update patches (package.json and README.md)
    // Use passed versionUpdateOptions if available, otherwise fall back to manualConfig
    const versionUpdateConfig = versionUpdateOptions || manualConfig?.versionUpdates;
    if (versionUpdateConfig?.enabled !== false) {
      logger.info('📝 Generating version update patches...');
      logger.info('   Config values: PnPnvmrc=%s, PnPdevcontainer=%s',
                  versionUpdateConfig?.PnPnvmrc,
                  versionUpdateConfig?.PnPdevcontainer);
      const versionPatches = await this.versionUpdateService.generateVersionUpdatePatches(
        solutionPath,
        targetVersion,
        versionUpdateConfig
      );
      allPatches.push(...versionPatches);
    }

    logger.info('📦 Generated %d total patches:', allPatches.length);
    logger.info('   • Auto-generated: %d', autoPatches.length);
    logger.info('   • Post-upgrade: %d', allPatches.filter(p => p.stage === 'post-upgrade').length);

    // Add patches to repository (preserving any existing patches)
    await this.patchRepo.addPatches(solutionName, targetVersion, allPatches);

    // Filter out migrationReport patches (they're documentation only, not for applying)
    const applicablePatches = allPatches.filter(p => (p as any).type !== 'migrationReport');
    
    if (allPatches.length !== applicablePatches.length) {
      logger.info('   • Filtered out: %d (documentation only)', 
        allPatches.length - applicablePatches.length);
    }

    return applicablePatches;
  }

  /**
   * Generate patches from M365 CLI upgrade report only
   */
  async generatePatches(
    solutionPath: string,
    upgradeReport: M365UpgradeReport,
    excludePatchIds: string[] = [],
    envInjectionStrategy: EnvInjectionStrategy = 'webpack-patch'
  ): Promise<PatchObject[]> {
    return await generatePatchesHybrid(
      excludePatchIds,
      solutionPath,
      upgradeReport,
      5,
      true,
      envInjectionStrategy
    );
  }

  /**
   * Apply patches to a solution and track status
   */
  async applyPatches(
    solutionPath: string,
    patches: PatchObject[],
    solutionName: string,
    targetVersion: string
  ): Promise<ApplyResult[]> {
    const results = await applyPatches(solutionPath, patches);
    
    // Update patch status in repository
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      const result = results[i];
      await this.patchRepo.updatePatchStatus(
        solutionName,
        targetVersion,
        patch.id,
        result.success
      );
    }
    
    return results;
  }

  /**
   * Analyze and generate patches for any error using Claude Code
   */
  async generateErrorPatches(
    solutionPath: string,
    solutionName: string,
    targetVersion: string,
    errorOutput: string,
    errorType: 'upgrade-report' | 'build' | 'test' | 'runtime',
    model: string = DEFAULTS.CLAUDE_MODEL,
    aiFixEslintProperly: boolean = true,
    debugReports?: boolean,
    aiMaxRetries?: number
  ): Promise<PatchObject[]> {
    logger.info('🤖 Analyzing %s errors with Claude Code...', errorType);
    logger.info('   → Error output preview: %s...', errorOutput.substring(0, 200));

    const errorContext = {
      solutionPath,
      solutionName,
      targetVersion,
      errorOutput,
      errorType,
      stage: errorType === 'upgrade-report' ? 'build-fix' : 'post-upgrade',
      aiFixEslintProperly,
      aiMaxRetries
    } as const;

    const analysis = await this.errorAnalyzer.analyzeError(errorContext);
    
    // Get run directory for saving Claude debug files
    const runDirectory = this.patchRepo.getSolutionRunDirectory(solutionName);
    
    // Execute Claude Code analysis
    const result = await this.errorAnalyzer.executeClaudeCodeAnalysis(
      analysis.analysisPrompt,
      analysis.contextFiles,
      solutionPath,
      model,
      errorType,
      runDirectory,
      debugReports
    );
    
    
    // Store Claude's actions in the patch repository for reporting
    const patchesToReturn: PatchObject[] = [...result.patches];
    
    if (result.actions.length > 0) {
      // Count only meaningful edit actions
      const editCount = result.actions.filter(a => 
        a.tool === 'Edit' || a.tool === 'MultiEdit'
      ).length;
      
      // Save actions as a special patch for reporting
      const actionSummaryPatch: PatchObject = {
        id: `CLAUDE-${errorType.toUpperCase()}-ACTIONS-${++this.claudeActionCounter}`,
        title: `Claude Code ${errorType} fixes`,
        description: `Claude applied ${editCount} fixes to resolve ${errorType} errors`,
        type: 'claudeActions',
        file: 'CLAUDE_ACTIONS.json',
        stage: errorType === 'upgrade-report' ? 'build-fix' : 'post-upgrade',
        claudeActions: result.actions,
        claudeSummary: result.claudeSummary,
        errorPrompt: errorOutput,
        ...(result.metrics && { claudeMetrics: result.metrics })
      };
      
      await this.patchRepo.addPatches(solutionName, targetVersion, [actionSummaryPatch]);
      
      // IMPORTANT: Return the action summary patch so buildFixPatches.length > 0
      // This ensures final verification runs after Claude fixes
      patchesToReturn.push(actionSummaryPatch);
    }
    
    // Add generated patches to repository
    if (result.patches.length > 0) {
      await this.patchRepo.addPatches(solutionName, targetVersion, result.patches);
      logger.info('   ✓ Generated %d patches for %s errors', result.patches.length, errorType);
    }
    
    return patchesToReturn;
  }

  /**
   * Load existing patches for a solution
   */
  async loadPatches(solutionName: string, targetVersion: string): Promise<PatchObject[]> {
    return await this.patchRepo.loadPatchesBySolution(solutionName, targetVersion);
  }
  
  /**
   * Process a manual step, checking if it requires migration analysis
   */
  private async processManualStep(
    step: ManualStep,
    solutionPath: string,
    targetVersion: string,
    manualConfig?: ManualConfig,
    claudeModel?: string,
    debugReports?: boolean,
    aiMaxRetries?: number
  ): Promise<PatchObject[]> {
    // Skip success steps as they are handled separately
    if (step.when === 'success') {
      return [];
    }
    
    // Check if this is a step with migration requirements (updateDependency or removeDependency)
    if ('type' in step &&
        (step.type === 'updateDependency' || step.type === 'removeDependency') &&
        'requiresMigrationAnalysis' in step &&
        step.requiresMigrationAnalysis &&
        'aiContext' in step &&
        step.aiContext &&
        manualConfig?.aiContexts) {

      const aiContext = manualConfig.aiContexts[step.aiContext];
      if (aiContext) {
        logger.info('🔄 Manual step %s requires migration analysis for %s', step.id, step.packageName);
        
        // Get current version from package.json
        const packageJsonPath = path.join(solutionPath, 'package.json');
        let fromVersion = 'unknown';
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          fromVersion = packageJson.dependencies?.[step.packageName] || 
                       packageJson.devDependencies?.[step.packageName] || 
                       'unknown';
        } catch (error) {
          logger.warn('   ⚠️  Could not determine current version of %s', step.packageName);
        }
        
        // For removeDependency, we're migrating away from the package
        // For updateDependency, we're upgrading to a new version
        const toVersion = step.type === 'removeDependency' ? 'removed' : (step.newVersion || targetVersion);
        
        // For removeDependency, always perform migration if package exists
        // For updateDependency, check if major version changed
        let shouldMigrate = false;
        if (step.type === 'removeDependency') {
          // Migrate if the package exists (is being removed)
          shouldMigrate = fromVersion !== 'unknown';
        } else {
          // Check if migration is needed (major version change)
          // Strip semver prefixes (^, ~, >=, etc.) before parsing
          const cleanVersion = (v: string) => v.replace(/^[\^~>=<]+/, '');
          const fromMajor = fromVersion === 'unknown' ? 0 : parseInt(cleanVersion(fromVersion).split('.')[0]);
          const toMajor = parseInt(cleanVersion(toVersion).split('.')[0]);
          shouldMigrate = fromMajor < toMajor;
        }
        
        if (shouldMigrate) {
          const migrationAction = step.type === 'removeDependency' ? 'Removing' : 'Upgrading';
          logger.info('PIPELINE:3:migration:triggered=%s(%s)', step.aiContext, aiContext.template || 'auto');
          logger.info('   🤖 Performing Claude migration for %s: %s %s', step.packageName, migrationAction,
                      step.type === 'removeDependency' ? `(v${fromVersion})` : `v${fromVersion} → v${toVersion}`);

          // Execute migration using Claude Code
          const solutionName = path.basename(solutionPath);
          const runDirectory = this.patchRepo.getSolutionRunDirectory(solutionName);

          // Use executeMigrationWithVerification for packages with verification patterns
          // This enables the verification loop (Migration → Verify → Fix → Verify)
          const { patches: migrationPatches, verification } = await this.migrationExecutor.executeMigrationWithVerification(
            solutionPath,
            step.packageName,
            fromVersion,
            toVersion,
            aiContext,
            claudeModel || DEFAULTS.CLAUDE_MODEL,
            runDirectory,
            debugReports,
            aiMaxRetries,
          );

          // Log verification results if available
          if (verification) {
            if (verification.status === 'PASSED') {
              logger.info('   ✅ Migration verification: PASSED (%d/%d checks)',
                verification.finalResult.verified, verification.finalResult.total);
            } else {
              logger.warn('   ⚠️ Migration verification: FAILED after %d iterations', verification.totalIterations);
              if (verification.remainingIssues) {
                for (const issue of verification.remainingIssues) {
                  logger.warn('      → Pattern "%s": %d remaining occurrences',
                    issue.pattern, issue.locations.length);
                }
              }
            }

            // Add verification data to the migration patch - FULL TRACEABILITY
            if (migrationPatches.length > 0 && migrationPatches[0].type === 'claudeActions') {
              const patch = migrationPatches[0] as any;
              if (patch.migrationDetails) {
                patch.migrationDetails.verification = {
                  status: verification.status,
                  totalIterations: verification.totalIterations,
                  totalChecks: verification.finalResult.total,
                  passedChecks: verification.finalResult.verified,

                  // TRACEABLE: All iteration results with tool calls, grep output, and fixes
                  iterations: verification.allResults.map((result, idx) => ({
                    iteration: result.iteration || (idx + 1),
                    timestamp: result.timestamp,
                    verified: result.verified,
                    total: result.total,
                    allPassed: result.allPassed,
                    // Full check details with grep output
                    checks: result.checks.map(c => ({
                      instruction: c.instruction,
                      pattern: c.pattern,
                      command: c.command,
                      status: c.status,
                      grepOutput: c.grepOutput,
                      evidence: c.evidence,
                      findings: c.findings
                    })),
                    // Tool calls made during this verification iteration
                    toolCalls: result.toolCalls?.map(tc => ({
                      timestamp: tc.timestamp,
                      tool: tc.tool,
                      input: tc.input,
                      output: tc.output
                    })),
                    // Fixes applied after this iteration (if not last)
                    fixesApplied: result.fixesApplied
                  })),

                  // Final summary
                  finalResult: {
                    verified: verification.finalResult.verified,
                    total: verification.finalResult.total,
                    allPassed: verification.finalResult.allPassed,
                    checks: verification.finalResult.checks.map(c => ({
                      instruction: c.instruction,
                      pattern: c.pattern,
                      status: c.status,
                      findings: c.findings
                    }))
                  },
                  remainingIssues: verification.remainingIssues
                };
              }
            }
          }

          // Add the original dependency update/remove patch
          const depUpdatePatch = toPatch(step, solutionPath);

          // Return dependency update/remove + migration summary patch
          return [depUpdatePatch, ...migrationPatches];
        } else {
          const reason = fromVersion === 'unknown' ? 'not installed' : 'no major version change';
          logger.info('PIPELINE:3:migration:skipped=%s(%s)', step.aiContext, reason);
        }
      }
    }
    
    // For non-migration steps, just convert to patch
    return [toPatch(step, solutionPath)];
  }

}