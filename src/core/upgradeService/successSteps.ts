import { execa } from 'execa';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../utils/logger.js';
import { stripAnsiCodes } from '../../utils/textUtils.js';
import { loadSuccessSteps, conditionMet } from '../../utils/manualLoader.js';
import { TIMEOUTS, DEFAULTS } from '../../constants.js';
import { RETRY_DEFAULTS } from '../../defaults.js';
import { validateShellCommand } from '../../utils/sanitize.js';
import { PatchService } from '../patchService.js';
import type { PatchObject } from '../../schema/patchSchema.js';
import type { UpgradeOptions } from './index.js';
type BuildSystem = 'heft' | 'gulp';

interface SuccessStepsResult {
  buildErrors: string[];
  buildFixPatches: PatchObject[];
}

/**
 * Detect whether the solution uses Heft or Gulp build system
 */
export function detectBuildSystem(solutionPath: string): BuildSystem {
  try {
    const packageJsonPath = path.join(solutionPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return 'gulp'; // Default to gulp if no package.json
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Check scripts for heft commands
    if (packageJson.scripts) {
      const buildScript = packageJson.scripts.build || '';
      if (buildScript.includes('heft')) {
        logger.info('   → Detected Heft build system');
        return 'heft';
      }
    }

    // Check devDependencies for @rushstack/heft
    if (packageJson.devDependencies?.['@rushstack/heft']) {
      logger.info('   → Detected Heft via @rushstack/heft dependency');
      return 'heft';
    }

    // Check for config/rig.json
    const rigJsonPath = path.join(solutionPath, 'config', 'rig.json');
    if (fs.existsSync(rigJsonPath)) {
      logger.info('   → Detected Heft via rig.json');
      return 'heft';
    }

    logger.info('   → Using Gulp build system (default)');
    return 'gulp';

  } catch (error) {
    logger.warn('   → Could not detect build system, defaulting to gulp');
    return 'gulp';
  }
}

/**
 * Check if output contains Heft-specific error patterns
 * Uses case-insensitive matching to catch all variations
 */
function hasHeftErrors(output: string): boolean {
  const lower = output.toLowerCase();
  return lower.includes('errors in typescript') ||
         lower.includes('error:') ||
         lower.includes('build failed') ||
         lower.includes('heft build failed') ||
         lower.includes('webpack compilation error');
}

/**
 * Check if output contains TypeScript warnings that should be fixed
 * Catches ALL TypeScript warnings (TSxxxx codes) not just specific ones
 * Uses case-insensitive matching to catch all variations
 * Common warnings include:
 * - TS6133: declared but never read
 * - TS6196: declared but never used
 * - TS2564: no initializer, not definitely assigned
 * - TS7053: implicit any from index expression
 * - TS7006: implicit any parameter
 * - TS2322: type assignment errors
 * - TS18048: possibly undefined
 */
function hasTypeScriptWarnings(output: string): boolean {
  // Catch ANY TypeScript warning with format: Warning: path:line:col - (TSxxxx)
  const hasCodedWarnings = /warning:.*\(ts\d+\)/i.test(output);

  // Also catch text-based patterns (older build outputs without codes)
  const hasTextWarnings =
    /warning:.*is declared but.*never (used|read)/i.test(output) ||
    /warning:.*has no initializer and is not definitely assigned/i.test(output);

  if (hasCodedWarnings || hasTextWarnings) {
    // Log detected warnings for visibility
    const matches = output.match(/warning:.*\(ts\d+\)/gi) || [];
    if (matches.length > 0) {
      logger.info('   → TypeScript warnings detected: %d', matches.length);
    }
  }

  return hasCodedWarnings || hasTextWarnings;
}

/**
 * Check if output contains Sass deprecation warnings that should be fixed
 * Common in SPFx upgrades: mixed-decls warning about declarations after nested rules
 */
function hasSassWarnings(output: string): boolean {
  return /Deprecation Warning:.*Sass/i.test(output) ||
         /declarations that appear after nested rules/i.test(output) ||
         /mixed-decls/i.test(output);
}

/**
 * Check if output contains ESLint warnings that should be fixed
 * Particularly important for SPFx-specific rules like React render/unmount pairing
 * Uses case-insensitive matching to catch all variations
 */
function hasEslintWarnings(output: string): boolean {
  // @rushstack/pair-react-dom-render-unmount - memory leak prevention
  // Other common ESLint warnings that indicate issues needing fixes
  return /@rushstack\/pair-react-dom-render-unmount/i.test(output) ||
         /pair the render and unmount calls/i.test(output) ||
         /\[build:lint\].*warning/i.test(output);
}

/**
 * Check if output contains Gulp-specific error patterns
 * Uses case-insensitive matching to catch all variations
 */
function hasGulpErrors(output: string): boolean {
  const lower = output.toLowerCase();
  return lower.includes('error -') ||
         lower.includes('errored after') ||
         lower.includes('task errored') ||
         lower.includes('sub task errored') ||
         lower.includes('task failed');
}

/**
 * Run success steps (npm install, npm run build, etc.) and handle errors
 * Extracted from UpgradeService for better modularity
 */
export async function runSuccessSteps(
  absoluteSolutionPath: string,
  solutionName: string,
  targetVersion: string,
  flags: UpgradeOptions['flags'],
  manualConfig?: string,
  patchService?: PatchService,
  debugReports?: boolean
): Promise<SuccessStepsResult> {
  const successSteps = loadSuccessSteps(manualConfig || DEFAULTS.PATCHES_FILE)
    .filter(s => conditionMet(s.condition, absoluteSolutionPath));

  const buildErrors: string[] = [];
  const buildFixPatches: PatchObject[] = [];

  for (const step of successSteps) {
    logger.info('   🔨 Running: %s', step.description);
    const stepStart = Date.now();

    try {
      if (step.runCommand) {
        // Validate command from config before execution
        validateShellCommand(step.runCommand);
        // Transform command for the detected package manager
        const command = step.runCommand;

        // Execute the build/test command
        const result = await execa(command, {
          cwd: absoluteSolutionPath,
          shell: true,
          timeout: TIMEOUTS.BUILD_COMMAND, // 5 minutes timeout
          reject: false // Don't throw on non-zero exit
        });

        // Special handling for build tools - sometimes return exit code 0 even with errors
        const output = (result.stdout || '') + (result.stderr || '');

        // Check for Gulp errors
        if (step.runCommand.includes('gulp')) {
          if (hasGulpErrors(output) && result.exitCode === 0) {
            logger.warn('   → Gulp reported errors but returned exit code 0, forcing error handling');
            result.exitCode = 1; // Force error handling
          }
        }

        // Check for Heft errors
        if (step.runCommand.includes('heft')) {
          if (hasHeftErrors(output) && result.exitCode === 0) {
            logger.warn('   → Heft reported errors but returned exit code 0, forcing error handling');
            result.exitCode = 1; // Force error handling
          }
        }

        // Check for TypeScript warnings (unused variables/imports left after migration)
        // These should be cleaned up even though they don't fail the build
        // Controlled by aiFixTypeScriptWarnings flag (default: true)
        if ((flags.aiFixTypeScriptWarnings !== false) && hasTypeScriptWarnings(output) && result.exitCode === 0) {
          logger.warn('   → TypeScript warnings found, forcing cleanup');
          result.exitCode = 1; // Force error handling to trigger Claude cleanup
        }

        // Check for Sass deprecation warnings (mixed-decls, etc.)
        // These indicate deprecated SCSS patterns that need fixing
        if (hasSassWarnings(output) && result.exitCode === 0) {
          logger.warn('   → Sass deprecation warnings found (declarations after nested rules), forcing cleanup');
          result.exitCode = 1; // Force error handling to trigger Claude cleanup
        }

        // Check for ESLint warnings (React render/unmount pairing, etc.)
        // These indicate potential memory leaks or code quality issues
        if (hasEslintWarnings(output) && result.exitCode === 0) {
          logger.warn('   → ESLint warnings found (React lifecycle or code quality issues), forcing cleanup');
          result.exitCode = 1; // Force error handling to trigger Claude cleanup
        }

        if (result.exitCode !== 0) {
          // Combine stderr and stdout to ensure we capture all output
          let errorOutput = '';
          if (result.stderr) {
            errorOutput += result.stderr;
          }
          if (result.stdout) {
            if (errorOutput) errorOutput += '\n--- STDOUT ---\n';
            errorOutput += result.stdout;
          }
          if (!errorOutput) {
            errorOutput = 'Unknown build error';
          }

          // Debug logging to understand what we're working with
          logger.info('   → Build command exited with code %d', result.exitCode);
          logger.info('   → Output length: stdout=%d chars, stderr=%d chars',
            result.stdout?.length || 0,
            result.stderr?.length || 0
          );

          // Log first few lines to see the format
          const outputLines = errorOutput.split('\n').slice(0, 10);
          logger.info('   → First 10 lines of output:');
          outputLines.forEach((line, i) => {
            logger.info('     [%d] %s', i, line.substring(0, 100));
          });

          // Apply pattern matching if defined
          if (step.pattern && step.pattern !== 'whatever...') {
            try {
              const regex = new RegExp(step.pattern, 'gm');
              const allMatches = [...errorOutput.matchAll(regex)];

              logger.info('   → Testing pattern "%s" against output', step.pattern);
              logger.info('   → Found %d total matches', allMatches.length);

              if (allMatches.length > 0) {
                // Extract full lines that contain the matches
                const lines = errorOutput.split('\n');
                const matchedLines = lines.filter(line => {
                  // Create new regex for each line to avoid lastIndex issues
                  const lineRegex = new RegExp(step.pattern, 'gm');
                  return lineRegex.test(line);
                });
                errorOutput = matchedLines.join('\n');

                logger.info('   → Pattern matched %d lines:', matchedLines.length);
                matchedLines.slice(0, 5).forEach((line, i) => {
                  logger.info('     [%d] %s', i, line);
                });
                if (matchedLines.length > 5) {
                  logger.info('     ... and %d more lines', matchedLines.length - 5);
                }
              } else {
                // For build commands, don't ignore errors just because pattern didn't match
                const runCommandLower = step.runCommand?.toLowerCase() || '';
                const isBuildCommand = runCommandLower &&
                  (runCommandLower.includes('gulp build') ||
                   runCommandLower.includes('npm run build') ||
                   runCommandLower.includes('heft build'));

                if (isBuildCommand) {
                  logger.warn('   → Build command failed with exit code %d but pattern "%s" did not match output', result.exitCode, step.pattern);
                  logger.warn('   → Treating as build error despite pattern mismatch');
                  // Don't continue - process this as an error
                } else {
                  logger.info('   → Pattern "%s" did not match, treating as success', step.pattern);
                  continue; // No pattern match, not an error we care about
                }
              }
            } catch (regexError) {
              logger.warn('   → Invalid regex pattern "%s": %s, treating as success', step.pattern, regexError);
              continue;
            }
          }
          // If pattern is "whatever..." or not defined, treat all non-zero exit codes as errors
          // This ensures build failures are properly caught and reported

          // Strip ANSI codes before storing
          const cleanError = stripAnsiCodes(errorOutput);
          buildErrors.push(`${step.id}: ${cleanError}`);
          logger.warn('   ❌ %s failed', step.description);

          // Generate patches for build errors using Claude Code (if enabled)
          if (flags.aiFixBuildErrors && patchService) {
            logger.info('   🔧 Analyzing build errors with Claude Code...');
            const claudeStart = Date.now();

            // CRITICAL: Send FULL output to Claude, not pattern-filtered
            // Claude needs complete context to understand and fix errors
            let fullErrorOutput = '';
            if (result.stderr) {
              fullErrorOutput += result.stderr;
            }
            if (result.stdout) {
              if (fullErrorOutput) fullErrorOutput += '\n--- STDOUT ---\n';
              fullErrorOutput += result.stdout;
            }
            if (!fullErrorOutput) {
              fullErrorOutput = errorOutput || 'Unknown build error';
            }

            logger.info('   → Sending %d characters of full output to Claude (not filtered)', fullErrorOutput.length);
            const patches = await patchService.generateErrorPatches(
              absoluteSolutionPath,
              solutionName,
              targetVersion,
              fullErrorOutput, // Send complete output, not filtered
              'build',
              flags.claudeModel,
              flags.aiFixEslintProperly ?? true,
              debugReports,
              flags.aiMaxRetries
            );

            buildFixPatches.push(...patches);
            logger.info('   [Timing] Claude analysis took %ss', ((Date.now() - claudeStart) / 1000).toFixed(1));

            if (patches.length > 0) {
              logger.info('   ✓ Generated %d build fix patches', patches.length);

              // Apply the patches immediately
              const applyResults = await patchService.applyPatches(
                absoluteSolutionPath,
                patches,
                solutionName,
                targetVersion
              );
              const failedPatches = applyResults.filter(r => !r.success);
              if (failedPatches.length > 0) {
                logger.error('   ❌ %d build fix patch(es) failed to apply:', failedPatches.length);
                failedPatches.forEach(f => logger.error('      • %s: %s', f.patch.id, f.message));
              }

              // Check if patches fixed the issue by re-running the command
              logger.info('   🔁 Retrying build...');
              const retryStart = Date.now();
              const retryResult = await execa(command, {
                cwd: absoluteSolutionPath,
                shell: true,
                timeout: TIMEOUTS.BUILD_COMMAND,
                reject: false
              });
              logger.info('   [Timing] Build retry took %ss', ((Date.now() - retryStart) / 1000).toFixed(1));

              if (retryResult.exitCode === 0) {
                logger.info('   ✅ Build succeeded after fixes!');
                // Remove error since it was fixed
                const errorIndex = buildErrors.findIndex(e => e.startsWith(step.id));
                if (errorIndex >= 0) buildErrors.splice(errorIndex, 1);
              } else {
                logger.warn('   ⚠️  Build still has issues after fixes');

                // Check if we should try again
                const maxRetries = flags.aiMaxRetries ?? RETRY_DEFAULTS.AI_MAX_RETRIES;
                let retryCount = 1;

                while (retryResult.exitCode !== 0 && retryCount < maxRetries) {
                  logger.info('   🔄 Attempting fix iteration %d/%d...', retryCount + 1, maxRetries);
                  const iterStart = Date.now();

                  // Get the new error output
                  let newErrorOutput = '';
                  if (retryResult.stderr) newErrorOutput += retryResult.stderr;
                  if (retryResult.stdout) {
                    if (newErrorOutput) newErrorOutput += '\n--- STDOUT ---\n';
                    newErrorOutput += retryResult.stdout;
                  }

                  // Strip ANSI codes before sending to Claude
                  newErrorOutput = stripAnsiCodes(newErrorOutput);

                  // Generate new patches for the new errors
                  const iterativePatches = await patchService.generateErrorPatches(
                    absoluteSolutionPath,
                    solutionName,
                    targetVersion,
                    newErrorOutput,
                    'build',
                    flags.claudeModel,
                    flags.aiFixEslintProperly ?? true,
                    debugReports,
                    flags.aiMaxRetries
                  );

                  if (iterativePatches.length === 0) {
                    logger.warn('   → No additional fixes suggested, stopping iterations');
                    break;
                  }
                  logger.info('   [Timing] Iteration %d Claude analysis took %ss', retryCount + 1, ((Date.now() - iterStart) / 1000).toFixed(1));

                  // Add to the patches array for tracking
                  buildFixPatches.push(...iterativePatches);

                  // Apply the new patches
                  const iterApplyResults = await patchService.applyPatches(
                    absoluteSolutionPath,
                    iterativePatches,
                    solutionName,
                    targetVersion
                  );
                  const iterFailedPatches = iterApplyResults.filter(r => !r.success);
                  if (iterFailedPatches.length > 0) {
                    logger.error('   ❌ %d iteration patch(es) failed to apply:', iterFailedPatches.length);
                    iterFailedPatches.forEach(f => logger.error('      • %s: %s', f.patch.id, f.message));
                  }

                  // Retry the build again
                  logger.info('   🔁 Retrying build (attempt %d/%d)...', retryCount + 1, maxRetries);
                  const iterBuildStart = Date.now();
                  Object.assign(retryResult, await execa(command, {
                    cwd: absoluteSolutionPath,
                    shell: true,
                    timeout: TIMEOUTS.BUILD_COMMAND,
                    reject: false
                  }));
                  logger.info('   [Timing] Iteration %d build retry took %ss', retryCount + 1, ((Date.now() - iterBuildStart) / 1000).toFixed(1));

                  retryCount++;

                  if (retryResult.exitCode === 0) {
                    logger.info('   ✅ Build succeeded after %d fix iterations!', retryCount);
                    // Remove error since it was fixed
                    const errorIndex = buildErrors.findIndex(e => e.startsWith(step.id));
                    if (errorIndex >= 0) buildErrors.splice(errorIndex, 1);
                    break;
                  }
                }

                if (retryResult.exitCode !== 0) {
                  logger.error('   ❌ Build still failing after %d fix attempts', retryCount);
                  // Update the error with the latest output (stripped of ANSI codes)
                  const finalError = retryResult.stderr || retryResult.stdout || 'Unknown build error';
                  const cleanError = stripAnsiCodes(finalError);
                  const errorIndex = buildErrors.findIndex(e => e.startsWith(step.id));
                  if (errorIndex >= 0) {
                    buildErrors[errorIndex] = `${step.id}: ${cleanError}`;
                  }
                }
              }
            }
          }
        } else {
          logger.info('   ✓ %s completed (%ss)', step.description, ((Date.now() - stepStart) / 1000).toFixed(1));
        }
      }
    } catch (error) {
      const errorMsg = `${step.id}: Failed to execute command`;
      buildErrors.push(errorMsg);
      logger.error('   ❌ %s failed to execute', step.description);
    }
  }

  // If we had build fixes applied by Claude, run a final verification of all success steps
  if (buildFixPatches.length > 0 && buildErrors.length > 0) {
    logger.info('');
    logger.info('   🔍 Running final verification after Claude fixes...');

    // Re-run all success steps to verify Claude's fixes
    const remainingErrors: string[] = [];
    for (const step of successSteps) {
      try {
        logger.info('   → Verifying: %s', step.description);
        const verifyCommand = step.runCommand!;
        const verifyResult = await execa(verifyCommand, {
          cwd: absoluteSolutionPath,
          shell: true,
          timeout: TIMEOUTS.BUILD_COMMAND,
          reject: false
        });

        if (verifyResult.exitCode === 0) {
          logger.info('   ✅ %s now passes!', step.description);
        } else {
          // Still failing, keep the error
          const existingError = buildErrors.find(e => e.startsWith(step.id));
          if (existingError) {
            remainingErrors.push(existingError);
            logger.warn('   ❌ %s still failing', step.description);
          }
        }
      } catch (error) {
        // Keep the error if verification fails
        const existingError = buildErrors.find(e => e.startsWith(step.id));
        if (existingError) {
          remainingErrors.push(existingError);
        }
      }
    }

    // Update buildErrors with only the remaining errors
    buildErrors.length = 0;
    buildErrors.push(...remainingErrors);

    if (buildErrors.length === 0) {
      logger.info('   🎉 All build steps now pass after Claude fixes!');
    } else {
      logger.warn('   ⚠️  %d build step(s) still failing after Claude fixes', buildErrors.length);
    }
  }

  // Emit Phase 7 (Success checks) summary
  const checksRun = successSteps.length;
  const checksPassed = checksRun - buildErrors.length;
  logger.info('PIPELINE:7:success:event=complete,checksRun=%d,checksPassed=%d', checksRun, checksPassed);

  return { buildErrors, buildFixPatches };
}