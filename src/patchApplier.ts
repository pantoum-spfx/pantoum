// src/patchApplier.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { PatchObject } from './schema/patchSchema.js';
import { logger } from './utils/logger.js';
import { stripJsonComments } from './utils/textUtils.js';
import { DEFAULTS } from './constants.js';
import { validateShellCommand } from './utils/sanitize.js';

export interface ApplyResult {
  patch: PatchObject;
  success: boolean;
  message?: string;
  diff?: string;
}

function validateAndResolvePath(filePath: string, solutionPath: string): string {
  const resolvedSolutionPath = fs.realpathSync(path.resolve(solutionPath));

  let resolvedFilePath: string;
  if (path.isAbsolute(filePath)) {
    resolvedFilePath = path.resolve(filePath);
  } else {
    resolvedFilePath = path.resolve(solutionPath, filePath);
  }

  // Resolve symlinks to prevent traversal attacks.
  // For new files (addFile), check the parent directory instead.
  if (fs.existsSync(resolvedFilePath)) {
    resolvedFilePath = fs.realpathSync(resolvedFilePath);
  } else {
    const parentDir = path.dirname(resolvedFilePath);
    if (fs.existsSync(parentDir)) {
      const realParent = fs.realpathSync(parentDir);
      if (!realParent.startsWith(resolvedSolutionPath)) {
        throw new Error(`File path ${filePath} is outside solution directory ${solutionPath}`);
      }
      return path.join(realParent, path.basename(resolvedFilePath));
    }
  }

  if (!resolvedFilePath.startsWith(resolvedSolutionPath)) {
    throw new Error(`File path ${filePath} is outside solution directory ${solutionPath}`);
  }
  return resolvedFilePath;
}

