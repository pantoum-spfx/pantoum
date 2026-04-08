#!/usr/bin/env node
/**
 * Ensures pantoum-webapp/node_modules exists before launching the webapp.
 * Used as a pre-hook by `npm run webapp:dev` and by start-webapp.cjs.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const webappDir = path.join(__dirname, '..', 'pantoum-webapp');
const nodeModulesPath = path.join(webappDir, 'node_modules');

if (!fs.existsSync(nodeModulesPath)) {
  console.log('  Installing webapp dependencies (first-time setup)...');
  try {
    execSync('npm install', { cwd: webappDir, stdio: 'inherit' });
  } catch (err) {
    console.error('  ✗ Failed to install webapp dependencies');
    process.exit(1);
  }
}
