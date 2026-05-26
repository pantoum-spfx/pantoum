// src/patchGeneratorDeterministic.ts
import type { PatchObject } from './schema/patchSchema.js';
import { logger } from './utils/logger.js';
import { normaliseRunShellToAddFile } from './utils/normaliseRunShellToAddFile.js';
import path from 'path';
import fs from 'fs';
import { DEFAULTS } from './constants.js';
import {
  loadPatchFilters,
  loadVersionCorrections,
  loadDeterministicSteps,
  loadDetectionPatterns,
  conditionMet,
  toPatch,
} from './utils/manualLoader.js';
import type { DetectionPattern } from './schema/manualConfig.js';

/**
 * Detect custom scripts in package.json that need migration.
 * Reads standard scripts list from YAML config.
 * Returns list of custom script names that contain gulp commands.
 */
function detectCustomGulpScripts(solutionPath: string, cfgPath: string): string[] {
  try {
    const packageJsonPath = path.join(solutionPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return [];

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};

    // Load standard scripts from config
    const patterns = loadDetectionPatterns(cfgPath);
    const standardScripts = (patterns.standardScripts as string[]) ?? ['build', 'clean', 'test', 'start', 'eject-webpack'];

    const customScripts: string[] = [];
    for (const [name, command] of Object.entries(scripts)) {
      // Skip standard scripts - M365 CLI handles these
      if (standardScripts.includes(name)) continue;

      // Check if script contains gulp commands
      if (typeof command === 'string' && command.includes('gulp')) {
        customScripts.push(name);
      }
    }

    return customScripts;
  } catch (error) {
    logger.warn('Could not detect custom gulp scripts:', error);
    return [];
  }
}

/**
 * Detect custom patterns in gulpfile.js that need Claude migration.
 * Reads patterns from YAML config.
 * Returns list of detected pattern names.
 */
function detectCustomGulpfilePatterns(solutionPath: string, cfgPath: string): { patterns: string[]; content: string } {
  try {
    const gulpfilePath = path.join(solutionPath, 'gulpfile.js');
    if (!fs.existsSync(gulpfilePath)) return { patterns: [], content: '' };

    const content = fs.readFileSync(gulpfilePath, 'utf-8');

    // Load patterns from config
    const allPatterns = loadDetectionPatterns(cfgPath);
    const configPatterns = (allPatterns.customGulpfilePatterns as DetectionPattern[]) ?? [];

    const detectedPatterns: string[] = [];
    for (const check of configPatterns) {
      const regex = new RegExp(check.pattern, check.flags);
      if (regex.test(content)) {
        detectedPatterns.push(check.name);
      }
    }

    return { patterns: detectedPatterns, content };
  } catch (error) {
    logger.warn('Could not detect custom gulpfile patterns:', error);
    return { patterns: [], content: '' };
  }
}

// Define the instruction object interface locally
interface InstructionObject {
  id: string;
  title: string;
  description: string;
  file: string;
  resolution: string;
  resolutionType: string;
  position?: {
    line?: number;
    character?: number;
  };
}

/**
 * Generates patches deterministically based on upgrade report patterns.
 * Falls back to LLM only for complex/unknown patterns.
 */
class DeterministicPatchGenerator {

  /**
   * Generate a patch from an upgrade instruction using deterministic rules
   * @returns PatchObject if can be generated deterministically, null if needs LLM
   */
  generatePatch(instruction: InstructionObject, solutionPath: string): PatchObject | null {
    try {
      const absoluteFile = this.getAbsoluteFilePath(instruction.file, solutionPath);

      // Base patch properties
      const basePatch = {
        id: instruction.id,
        title: instruction.title,
        description: instruction.description,
      };

      let patch: PatchObject | null = null;

      // Handle based on resolutionType
      switch (instruction.resolutionType) {
        case 'cmd':
          patch = this.handleCommandResolution(instruction, basePatch, absoluteFile, solutionPath);
          break;

        case 'json':
          patch = this.handleJsonResolution(instruction, basePatch, absoluteFile);
          break;

        case 'text':
        case 'scss':
        case 'js':
          patch = this.handleTextResolution(instruction, basePatch, absoluteFile);
          break;

        default:
          logger.info(`Unknown resolutionType: ${instruction.resolutionType} for ${instruction.id}`);
          return null;
      }

      // Apply normalization (e.g., convert cat commands to addFile)
      if (patch) {
        patch = normaliseRunShellToAddFile(patch, solutionPath);
      }

      return patch;
    } catch (error) {
      logger.error(`Error generating deterministic patch for ${instruction.id}: ${error}`);
      return null;
    }
  }