export async function applyPatches(
  solutionPath: string,
  patches: PatchObject[]
): Promise<ApplyResult[]> {
  logger.info(`Starting to apply ${patches.length} patch(es) to ${solutionPath}`);
  const results: ApplyResult[] = [];

  // Count skipped patches
  const skippedPatches: PatchObject[] = [];

  // Apply content-matched removals (removeTextSnippet) and eslint-rule preservation
  // (preserveEslintRules) in a FINAL pass: line-anchored adds/replaces run first on
  // un-shifted line numbers, and preserveEslintRules must run after the M365 CLI
  // finding that CREATES eslint.config.js — making the result order-independent.
  const isFinalPass = (t: string) => t === 'removeTextSnippet' || t === 'preserveEslintRules';
  const orderedPatches: PatchObject[] = [
    ...patches.filter(p => !isFinalPass(p.type)),
    ...patches.filter(p => isFinalPass(p.type)),
  ];

  for (const patch of orderedPatches) {
    logger.info(`→ Processing patch ${patch.id}: ${patch.title || patch.description || 'No description'} (type=${patch.type})`);
    let didModify = false;
    let success = false;

    // Skip claudeActions patches - they're documentation only
    if (patch.type === 'claudeActions') {
      logger.info(`→ Claude actions already applied: ${patch.description}`);
      results.push({ patch, success: true });
      continue;
    }

    try {
      switch (patch.type) {
        /* ────────────── JSON‐based dependency patch ────────────── */
        case 'updateDependency':
        case 'removeDependency': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          if (!resolvedFile.endsWith('package.json')) {
            throw new Error(`Dependency patch only supported on package.json, not: ${resolvedFile}`);
          }
          const pkgText = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          const pkgJson = JSON.parse(stripJsonComments(pkgText));
          const scope =
            patch.depType === 'devDependencies' ? 'devDependencies' : 'dependencies';
          pkgJson[scope] = pkgJson[scope] ?? {};

          if (patch.type === 'removeDependency') {
            delete pkgJson[scope][patch.packageName];
          } else {
            pkgJson[scope][patch.packageName] = patch.newVersion;
          }

          const newText = JSON.stringify(pkgJson, null, 2) + '\n';
          fs.writeFileSync(resolvedFile, newText, DEFAULTS.ENCODING);
          didModify = true;
          success = true;
          break;
        }

        case 'updateJsonSnippet': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          const text = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          // Strip comments before parsing to handle JSON files with comments
          const cleanedText = stripJsonComments(text);
          const original = JSON.parse(cleanedText);
          const merged = deepMerge(original, patch.jsonSnippet);
          const newText = JSON.stringify(merged, null, 2) + '\n';
          fs.writeFileSync(resolvedFile, newText, DEFAULTS.ENCODING);
          didModify = true;
          success = true;
          break;
        }

        case 'runShellCommand': {
          validateShellCommand(patch.command);
          execSync(patch.command, {
            stdio: 'pipe',
            cwd: solutionPath,
            shell: process.platform === 'win32'
              ? process.env.COMSPEC || 'cmd.exe'
              : process.env.SHELL || '/bin/sh',
          });
          didModify = true;
          success = true;
          break;
        }

        case 'addFile': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          const dir = path.dirname(resolvedFile);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(resolvedFile, patch.content, DEFAULTS.ENCODING);
          didModify = true;
          success = true;
          break;
        }

        case 'removeFile': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          if (fs.existsSync(resolvedFile)) fs.unlinkSync(resolvedFile);
          didModify = true;
          success = true;
          break;
        }

        case 'renameFile': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          const resolvedNewFile = validateAndResolvePath(patch.newFileName, solutionPath);
          fs.renameSync(resolvedFile, resolvedNewFile);
          didModify = true;
          success = true;
          break;
        }

        case 'updateTextSnippet': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          const text = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          const lines = text.split('\n');

          // Handle edge case: fromLine=0 means insert at beginning
          // fromLine=1 means first line (standard 1-indexed)
          const insertIndex = patch.fromLine === 0 ? 0 : patch.fromLine - 1;
          const removeCount = Math.max(0, patch.toLine - patch.fromLine);

          // When fromLine=0 and toLine=0, we're inserting at the beginning
          // removeCount will be 0, but we don't want to remove the first line
          const elementsToRemove = patch.fromLine === 0 && patch.toLine === 0 ? 0 : removeCount + 1;

          lines.splice(insertIndex, elementsToRemove, ...patch.patchLines);
          const newText = lines.join('\n');
          fs.writeFileSync(resolvedFile, newText, DEFAULTS.ENCODING);
          didModify = true;
          success = true;
          break;
        }

        case 'appendTextSnippet': {
          // Append lines at the end of the file. Used for M365 CLI "To <file> add
          // <entry>" instructions, which carry no position: routing those through
          // updateTextSnippet defaulted to fromLine=toLine=1 and REPLACED the first
          // line of the file (e.g. it deleted the "# Logs" header of .gitignore).
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          const text = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          const lines = text.split('\n');
          const existing = new Set(lines.map((l: string) => l.trim()));

          const toAppend = patch.patchLines.filter((line: string) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !existing.has(trimmed);
          });

          if (toAppend.length === 0) {
            // Already present — nothing to do, but not a failure.
            success = true;
            break;
          }

          // Keep a single trailing newline rather than accumulating blank lines.
          while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
          }

          lines.push(...toAppend, '');
          fs.writeFileSync(resolvedFile, lines.join('\n'), DEFAULTS.ENCODING);
          didModify = true;
          success = true;
          break;
        }

        case 'regexReplace': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          if (patch.jsonPath && patch.jsonPath.length > 0) {
            // JSON mode: navigate to jsonPath, apply regex to string values
            const text = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
            const json = JSON.parse(text);
            let target: any = json;
            for (const key of patch.jsonPath) {
              if (target == null || typeof target !== 'object') break;
              target = target[key];
            }
            if (target && typeof target === 'object') {
              for (const [key, value] of Object.entries(target)) {
                if (typeof value === 'string' && (!patch.onlyIfContains || value.includes(patch.onlyIfContains))) {
                  let result = value;
                  for (const rule of patch.rules) {
                    result = result.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement);
                  }
                  for (const rule of patch.postRules ?? []) {
                    result = result.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement);
                  }
                  (target as any)[key] = result;
                }
              }
            }
            fs.writeFileSync(resolvedFile, JSON.stringify(json, null, 2) + '\n', DEFAULTS.ENCODING);
          } else {
            // Plain text mode: apply regex rules to entire file content
            let content = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
            for (const rule of patch.rules) {
              content = content.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement);
            }
            for (const rule of patch.postRules ?? []) {
              content = content.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement);
            }
            fs.writeFileSync(resolvedFile, content, DEFAULTS.ENCODING);
          }
          didModify = true;
          success = true;
          break;
        }

        case 'removeJsonArrayElement': {
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          // 1. load & parse
          const text = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          // Strip comments before parsing to handle JSON files with comments
          const cleanedText = stripJsonComments(text);
          const json = JSON.parse(cleanedText);

          // 2. drill into the array’s parent
          let cur: any = json;
          for (let i = 0; i + 1 < patch.jsonPath.length; i++) {
            cur = cur?.[patch.jsonPath[i]];
            if (cur == null) break;
          }
          const arrKey = patch.jsonPath[patch.jsonPath.length - 1];

          /* If the array isn't there and skipIfMissing is set, no-op */
          if (!Array.isArray(cur?.[arrKey])) {
            if (patch.skipIfMissing) {
              logger.info(
                `— skipIfMissing: array ${patch.jsonPath.join('.')} not found`
              );
              success = true; // Mark as successful but no changes made
              break;
            }
            throw new Error(
              `No array at path ${patch.jsonPath.join('.')} in ${resolvedFile}`
            );
          }

          // 3. remove the element
          const beforeLen = cur[arrKey].length;
          cur[arrKey] = cur[arrKey].filter((x: any) => x !== patch.value);

          if (beforeLen === cur[arrKey].length) {
            if (patch.skipIfMissing) {
              logger.info(
                `— skipIfMissing: "${patch.value}" already absent from ${patch.jsonPath.join(
                  '.'
                )}`
              );
              success = true; // Mark as successful but no changes made
              break;
            }
            throw new Error(
              `"${patch.value}" not found in ${patch.jsonPath.join('.')}`
            );
          }

          // 4. write back
          const newText = JSON.stringify(json, null, 2) + '\n';
          fs.writeFileSync(resolvedFile, newText, DEFAULTS.ENCODING);
          didModify = true;
          success = true;
          break;
        }
        case 'removeTextSnippet': {
          // Content-matched line deletion for M365 "remove" findings.
          // Runs in the final pass (see ordering above) so adds/replaces have
          // already executed on un-shifted line numbers.
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          const text = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          const lines = text.split('\n');
          const norm = (l: string): string => {
            const t = l.trim();
            if (t.length === 0) return '';
            return t.endsWith(';') ? t : t + ';';
          };
          const targets = new Set(
            patch.contentToDelete.split('\n').map(norm).filter(t => t.length > 0)
          );
          const kept = targets.size === 0 ? lines : lines.filter(l => !targets.has(norm(l)));
          const removedCount = lines.length - kept.length;
          fs.writeFileSync(resolvedFile, kept.join('\n'), DEFAULTS.ENCODING);
          // Post-condition: none of the targeted lines may remain. Fail loud
          // instead of silently reporting success (the original bug).
          const stillPresent = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING)
            .split('\n').some(l => targets.has(norm(l)));
          if (stillPresent) {
            throw new Error(
              `removeTextSnippet: target content still present in ${resolvedFile} after removal`
            );
          }
          if (removedCount > 0) {
            didModify = true;
            logger.info(`✔ removeTextSnippet removed ${removedCount} line(s) from ${path.basename(resolvedFile)}`);
          } else {
            logger.info(`— removeTextSnippet: target already absent in ${path.basename(resolvedFile)}`);
          }
          success = true;
          break;
        }
        case 'preserveEslintRules': {
          // The 1.23 flat-config migration deletes the author's .eslintrc.js and
          // generates a stock STRICT eslint.config.js, dropping the author's
          // deliberate rule choices (e.g. "@typescript-eslint/no-explicit-any": "off").
          // Re-inject those rules as a final flat-config entry (last wins), so the
          // upgrade is faithful to the author's lint policy. Runs in the final pass
          // so eslint.config.js already exists.
          const resolvedFile = validateAndResolvePath(patch.file, solutionPath);
          if (!fs.existsSync(resolvedFile)) {
            logger.warn(`— preserveEslintRules: ${path.basename(resolvedFile)} not found; skipping`);
            success = true;
            break;
          }
          const src = fs.readFileSync(resolvedFile, DEFAULTS.ENCODING);
          const MARKER = '/* pantoum: preserved author eslint rules */';
          if (src.includes(MARKER)) {
            logger.info(`— preserveEslintRules: rules already preserved in ${path.basename(resolvedFile)}`);
            success = true;
            break;
          }
          // Insert a new config object before the LAST ']' that closes the
          // module.exports array. Normalise any trailing comma so we emit exactly one.
          const lastBracket = src.lastIndexOf(']');
          if (lastBracket === -1) {
            logger.warn(`— preserveEslintRules: no array literal in ${path.basename(resolvedFile)}; skipping`);
            success = true;
            break;
          }
          const head = src.slice(0, lastBracket).replace(/,\s*$/, '');
          const tail = src.slice(lastBracket);
          const entry = `,\n  ${MARKER}\n  {\n    rules: {\n${patch.rulesBlock}\n    }\n  }\n`;
          fs.writeFileSync(resolvedFile, head + entry + tail, DEFAULTS.ENCODING);
          didModify = true;
          logger.info(`✔ preserveEslintRules re-applied author rules to ${path.basename(resolvedFile)}`);
          success = true;
          break;
        }
        default:
          throw new Error(`Unknown patch type: ${(patch as any).type}`);
      }

      if (success && !didModify) {
        skippedPatches.push(patch);
      }

      logger.info(
        success
          ? didModify 
            ? `✔ Patch ${patch.id} applied successfully`
            : `— Patch ${patch.id} skipped (no changes needed)`
          : `— Patch ${patch.id} made no changes`
      );
      results.push({ patch, success });
    } catch (err: any) {
      logger.error(`✖ Error applying patch ${patch.id} (${patch.type}): ${err.message}`);
      results.push({ patch, success: false, message: err.message });
      // continue to next patch
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  logger.info(`Finished applying patches: ${succeeded}/${patches.length} succeeded, ${failed} failed, ${skippedPatches.length} skipped`);
  
  if (skippedPatches.length > 0) {
    logger.info(`Skipped patches: ${skippedPatches.map(p => `${p.id} (${p.title || p.description || 'no description'})`).join(', ')}`);
  }
  
  return results;
}

/** Simple deep‐merge for JSON‐snippet patches */
function deepMerge(target: any, src: any): any {
  if (typeof target !== 'object' || target === null) return src;
  if (typeof src !== 'object' || src === null) return target;
  
  // Handle arrays - replace entirely instead of merging
  if (Array.isArray(src)) {
    return src;
  }
  
  const out = { ...target };
  for (const key of Object.keys(src)) {
    // Special handling: if src[key] is null, delete the property
    if (src[key] === null) {
      delete out[key];
    } else {
      out[key] = key in target
        ? deepMerge((target as any)[key], (src as any)[key])
        : (src as any)[key];
    }
  }
  return out;
}