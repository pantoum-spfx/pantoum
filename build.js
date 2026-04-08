#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'standard';

console.log('🏗️  Pantoum Build System');
console.log('=======================\n');

function runCommand(command, description) {
  console.log(`📦 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} complete\n`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed\n`);
    return false;
  }
}

function getDirectorySize(dirPath) {
  let totalSize = 0;

  function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        totalSize += stats.size;
      } else if (stats.isDirectory()) {
        walkDir(filePath);
      }
    }
  }

  if (fs.existsSync(dirPath)) {
    walkDir(dirPath);
  }

  return totalSize;
}

function showBuildComparison() {
  const standardSize = getDirectorySize('dist');
  const optimizedSize = getDirectorySize('dist-optimized');

  if (standardSize > 0 && optimizedSize > 0) {
    console.log('📊 Build Comparison:');
    console.log('====================');
    console.log(`Standard build:  ${(standardSize / 1024).toFixed(1)} KB`);
    console.log(`Optimized build: ${(optimizedSize / 1024).toFixed(1)} KB`);
    console.log(`Size reduction:  ${((1 - optimizedSize / standardSize) * 100).toFixed(1)}%\n`);
  }
}

// Copy templates directory to dist
function copyTemplates() {
  const srcDir = 'src/templates';
  const destDir = 'dist/templates';

  if (fs.existsSync(srcDir)) {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    console.log('📋 Copied templates to dist/templates');
  }
}

const buildModes = {
  standard: {
    name: 'Standard TypeScript Build',
    description: 'Fast development build with source maps',
    commands: [
      { cmd: 'npx tsc', desc: 'Compiling TypeScript' }
    ],
    postBuild: copyTemplates
  },
  production: {
    name: 'Production TypeScript Build',
    description: 'Production build without source maps',
    commands: [
      { cmd: 'npx tsc -p tsconfig.prod.json', desc: 'Compiling TypeScript (production)' }
    ],
    postBuild: copyTemplates
  },
  optimized: {
    name: 'Optimized Build',
    description: 'Minified production build with ~50% size reduction',
    commands: [
      { cmd: 'npx cross-env NODE_ENV=production node esbuild.config.js', desc: 'Building and optimizing' }
    ],
    postBuild: copyTemplates
  },
  compare: {
    name: 'Comparison Build',
    description: 'Build both standard and optimized for comparison',
    commands: [
      { cmd: 'npx tsc', desc: 'Building standard' },
      { cmd: 'NODE_ENV=production node esbuild.config.js', desc: 'Building optimized' }
    ],
    postBuild: copyTemplates
  },
  clean: {
    name: 'Clean Build',
    description: 'Remove all build artifacts',
    commands: [
      { cmd: 'npx rimraf dist dist-optimized', desc: 'Cleaning build directories' }
    ]
  }
};

// Show help if requested
if (mode === '--help' || mode === '-h') {
  console.log('Usage: node build.js [mode]\n');
  console.log('Available modes:');
  for (const [key, config] of Object.entries(buildModes)) {
    console.log(`  ${key.padEnd(10)} - ${config.description}`);
  }
  console.log('\nExamples:');
  console.log('  node build.js           # Standard build (default)');
  console.log('  node build.js optimized # Optimized production build');
  console.log('  node build.js compare   # Build both for comparison\n');
  process.exit(0);
}

// Get build configuration
const buildConfig = buildModes[mode];

if (!buildConfig) {
  console.error(`❌ Unknown build mode: ${mode}`);
  console.log('Run "node build.js --help" for available modes\n');
  process.exit(1);
}

// Run the build
console.log(`Mode: ${buildConfig.name}`);
console.log(`${buildConfig.description}\n`);

const startTime = Date.now();
let success = true;

for (const command of buildConfig.commands) {
  if (!runCommand(command.cmd, command.desc)) {
    success = false;
    break;
  }
}

if (success) {
  // Run postBuild if defined
  if (buildConfig.postBuild) {
    buildConfig.postBuild();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✨ Build complete in ${elapsed}s\n`);

  // Show comparison if both builds exist
  if (mode === 'compare') {
    showBuildComparison();
  }

  // Show usage instructions
  console.log('📚 Usage:');
  if (fs.existsSync('dist/cli.js')) {
    console.log('  Standard:  node dist/cli.js');
    console.log('             npm start');
  }
  if (fs.existsSync('dist-optimized/cli.js')) {
    console.log('  Optimized: node dist-optimized/cli.js');
    console.log('             npm run start:opt');
  }
} else {
  process.exit(1);
}