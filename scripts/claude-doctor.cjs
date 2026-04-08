#!/usr/bin/env node

/**
 * PANTOUM Claude Code Plugin — Doctor Script
 *
 * Cross-platform Node.js script that checks the environment for all
 * prerequisites needed for SPFx upgrades. Outputs JSON.
 *
 * Uses .cjs extension because the project has "type": "module" in package.json.
 *
 * Standalone script — no TypeScript build required.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { apiPort, devPort } = require('../pantoum-webapp/shared/ports.json');

function check(name, fn) {
  try {
    return fn();
  } catch (err) {
    return { name, status: 'error', value: 'check failed', message: String(err.message || err) };
  }
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  const required = 22;

  return {
    name: 'Node.js',
    status: major >= required ? 'ok' : 'error',
    value: version,
    required: '>=22.0.0',
    message: major < required ? 'Node.js 22+ is required' : undefined,
  };
}

function checkNpm() {
  try {
    const version = execSync('npm --version', { encoding: 'utf-8', timeout: 10000 }).trim();
    return { name: 'npm', status: 'ok', value: version };
  } catch {
    return { name: 'npm', status: 'error', value: 'not found', message: 'npm is required' };
  }
}

function checkPlatform() {
  const arch = process.arch;
  const isWSL = process.platform === 'linux' && (
    (process.env.WSL_DISTRO_NAME || '').length > 0 ||
    (process.env.WSLENV || '').length > 0
  );
  const platformName = isWSL ? 'linux (WSL)' : process.platform;

  return { name: 'Platform', status: 'ok', value: `${platformName} ${arch}` };
}

function checkTerminal() {
  const isTTY = process.stdout.isTTY || false;
  const termProgram = process.env.TERM_PROGRAM || 'unknown';
  const cols = process.stdout.columns || 0;
  const rows = process.stdout.rows || 0;

  // When run inside Claude Code the terminal is always non-interactive — that's expected
  const insideClaudeCode = !!process.env.CLAUDECODE;
  if (!isTTY && insideClaudeCode) {
    return { name: 'Terminal', status: 'ok', value: 'Claude Code (non-interactive)' };
  }

  return {
    name: 'Terminal',
    status: isTTY ? 'ok' : 'warn',
    value: `${termProgram} (${cols}x${rows})`,
    message: !isTTY ? 'Not running in interactive terminal' : undefined,
  };
}

function checkM365Cli() {
  try {
    const output = execSync('m365 --version', { encoding: 'utf-8', timeout: 10000 }).trim();
    const match = output.match(/\d+\.\d+\.\d+/);
    const version = match ? match[0] : output;
    return { name: 'M365 CLI', status: 'ok', value: version };
  } catch {
    return {
      name: 'M365 CLI',
      status: 'error',
      value: 'not found',
      message: 'Install with: npm install -g @pnp/cli-microsoft365',
    };
  }
}

function checkClaudeCode() {
  try {
    const output = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    const match = output.match(/\d+\.\d+\.\d+/);
    const version = match ? match[0] : output;
    return { name: 'Claude Code', status: 'ok', value: version };
  } catch {
    return {
      name: 'Claude Code',
      status: 'error',
      value: 'not found',
      message: 'Install Claude Code: https://docs.anthropic.com/en/docs/claude-code',
    };
  }
}

function checkAgentSdk() {
  try {
    const pantoumRoot = path.resolve(__dirname, '..');
    const pkgPath = path.join(pantoumRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return { name: 'Agent SDK', status: 'ok', value: pkg.version };
  } catch {
    return {
      name: 'Agent SDK',
      status: 'error',
      value: 'not found',
      message: 'Run npm install to restore dependencies',
    };
  }
}

function checkAuth() {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (hasApiKey) {
    const key = process.env.ANTHROPIC_API_KEY;
    const masked = key.length > 10 ? `${key.slice(0, 7)}...${key.slice(-4)}` : '***';
    return { name: 'Auth', status: 'ok', value: `ANTHROPIC_API_KEY (${masked})` };
  }

  return { name: 'Auth', status: 'ok', value: 'Claude Code (native)' };
}

function checkWebappInstalled() {
  try {
    const pantoumRoot = path.resolve(__dirname, '..');
    const webappPkgPath = path.join(pantoumRoot, 'pantoum-webapp', 'package.json');
    const nodeModulesPath = path.join(pantoumRoot, 'pantoum-webapp', 'node_modules');

    if (!fs.existsSync(webappPkgPath)) {
      return {
        name: 'Studio',
        status: 'warn',
        value: 'not installed',
        message: 'pantoum-webapp/ directory not found. Run: npm run webapp (auto-installs)',
      };
    }

    if (!fs.existsSync(nodeModulesPath)) {
      return {
        name: 'Studio',
        status: 'warn',
        value: 'deps missing',
        message: 'Run: npm run webapp (auto-installs dependencies)',
      };
    }

    const pkg = JSON.parse(fs.readFileSync(webappPkgPath, 'utf-8'));
    return { name: 'Studio', status: 'ok', value: `v${pkg.version}` };
  } catch {
    return { name: 'Studio', status: 'warn', value: 'unknown', message: 'Could not check webapp status' };
  }
}

function checkWebappRunning() {
  try {
    // Check if API server is running
    const apiResult = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${apiPort}/api/health 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    const apiRunning = apiResult === '200';

    if (!apiRunning) {
      return {
        name: 'Studio Server',
        status: 'warn',
        value: 'not running',
        message: 'Start with: npm run webapp',
      };
    }

    // Check if Vite dev server is also running (dev mode)
    let devRunning = false;
    try {
      const devResult = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${devPort}/ 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 2000,
      }).trim();
      devRunning = devResult === '200';
    } catch {
      // Vite not running — production mode
    }

    const studioPort = devRunning ? devPort : apiPort;
    return {
      name: 'Studio Server',
      status: 'ok',
      value: `running (http://localhost:${studioPort})`,
    };
  } catch {
    return {
      name: 'Studio Server',
      status: 'warn',
      value: 'not running',
      message: 'Start with: npm run webapp',
    };
  }
}

function checkPantoumVersion() {
  try {
    const pantoumRoot = path.resolve(__dirname, '..');
    const pkgPath = path.join(pantoumRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return { name: 'PANTOUM', status: 'ok', value: `v${pkg.version}` };
  } catch {
    return { name: 'PANTOUM', status: 'warn', value: 'unknown', message: 'Could not read package.json' };
  }
}

// Run all checks
const results = {
  system: [
    check('Node.js', checkNodeVersion),
    check('npm', checkNpm),
    check('Platform', checkPlatform),
    check('Terminal', checkTerminal),
  ],
  dependencies: [
    check('M365 CLI', checkM365Cli),
  ],
  ai: [
    check('Claude Code', checkClaudeCode),
    check('Agent SDK', checkAgentSdk),
    check('Auth', checkAuth),
  ],
  pantoum: [
    check('PANTOUM', checkPantoumVersion),
  ],
  webapp: [
    check('Studio', checkWebappInstalled),
    check('Studio Server', checkWebappRunning),
  ],
};

console.log(JSON.stringify(results, null, 2));