  private getAbsoluteFilePath(file: string, solutionPath: string): string {
    if (file.startsWith('./')) {
      file = file.substring(2);
    }
    return path.join(solutionPath, file);
  }

  private handleCommandResolution(
    instruction: InstructionObject,
    basePatch: any,
    absoluteFile: string,
    solutionPath: string
  ): PatchObject | null {
    const resolution = instruction.resolution.trim();

    // NPM install commands
    const npmInstallMatch = resolution.match(/^npm\s+(i|install)\s+(-S|-D|--save|--save-dev|-SE|-DE)\s+(.+)$/);
    if (npmInstallMatch) {
      const flagPart = npmInstallMatch[2];
      const packagePart = npmInstallMatch[3];

      // Extract package name and version
      const atIndex = packagePart.lastIndexOf('@');
      if (atIndex > 0) { // Must have @ for version, and not be at start (scoped packages)
        const packageName = packagePart.substring(0, atIndex);
        const newVersion = packagePart.substring(atIndex + 1);

        return {
          ...basePatch,
          type: 'updateDependency',
          file: absoluteFile,
          depType: flagPart.includes('D') ? 'devDependencies' : 'dependencies',
          packageName,
          newVersion
        };
      }
    }

    // NPM uninstall commands
    const npmUninstallMatch = resolution.match(/^npm\s+(un|uninstall|remove|rm)\s+(-S|-D|--save|--save-dev)\s+(.+)$/);
    if (npmUninstallMatch) {
      const flagPart = npmUninstallMatch[2];
      const packageName = npmUninstallMatch[3].trim();

      return {
        ...basePatch,
        type: 'removeDependency',
        file: absoluteFile,
        depType: flagPart.includes('D') ? 'devDependencies' : 'dependencies',
        packageName
      };
    }


    // Remove file command (Unix: rm)
    // Note: filePath from resolution is relative to solution root, not to instruction.file
    const rmMatch = resolution.match(/^rm\s+(-f\s+)?"?([^"]+)"?$/);
    if (rmMatch) {
      const filePath = rmMatch[2];

      return {
        ...basePatch,
        type: 'removeFile',
        file: this.getAbsoluteFilePath(filePath, solutionPath)
      };
    }

