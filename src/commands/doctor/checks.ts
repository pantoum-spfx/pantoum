import { execSync } from 'child_process';
import { createRequire } from 'module';
import { getTerminalCapabilities } from '../../utils/terminalCapabilities.js';
import { isWSL } from '../../utils/platform.js';
import { getVersion } from '../../utils/version.js';

const require = createRequire(import.meta.url);

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  value: string;
  required?: string;
  message?: string;
}

/**
 * Check Node.js version
 */
export function checkNodeVersion(): CheckResult {
  const nodeVersion = process.version;
  const requiredVersion = '22.0.0';

  // Compare versions (simple comparison for major version)
  const currentMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  const requiredMajor = parseInt(requiredVersion.split('.')[0], 10);

  return {
    name: 'Node.js',
    status: currentMajor >= requiredMajor ? 'ok' : 'error',
    value: nodeVersion,
    required: `>=${requiredVersion}`,
    message:
      currentMajor < requiredMajor
        ? `Node.js ${requiredVersion}+ is required`
        : undefined,
  };
}

/**
 * Check npm version
 */
export function checkNpmVersion(): CheckResult {
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
    return {
      name: 'npm',
      status: 'ok',
      value: npmVersion,
    };
  } catch {
    return {
      name: 'npm',
      status: 'error',
      value: 'not found',
      message: 'npm is required',
    };
  }
}

/**
 * Check platform information
 */
export function checkPlatform(): CheckResult {
  const arch = process.arch;

  // Add WSL indicator if detected
  const platformName: string = isWSL ? 'linux (WSL)' : process.platform;

  return {
    name: 'Platform',
    status: 'ok',
    value: `${platformName} ${arch}`,
  };
}

/**
 * Check terminal capabilities
 */
export function checkTerminal(): CheckResult {
  const terminal = getTerminalCapabilities();
  const termProgram = process.env.TERM_PROGRAM || 'unknown';
  const size = `${terminal.width}x${terminal.height}`;

  return {
    name: 'Terminal',
    status: terminal.isTTY ? 'ok' : 'warn',
    value: `${termProgram} (${size})`,
    message: !terminal.isTTY ? 'Not running in interactive terminal' : undefined,
  };
}

/**
 * Check M365 CLI installation
 */
export function checkM365Cli(): CheckResult {
  try {
    const versionOutput = execSync('m365 --version', {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();

    // Extract version number (e.g., "7.5.0" from output)
    const versionMatch = versionOutput.match(/\d+\.\d+\.\d+/);
    const version = versionMatch ? versionMatch[0] : versionOutput;

    return {
      name: 'M365 CLI',
      status: 'ok',
      value: version,
    };
  } catch {
    return {
      name: 'M365 CLI',
      status: 'error',
      value: 'not found',
      message: 'Install with: npm install -g @pnp/cli-microsoft365',
    };
  }
}

/**
 * Check Claude Code installation
 */
export function checkClaudeCode(): CheckResult {
  try {
    const versionOutput = execSync('claude --version', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const versionMatch = versionOutput.match(/\d+\.\d+\.\d+/);
    const version = versionMatch ? versionMatch[0] : versionOutput;

    return {
      name: 'Claude Code',
      status: 'ok',
      value: version,
    };
  } catch {
    return {
      name: 'Claude Code',
      status: 'error',
      value: 'not found',
      message: 'Install Claude Code: https://docs.anthropic.com/en/docs/claude-code',
    };
  }
}

/**
 * Check Claude Agent SDK version
 */
export function checkAgentSdk(): CheckResult {
  try {
    const sdkPackagePath = require.resolve(
      '@anthropic-ai/claude-agent-sdk/package.json'
    );
    const sdkPackage = require(sdkPackagePath) as { version: string };

    return {
      name: 'Agent SDK',
      status: 'ok',
      value: sdkPackage.version,
    };
  } catch {
    return {
      name: 'Agent SDK',
      status: 'error',
      value: 'not found',
      message: 'Run npm install to restore dependencies',
    };
  }
}

/**
 * Check API key configuration (informational — both auth paths are valid)
 */
export function checkApiKey(): CheckResult {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (hasApiKey) {
    const key = process.env.ANTHROPIC_API_KEY!;
    const masked = key.length > 10 ? `${key.slice(0, 7)}...${key.slice(-4)}` : '***';

    return {
      name: 'Auth',
      status: 'ok',
      value: `ANTHROPIC_API_KEY (${masked})`,
    };
  }

  return {
    name: 'Auth',
    status: 'ok',
    value: 'Claude Code (native)',
  };
}

/**
 * Get PANTOUM version
 */
export function checkPantoumVersion(): CheckResult {
  const version = getVersion();

  return {
    name: 'PANTOUM',
    status: 'ok',
    value: `v${version}`,
  };
}

/**
 * Run all checks
 */
export function runAllChecks(): {
  system: CheckResult[];
  dependencies: CheckResult[];
  ai: CheckResult[];
  pantoum: CheckResult[];
} {
  return {
    system: [checkNodeVersion(), checkNpmVersion(), checkPlatform(), checkTerminal()],
    dependencies: [checkM365Cli()],
    ai: [checkClaudeCode(), checkAgentSdk(), checkApiKey()],
    pantoum: [checkPantoumVersion()],
  };
}
