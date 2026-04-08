// src/utils/manualLoader.ts
import fs from "fs";
import yaml from "js-yaml";
import semver from "semver";
import path from "path";
import { fileURLToPath } from "url";
import { globSync } from "glob";
import { logger } from "./logger.js";

/**
 * Resolve config path - if relative, resolve from PANTOUM package root
 */
function resolveConfigPath(cfgPath: string): string {
  if (!cfgPath) return cfgPath;
  if (path.isAbsolute(cfgPath)) return cfgPath;

  // Resolve relative paths from package root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Go up from dist/utils to package root (pantoum/)
  const packageRoot = path.resolve(__dirname, '../..');
  return path.join(packageRoot, cfgPath);
}
import type {
  ManualConfig,
  ManualStep,
  Condition,
  PackageCondition,
  PatchFilter,
  VersionCorrection,
  DetectionPattern,
} from "../schema/manualConfig.js";
import type { PatchObject } from "../schema/patchSchema.js";

/**
 * Only those ManualSteps with when==="post" or when==="deterministic" can become real PatchObjects.
 */
type PatchableStep = Extract<ManualStep, { when: "post" | "deterministic" }>;

/**
 * Only the steps with when==="success" go here.
 * We'll extract exactly those from the full ManualStep[].
 */
type SuccessStep = Extract<ManualStep, { when: "success" }>;

/**
 * Context for evaluating conditions that need M365 CLI instruction IDs
 */
export interface ConditionContext {
  instructionIds?: string[];  // M365 CLI instruction IDs present in the report
}

/**
 * Load all manual‐steps and return only the "success" ones.
 */
export function loadSuccessSteps(cfgPath: string): SuccessStep[] {
  const all = loadManualSteps(cfgPath);
  return all.filter((s): s is SuccessStep => s.when === "success" && s.enabled !== false);
}

/**
 * Load all manual‐steps and return only the "deterministic" ones.
 */
export function loadDeterministicSteps(cfgPath: string): PatchableStep[] {
  const all = loadManualSteps(cfgPath);
  return all.filter((s): s is PatchableStep => s.when === "deterministic" && s.enabled !== false);
}

/** Load & parse YAML, return empty array if missing */
export function loadManualSteps(cfgPath: string): ManualStep[] {
  const resolvedPath = resolveConfigPath(cfgPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    logger.info("No manual-steps config found at %s (resolved: %s)", cfgPath, resolvedPath);
    return [];
  }
  const cfg = yaml.load(fs.readFileSync(resolvedPath, "utf8"), { schema: yaml.JSON_SCHEMA }) as ManualConfig;
  return cfg.manualSteps ?? [];
}

/** Load full manual config including AI contexts */
export function loadManualConfig(cfgPath: string): ManualConfig | null {
  const resolvedPath = resolveConfigPath(cfgPath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    logger.info("No manual config found at %s (resolved: %s)", cfgPath, resolvedPath);
    return null;
  }
  logger.info("Loading manual config from %s", resolvedPath);
  const cfg = yaml.load(fs.readFileSync(resolvedPath, "utf8"), { schema: yaml.JSON_SCHEMA }) as ManualConfig;
  logger.info("   → aiContexts: %s", cfg.aiContexts ? Object.keys(cfg.aiContexts).join(', ') : 'none');
  return cfg;
}

/** Load patch filters from config */
export function loadPatchFilters(cfgPath: string): PatchFilter[] {
  const cfg = loadManualConfig(cfgPath);
  return cfg?.patchFilters ?? [];
}

/** Load version corrections from config */
export function loadVersionCorrections(cfgPath: string): VersionCorrection[] {
  const cfg = loadManualConfig(cfgPath);
  return cfg?.versionCorrections ?? [];
}

/** Load excluded packages list from config */
export function loadExcludedPackages(cfgPath: string): string[] {
  const cfg = loadManualConfig(cfgPath);
  return cfg?.excludedPackages ?? [];
}

/** Load detection patterns from config */
export function loadDetectionPatterns(cfgPath: string): Record<string, string[] | DetectionPattern[]> {
  const cfg = loadManualConfig(cfgPath);
  return cfg?.detectionPatterns ?? {};
}

