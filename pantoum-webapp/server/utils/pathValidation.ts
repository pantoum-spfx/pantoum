import path from 'path';

/**
 * Validate that a user-supplied path resolves within an allowed base directory.
 * Prevents directory traversal attacks (e.g., "../../etc/passwd").
 *
 * @param userPath - The path from the request body/query
 * @param allowedBase - The directory the path must resolve within
 * @returns The resolved absolute path
 * @throws Error if the path escapes the allowed base
 */
function validatePath(userPath: string, allowedBase: string): string {
  const resolvedBase = path.resolve(allowedBase);
  const resolved = path.resolve(userPath);

  // The resolved path must start with the base directory
  // Add trailing separator to prevent "/foo/bar" matching "/foo/b"
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Path outside allowed directory: ${userPath}`);
  }

  return resolved;
}

/**
 * Expand a leading `~` to the user's home directory. Users naturally type
 * `~/projects/...` into the Studio path field; Node's fs treats that `~` as a
 * literal directory name.
 */
export function expandHomePath(userPath: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/';
  if (userPath === '~') return home;
  if (userPath.startsWith('~/') || userPath.startsWith('~\\')) {
    return path.join(home, userPath.slice(2));
  }
  return userPath;
}

/**
 * Validate a path against the user's home directory.
 * This is a broad check — filesystem access is limited to paths under $HOME.
 * For a localhost dev tool, this prevents the worst abuse (reading /etc, /root, etc.)
 * while still allowing flexible project paths.
 *
 * Returns the resolved absolute path (with `~` expanded) — callers should use
 * this instead of the raw input.
 */
export function validatePathUnderHome(userPath: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/';
  return validatePath(expandHomePath(userPath), home);
}
