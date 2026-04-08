// src/utils/normaliseRunShellToAddFile.ts
import * as path from "path";
import type { PatchObject } from "../schema/patchSchema.js";

/**
 * If the patch is a runShellCommand that uses the POSIX "here-doc"
 * form `cat > "file" << EOF … EOF`, convert it into an `addFile`
 * PatchObject. Otherwise return the patch unchanged.
 */
export function normaliseRunShellToAddFile(
  patch: PatchObject,
  solutionPath: string   // the absolute root of the SPFx project
): PatchObject {
  if (
    patch.type === "runShellCommand" &&
    /^cat\s+>\s+"?(.+?)"?\s+<<\s+EOF/.test(patch.command)
  ) {
    // 1. extract the target file name
    const [, targetRel] = patch.command.match(
      /^cat\s+>\s+"?(.+?)"?\s+<<\s+EOF/
    )!;
    // 2. extract the body between the two EOF markers
    const bodyPart = patch.command
      .split("<< EOF")[1]        // everything after the first marker
      .replace(/\\$/gm, '')      // remove trailing \ at end of each line
      .replace(/\\"/g, '"')      // unescape quotes
      .replace(/\s*EOF\s*$/, ""); // remove the ending "EOF"

    return {
      ...patch,
      type: "addFile",
      file: path.join(solutionPath, targetRel),
      content: bodyPart.trimStart() + "\n",
    } as PatchObject;
  }
  return patch;
}