    // Remove file command (PowerShell: Remove-Item)
    // Note: filePath from resolution is relative to solution root, not to instruction.file
    const removeItemMatch = resolution.match(/^Remove-Item\s+"?([^"]+)"?$/);
    if (removeItemMatch) {
      const filePath = removeItemMatch[1];

      return {
        ...basePatch,
        type: 'removeFile',
        file: this.getAbsoluteFilePath(filePath, solutionPath)
      };
    }

    // PowerShell here-string file creation: @'...'@ | Out-File -FilePath "file"
    // Note: filePath from resolution is relative to solution root, not to instruction.file
    const outFileMatch = resolution.match(/@'\s*([\s\S]*?)\s*'@\s*\|\s*Out-File\s+-FilePath\s+"?([^"]+)"?$/);
    if (outFileMatch) {
      let content = outFileMatch[1]
        .replace(/\\$/gm, '')      // remove trailing \ at end of each line
        .replace(/\\"/g, '"')      // unescape quotes
        .replace(/\\\\/g, '\\');   // unescape backslashes
      const filePath = outFileMatch[2];

      return {
        ...basePatch,
        type: 'addFile',
        file: this.getAbsoluteFilePath(filePath, solutionPath),
        content: content.trim() + '\n'
      };
    }

    // Default to shell command for other commands
    return {
      ...basePatch,
      type: 'runShellCommand',
      command: resolution
    };
  }

  private handleJsonResolution(
    instruction: InstructionObject,
    basePatch: any,
    absoluteFile: string
  ): PatchObject {
    // Check if this is actually a file creation based on description
    const isFileCreation = instruction.description.toLowerCase().includes('add the') ||
                          instruction.description.toLowerCase().includes('create') ||
                          (instruction.file.includes('.vscode/') && !fs.existsSync(absoluteFile));

    let jsonSnippet: any;

    try {
      if (instruction.resolution) {
        logger.info(`Processing JSON resolution for ${instruction.id}`);
        logger.info(`Original resolution: ${instruction.resolution}`);

        // The resolution comes as an escaped JSON string like "{\\\n  \"key\": \"value\"\\\n}"
        // Each line ends with \ (line continuation) followed by actual newline
        // We need to: remove trailing \, unescape quotes, keep the actual newlines
        let unescapedResolution = instruction.resolution
          .replace(/\\$/gm, '')       // Remove trailing \ at end of each line
          .replace(/\\"/g, '"');      // Replace \" with "

        logger.info(`Unescaped resolution: ${unescapedResolution}`);
        jsonSnippet = JSON.parse(unescapedResolution);
        logger.info(`Parsed JSON snippet:`, jsonSnippet);
      } else {
        jsonSnippet = {};
      }
    } catch (error) {
      logger.warn(`Failed to parse JSON resolution for ${instruction.id}: ${error}`);
      logger.warn(`Original resolution: ${instruction.resolution}`);
      jsonSnippet = {};
    }

    // Special handling for remove operations
    if (instruction.description.toLowerCase().includes('remove') &&
        instruction.title.toLowerCase().includes('exclude') &&
        JSON.stringify(jsonSnippet) === '{"exclude":[]}') {
      jsonSnippet = { exclude: null };
    }

    // Handle other remove patterns
    if (instruction.description.toLowerCase().startsWith('remove ')) {
      // Check if setting empty array, might need to set to null
      for (const key in jsonSnippet) {
        if (Array.isArray(jsonSnippet[key]) && jsonSnippet[key].length === 0) {
          jsonSnippet[key] = null;
        }
      }
    }

    // If this is a file creation, return addFile patch instead
    if (isFileCreation) {
      const content = JSON.stringify(jsonSnippet, null, 2) + '\n';
      return {
        ...basePatch,
        type: 'addFile',
        file: absoluteFile,
        content
      };
    }

    return {
      ...basePatch,
      type: 'updateJsonSnippet',
      file: absoluteFile,
      jsonSnippet
    };
  }

  private handleTextResolution(
    instruction: InstructionObject,
    basePatch: any,
    absoluteFile: string
  ): PatchObject {
    // Check if this is actually a file creation based on description
    const isFileCreation = instruction.description.toLowerCase().includes('create') ||
                          instruction.title.toLowerCase().includes('create');

    if (isFileCreation) {
      // This should be an addFile patch, not updateTextSnippet
      let content = instruction.resolution
        .replace(/\\$/gm, '')      // remove trailing \ at end of each line
        .replace(/\\"/g, '"');     // unescape quotes

      return {
        ...basePatch,
        type: 'addFile',
        file: absoluteFile,
        content: content + '\n'
      };
    }

    // Regular text update
    let patchLines = instruction.resolution.split('\n')
      .map(line => line.replace(/\\$/g, ''));  // remove trailing backslashes

    // Special handling for SCSS files - ensure imports have semicolons
    if (instruction.resolutionType === 'scss') {
      patchLines = patchLines.map(line => {
        // Check if this is an @import statement without a semicolon
        const trimmed = line.trim();
        if (trimmed.startsWith('@import') && !trimmed.endsWith(';')) {
          return line + ';';
        }
        return line;
      });
    }

    // Determine line numbers
    // Default to line 1 (beginning of file) when no position is specified
    // Using 1-indexed line numbers for clarity
    let fromLine = 1;
    let toLine = 1;

    if (instruction.position?.line !== undefined) {
      // M365 CLI provides 0-indexed line numbers, convert to 1-indexed
      fromLine = Math.max(1, instruction.position.line);
      toLine = fromLine;
    }

    return {
      ...basePatch,
      type: 'updateTextSnippet',
      file: absoluteFile,
      fromLine,
      toLine,
      patchLines
    };
  }

  /**
   * Check if an instruction can be handled deterministically
   */
  canHandleDeterministically(instruction: InstructionObject): boolean {
    // Always handle json, text, scss, js deterministically
    if (['json', 'text', 'scss', 'js'].includes(instruction.resolutionType)) {
      return true;
    }

    // For cmd type, check if it matches known patterns
    if (instruction.resolutionType === 'cmd') {
      const resolution = instruction.resolution.trim();

      // Check for npm commands
      if (resolution.match(/^npm\s+(i|install|un|uninstall|remove|rm)\s+/)) {
        return true;
      }

      // Check for cat/rm commands (Unix)
      if (resolution.match(/^(cat\s*>|rm\s+)/)) {
        return true;
      }

      // Check for PowerShell commands (Remove-Item, Out-File)
      if (resolution.match(/^Remove-Item\s+/) || resolution.match(/@'[\s\S]*'@\s*\|\s*Out-File/)) {
        return true;
      }

      // Simple shell commands can be handled
      return true;
    }

    return false;
  }
}

/**
 * Generate patches using deterministic approach only
 * @param excludePatchIds IDs to skip
 * @param solutionDir absolute path to the SPFx solution folder
 * @param rawJsonReport array from m365 spfx project upgrade --output json
 * @param batchSize unused parameter (kept for compatibility)
 * @param useDeterministic unused parameter (kept for compatibility)
 * @param envInjectionStrategy how to handle env vars in Heft migration (now YAML-driven for webpack-patch)
 * @returns Array of patches
 */
export async function generatePatchesHybrid(
  excludePatchIds: string[],
  solutionDir: string,
  rawJsonReport: unknown[],
  _batchSize: number = 1,
  _useDeterministic: boolean = true,
  envInjectionStrategy: string = 'webpack-patch'
): Promise<PatchObject[]> {
  const cfgPath = DEFAULTS.PATCHES_FILE;

  // Filter out excluded IDs
  logger.info(`Excluding patches with IDs: ${excludePatchIds}`);

  // Extract instruction IDs for condition evaluation
  const instructionIds = rawJsonReport.map((instr: any) => instr.id).filter(Boolean);
  const conditionContext = { instructionIds };

  // Load patch filters from YAML config
  const patchFilters = loadPatchFilters(cfgPath);

  // Build set of patch IDs to exclude based on filters
  const filterExcludeIds = new Set<string>();
  for (const filter of patchFilters) {
    const hasExact = !!filter.targetPatchId;
    const hasPrefix = !!filter.targetPatchIdPrefix;
    if (hasExact === hasPrefix) {
      throw new Error(`Patch filter ${filter.id} must set exactly one of targetPatchId or targetPatchIdPrefix`);
    }
    if (filter.action !== 'exclude' || !conditionMet(filter.condition, solutionDir, conditionContext)) {
      continue;
    }
    if (hasExact) {
      filterExcludeIds.add(filter.targetPatchId!);
      logger.info(`Patch filter ${filter.id}: excluding ${filter.targetPatchId} — ${filter.description}`);
    } else {
      // Prefix match — exclude every instruction whose ID starts with the prefix.
      const matched = instructionIds.filter((id: string) => id.startsWith(filter.targetPatchIdPrefix!));
      for (const id of matched) {
        filterExcludeIds.add(id);
      }
      logger.info(`Patch filter ${filter.id}: excluding ${matched.length} patch(es) matching prefix ${filter.targetPatchIdPrefix} [${matched.join(', ')}] — ${filter.description}`);
    }
  }

  const includedReports = rawJsonReport.filter((instr: any) => {
    if (excludePatchIds.includes(instr.id)) {
      logger.warn(`Skipping excluded patch ${instr.id}`);
      return false;
    }
    // Apply config-driven patch filters
    if (filterExcludeIds.has(instr.id)) {
      logger.info(`Skipping filtered patch ${instr.id}`);
      return false;
    }
    return true;
  });

  const allPatches: PatchObject[] = [];
  const generator = new DeterministicPatchGenerator();

  logger.info(`Processing ${includedReports.length} instructions with deterministic approach`);

  // Detect custom scripts and gulpfile patterns (still useful for logging)
  const customScripts = detectCustomGulpScripts(solutionDir, cfgPath);
  const gulpfileAnalysis = detectCustomGulpfilePatterns(solutionDir, cfgPath);

  if (customScripts.length > 0) {
    logger.info(`Detected ${customScripts.length} custom gulp scripts: ${customScripts.join(', ')}`);
  }
  if (gulpfileAnalysis.patterns.length > 0) {
    logger.info(`Detected custom gulpfile patterns: ${gulpfileAnalysis.patterns.join(', ')}`);
  }

  // Process each instruction deterministically
  for (const instr of includedReports) {
    const instrObj = instr as any;
    let patch = generator.generatePatch(instrObj, solutionDir);

    if (patch) {
      // Apply normalization (e.g., convert cat commands to addFile)
      patch = normaliseRunShellToAddFile(patch, solutionDir);
      allPatches.push(patch);
      logger.info(`Generated deterministic patch for ${instrObj.id}`);
    } else {
      logger.warn(`Could not generate patch for ${instrObj.id} - unsupported pattern`);
    }
  }

  // Process YAML-driven deterministic steps
  if (envInjectionStrategy !== 'none') {
    const deterministicSteps = loadDeterministicSteps(cfgPath);
    let deterministicCount = 0;

    for (const step of deterministicSteps) {
      if (conditionMet(step.condition, solutionDir, conditionContext)) {
        try {
          const patch = toPatch(step, solutionDir);
          patch.stage = 'upgrade';
          allPatches.push(patch);
          deterministicCount++;
          logger.info(`Generated YAML deterministic patch ${step.id}: ${step.description}`);
        } catch (error) {
          logger.warn(`Failed to convert deterministic step ${step.id} to patch: ${error}`);
        }
      }
    }

    if (deterministicCount > 0) {
      logger.info(`Generated ${deterministicCount} YAML-driven deterministic patches`);
    }
  } else {
    // Even with envInjectionStrategy=none, still process non-env deterministic steps
    const deterministicSteps = loadDeterministicSteps(cfgPath);
    let deterministicCount = 0;

    for (const step of deterministicSteps) {
      // Skip ENV* steps when strategy is 'none'
      if (step.id.startsWith('ENV')) continue;

      if (conditionMet(step.condition, solutionDir, conditionContext)) {
        try {
          const patch = toPatch(step, solutionDir);
          patch.stage = 'upgrade';
          allPatches.push(patch);
          deterministicCount++;
          logger.info(`Generated YAML deterministic patch ${step.id}: ${step.description}`);
        } catch (error) {
          logger.warn(`Failed to convert deterministic step ${step.id} to patch: ${error}`);
        }
      }
    }

    if (deterministicCount > 0) {
      logger.info(`Generated ${deterministicCount} YAML-driven deterministic patches (env injection disabled)`);
    }
  }

  // Post-process patches to fix invalid versions from M365 CLI
  fixInvalidVersions(allPatches, cfgPath);

  logger.info(`Deterministic processing complete: ${allPatches.length}/${includedReports.length} patches generated`);
  return allPatches;
}

/**
 * Fix invalid package versions recommended by M365 CLI.
 * Reads corrections from YAML config.
 */
function fixInvalidVersions(patches: PatchObject[], cfgPath: string): void {
  const corrections = loadVersionCorrections(cfgPath);
  if (corrections.length === 0) return;

  // Build lookup map from corrections
  const versionFixes: Record<string, Record<string, string>> = {};
  for (const corr of corrections) {
    if (!versionFixes[corr.packageName]) {
      versionFixes[corr.packageName] = {};
    }
    versionFixes[corr.packageName][corr.badVersion] = corr.correctedVersion;
  }

  for (const patch of patches) {
    const patchAny = patch as any;

    // Fix updateDependency patches
    if (patchAny.packageName && patchAny.newVersion) {
      const fixes = versionFixes[patchAny.packageName];
      if (fixes && fixes[patchAny.newVersion]) {
        const oldVersion = patchAny.newVersion;
        const newVersion = fixes[patchAny.newVersion];
        logger.info(`Fixing invalid version: ${patchAny.packageName} ${oldVersion} → ${newVersion}`);
        patchAny.newVersion = newVersion;

        // Also update the patch description if it contains the version
        if (patch.description) {
          patch.description = patch.description.replace(oldVersion, newVersion);
        }
      }
    }

    // Fix jsonSnippet patches that contain dependency versions
    if (patchAny.jsonSnippet && typeof patchAny.jsonSnippet === 'object') {
      fixVersionsInObject(patchAny.jsonSnippet, versionFixes);
    }
  }
}

/**
 * Recursively fix versions in a JSON object
 */
function fixVersionsInObject(obj: any, fixes: Record<string, Record<string, string>>): void {
  if (!obj || typeof obj !== 'object') return;

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    // Check if this key is a package name we need to fix
    if (fixes[key] && typeof value === 'string' && fixes[key][value]) {
      logger.info(`Fixing invalid version in JSON: ${key} ${value} → ${fixes[key][value]}`);
      obj[key] = fixes[key][value];
    }

    // Recurse into nested objects
    if (typeof value === 'object') {
      fixVersionsInObject(value, fixes);
    }
  }
}
