#!/usr/bin/env node
/**
 * PANTOUM Studio - Startup Script
 * Starts the webapp (Express + Vite), waits until ready, then opens browser.
 * Based on easyspfx's proven start-designer.js pattern.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');

const { apiPort, devPort } = require('../pantoum-webapp/shared/ports.json');
const PID_FILE = path.join(os.tmpdir(), 'pantoum-webapp.pid');
const LOG_PATH = path.join(os.tmpdir(), 'pantoum-webapp.log');

const WEBAPP_DIR = path.join(__dirname, '..', 'pantoum-webapp');
const API_URL = `http://localhost:${apiPort}/api/health`;
const APP_URL = `http://localhost:${devPort}`;
const MAX_WAIT_SECONDS = 60;
const PORT_FREE_TIMEOUT_MS = 5000;
const GRACEFUL_KILL_TIMEOUT_MS = 3000;

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    // Signal 0 = existence check, no signal actually sent
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sendKill(pid, signal) {
  // On POSIX, pass -pid to signal the whole process group (npm → concurrently → tsx + vite).
  // On Windows, fall back to the direct PID — process groups work differently there.
  const target = process.platform === 'win32' ? pid : -pid;
  try { process.kill(target, signal); } catch { /* already gone */ }
}

async function killOldProcess() {
  let pid;
  try {
    pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  } catch {
    return; // no pidfile — clean slate
  }

  if (!isProcessAlive(pid)) {
    try { fs.unlinkSync(PID_FILE); } catch { /* noop */ }
    return;
  }

  console.log(`${DIM}  Stopping previous server (PID ${pid})...${RESET}`);
  sendKill(pid, 'SIGTERM');

  // Wait up to GRACEFUL_KILL_TIMEOUT_MS for the process to actually exit
  const deadline = Date.now() + GRACEFUL_KILL_TIMEOUT_MS;
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (isProcessAlive(pid)) {
    console.log(`${DIM}  Forcing shutdown (SIGKILL)...${RESET}`);
    sendKill(pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
  }

  try { fs.unlinkSync(PID_FILE); } catch { /* noop */ }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

async function waitForPortsFree() {
  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [apiFree, devFree] = await Promise.all([
      isPortFree(apiPort),
      isPortFree(devPort),
    ]);
    if (apiFree && devFree) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function tailLog(lines = 20) {
  try {
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    return content.split('\n').slice(-lines).join('\n');
  } catch {
    return '(log file not available)';
  }
}

function writePid(pid) {
  fs.writeFileSync(PID_FILE, String(pid));
}

function openBrowser(url) {
  const { exec } = require('child_process');
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  exec(`${cmd} ${url}`);
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isAlreadyRunning() {
  const [apiOk, appOk] = await Promise.all([
    checkUrl(API_URL),
    checkUrl(APP_URL),
  ]);
  return apiOk && appOk;
}

async function waitForServices(hasChildDied) {
  process.stdout.write(`${DIM}  Waiting for services`);

  for (let i = 0; i < MAX_WAIT_SECONDS; i++) {
    if (hasChildDied()) {
      process.stdout.write(`${RESET}\n`);
      return 'died';
    }

    const [apiOk, appOk] = await Promise.all([
      checkUrl(API_URL),
      checkUrl(APP_URL),
    ]);

    if (apiOk && appOk) {
      process.stdout.write(`${RESET}\n`);
      return 'ready';
    }

    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }

  process.stdout.write(`${RESET}\n`);
  return 'timeout';
}

function printReadyBanner(mode) {
  const label = mode === 'reused'
    ? `${GREEN}  ✓ Studio is already running — reusing existing instance${RESET}`
    : `${GREEN}  ✓ Studio is ready!${RESET}`;
  console.log(label);
  console.log('');
  console.log(`  API Server:  http://localhost:${apiPort}`);
  console.log(`  Studio:      ${CYAN}http://localhost:${devPort}${RESET}`);
  console.log('');
  console.log(`${DIM}  Logs: ${LOG_PATH}${RESET}`);
  console.log('');
}

async function main() {
  console.log('');
  console.log(`${CYAN}  🐿️  PANTOUM Studio${RESET}`);
  console.log('');

  // PHASE 1: Probe BEFORE killing anything. If the studio is already up, reuse it.
  if (await isAlreadyRunning()) {
    printReadyBanner('reused');
    openBrowser(APP_URL);
    process.exit(0);
  }

  // PHASE 2: Nothing is listening — clean up any stale process + pidfile.
  await killOldProcess();

  // PHASE 3: Make sure the ports are actually free before we try to bind them.
  const portsFree = await waitForPortsFree();
  if (!portsFree) {
    console.error(`${YELLOW}  ✗ Ports ${apiPort} or ${devPort} are still in use after cleanup.${RESET}`);
    console.error(`${DIM}  Find and stop the conflicting process:${RESET}`);
    console.error(`    lsof -i :${apiPort} -i :${devPort} -P -sTCP:LISTEN`);
    console.error('');
    process.exit(1);
  }

  // PHASE 4: Sanity checks
  if (!fs.existsSync(WEBAPP_DIR)) {
    console.error(`${YELLOW}  ✗ pantoum-webapp/ directory not found${RESET}`);
    console.error(`  Expected at: ${WEBAPP_DIR}`);
    process.exit(1);
  }

  // PHASE 5: Install webapp deps if needed (shared helper, also used by `prewebapp:dev`)
  require('./ensure-webapp-deps.cjs');

  // PHASE 6: Start the dev server
  console.log(`${DIM}  Starting servers...${RESET}`);

  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: WEBAPP_DIR,
    stdio: 'pipe',
    detached: !isWindows,
    shell: isWindows,
  });

  // Track early child death so waitForServices can bail out instead of looping for 60s
  let childDied = false;
  let childExitCode = null;
  child.on('exit', (code, signal) => {
    childDied = true;
    childExitCode = code !== null ? code : `signal:${signal}`;
  });

  // Log output to temp file for debugging
  const logFile = fs.createWriteStream(LOG_PATH);
  child.stdout.pipe(logFile);
  child.stderr.pipe(logFile);

  // Track PID so future runs can clean up the whole process group
  writePid(child.pid);
  child.unref();

  // PHASE 7: Wait for readiness OR early death
  const status = await waitForServices(() => childDied);

  if (status === 'ready') {
    printReadyBanner('fresh');
    openBrowser(APP_URL);
    return;
  }

  if (status === 'died') {
    console.error(`${YELLOW}  ✗ Startup failed — dev server exited early (exit ${childExitCode}).${RESET}`);
    console.error(`${DIM}  Last 20 lines of ${LOG_PATH}:${RESET}`);
    console.error(tailLog(20));
    console.error('');
    try { fs.unlinkSync(PID_FILE); } catch { /* noop */ }
    process.exit(1);
  }

  // timeout
  console.error(`${YELLOW}  ✗ Services did not become ready within ${MAX_WAIT_SECONDS}s.${RESET}`);
  console.error(`${DIM}  Last 20 lines of ${LOG_PATH}:${RESET}`);
  console.error(tailLog(20));
  console.error('');
  process.exit(1);
}

main().catch(console.error);
