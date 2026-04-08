import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedVersion: string = '';

/**
 * Get version from package.json
 * Caches the result to avoid repeated file reads
 */
export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    // Go up from src/utils/ to project root
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    cachedVersion = (packageJson.version as string) || '0.0.0';
    return cachedVersion;
  } catch (error) {
    console.error('Failed to read version from package.json:', error);
    cachedVersion = '0.0.0';
    return cachedVersion;
  }
}