/** Test the `condition` block against package.json and optional context */
export function conditionMet(
  cond: Condition,
  solutionDir: string,
  context?: ConditionContext
): boolean {
  switch (cond.type) {
    case "always":
      return true;

    case "packageVersion": {
      const json = fs.readFileSync(path.join(solutionDir, "package.json"), "utf8");
      const pkg = JSON.parse(json);
      const actual =
        pkg.dependencies?.[cond.packageName] ??
        pkg.devDependencies?.[cond.packageName];
      if (!actual) return false;
      const v = semver.coerce(actual);
      return v != null && semver.satisfies(v, `${(cond as PackageCondition).comparator}${(cond as PackageCondition).version}`);
    }

    case "instructionPresent":
      return context?.instructionIds?.includes(cond.instructionId) ?? false;

    case "instructionAbsent":
      return !(context?.instructionIds?.includes(cond.instructionId) ?? false);

    case "fileExists":
      return fs.existsSync(path.join(solutionDir, cond.path));

    case "fileAbsent":
      return !fs.existsSync(path.join(solutionDir, cond.path));

    case "fileContains": {
      try {
        if (cond.glob) {
          // Match pattern against any file matching the glob
          const files = globSync(cond.path, { cwd: solutionDir });
          const regex = new RegExp(cond.pattern);
          return files.some(file => {
            try {
              const content = fs.readFileSync(path.join(solutionDir, file), "utf8");
              return regex.test(content);
            } catch {
              return false;
            }
          });
        } else {
          const filePath = path.join(solutionDir, cond.path);
          if (!fs.existsSync(filePath)) return false;
          const content = fs.readFileSync(filePath, "utf8");
          return new RegExp(cond.pattern).test(content);
        }
      } catch {
        return false;
      }
    }

    case "all":
      return cond.conditions.every(c => conditionMet(c, solutionDir, context));

    case "any":
      return cond.conditions.some(c => conditionMet(c, solutionDir, context));

    default:
      logger.warn("Unknown condition type: %s", (cond as any).type);
      return false;
  }
}

/**
 * Convert a POST or DETERMINISTIC ManualStep into a real PatchObject.
 * Throws if you pass in anything else (e.g. a "success" step).
 */
export function toPatch(step: ManualStep, solDir: string): PatchObject {
  if (step.when !== "post" && step.when !== "deterministic") {
    throw new Error(`Cannot convert manual-step "${step.id}" (when="${step.when}") into a patch`);
  }
  const s = step as PatchableStep;
  const title = s.title ?? s.description;
  const base = { id: s.id, title, description: s.description } as const;
  const file = path.join(solDir, s.file);

  switch (s.type) {
    case "updateDependency":
    case "removeDependency":
      return {
        ...base,
        type: s.type,
        file,
        depType: s.depType,
        packageName: s.packageName,
        newVersion: s.newVersion!,
      };

    case "runShellCommand":
      return { ...base, type: "runShellCommand", command: s.command! };

    case "updateJsonSnippet":
      return { ...base, type: "updateJsonSnippet", file, jsonSnippet: s.jsonSnippet! };

    case "removeJsonArrayElement":
      return {
        ...base,
        type: "removeJsonArrayElement",
        file,
        jsonPath: s.jsonPath!,
        value: s.value!,
        skipIfMissing: s.skipIfMissing,
      };

    case "addFile":
      return { ...base, type: "addFile", file, content: s.content! };

    case "removeFile":
      return { ...base, type: "removeFile", file };

    case "renameFile":
      return { ...base, type: "renameFile", file, newFileName: s.newFileName! };

    case "updateTextSnippet":
      return {
        ...base,
        type: "updateTextSnippet",
        file,
        fromLine: s.fromLine!,
        toLine: s.toLine!,
        patchLines: s.patchLines!,
      };

    case "regexReplace":
      return {
        ...base,
        type: "regexReplace",
        file,
        rules: s.rules,
        postRules: s.postRules,
        jsonPath: s.jsonPath,
        onlyIfContains: s.onlyIfContains,
      };

    case "addFileFromTemplate":
      // Template-based file creation — load and render template
      // For now, pass through as addFile with template reference in description
      // The actual template rendering happens in the caller or patchApplier
      return {
        ...base,
        type: "addFile",
        file,
        content: `<!-- Template: ${s.template} -->`,  // Placeholder — caller should render
      };

    default:
      // Should never happen if your ManualStep<>PatchObject union stays in sync
      throw new Error(`Unsupported manual-step type: ${(s as any).type}`);
  }
}
