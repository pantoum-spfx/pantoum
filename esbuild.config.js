import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// Helper to make files executable
function makeExecutable(filePath) {
  try {
    fs.chmodSync(filePath, '755');
  } catch (error) {
    console.warn(`Warning: Could not make ${filePath} executable:`, error.message);
  }
}

// Common build options for minification only (no bundling)
const minifyOnlyOptions = {
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: false, // Don't bundle, just minify
  minify: true,
  sourcemap: false,
  treeShaking: true,
  keepNames: false,
  legalComments: 'none',
  metafile: true,
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.js': 'js',
    '.jsx': 'jsx',
    '.json': 'json'
  }
};

// First, build with TypeScript to get proper JS files
async function buildWithTypeScript() {
  console.log('📝 Building with TypeScript first...');
  const { execSync } = await import('child_process');

  try {
    execSync('npx tsc -p tsconfig.prod.json', { stdio: 'inherit' });
    console.log('✅ TypeScript build complete\n');
  } catch (error) {
    console.error('❌ TypeScript build failed');
    process.exit(1);
  }
}

// Then optimize the JS files
async function optimizeFiles() {
  console.log('🚀 Optimizing JavaScript files...\n');

  const startTime = Date.now();

  // Get all JS files from dist
  const jsFiles = getAllJsFiles('dist');

  let totalOriginal = 0;
  let totalOptimized = 0;

  for (const file of jsFiles) {
    const relativePath = path.relative('dist', file);
    const outputPath = path.join('dist-optimized', relativePath);

    // Create output directory
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    try {
      // Read original file
      let originalContent = fs.readFileSync(file, 'utf8');

      // Check if it's a CLI file that needs shebang
      const needsShebang = file.includes('cli.js') || file.includes('tui.js');

      // Remove shebang from original content before processing
      if (needsShebang && originalContent.startsWith('#!')) {
        originalContent = originalContent.replace(/^#!.*\n/, '');
      }

      const originalSize = Buffer.byteLength(originalContent);
      totalOriginal += originalSize;

      // Build options for this file
      const options = {
        ...minifyOnlyOptions,
        stdin: {
          contents: originalContent,
          resolveDir: path.dirname(file),
          sourcefile: file,
          loader: 'js'
        },
        outfile: outputPath,
        write: false // Return result instead of writing
      };

      // Minify the file
      const result = await esbuild.build(options);

      // Get minified content
      let minifiedContent = result.outputFiles[0].text;

      // Add shebang if needed (remove existing one first if present)
      if (needsShebang) {
        // Remove any existing shebang first
        minifiedContent = minifiedContent.replace(/^#!.*\n/, '');
        // Add new shebang
        minifiedContent = '#!/usr/bin/env node\n' + minifiedContent;
      }

      // Write optimized file
      fs.writeFileSync(outputPath, minifiedContent);

      // Make executable if needed
      if (needsShebang) {
        makeExecutable(outputPath);
      }

      const optimizedSize = Buffer.byteLength(minifiedContent);
      totalOptimized += optimizedSize;

      const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
      const fileName = path.basename(file);

      // Only log significant files
      if (originalSize > 1024) {
        console.log(`📦 ${fileName}:`);
        console.log(`   Original: ${(originalSize / 1024).toFixed(1)} KB`);
        console.log(`   Optimized: ${(optimizedSize / 1024).toFixed(1)} KB`);
        console.log(`   Reduction: ${reduction}%\n`);
      }
    } catch (error) {
      console.error(`❌ Failed to optimize ${file}:`, error);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('===================');
  console.log(`Total Original: ${(totalOriginal / 1024).toFixed(1)} KB`);
  console.log(`Total Optimized: ${(totalOptimized / 1024).toFixed(1)} KB`);
  console.log(`Total Reduction: ${((1 - totalOptimized / totalOriginal) * 100).toFixed(1)}%`);
  console.log(`\n✨ Optimization complete in ${elapsed}s`);
}

// Helper to get all JS files recursively
function getAllJsFiles(dir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// Main build process
async function build() {
  console.log('🏗️  Pantoum Optimized Build');
  console.log('===========================\n');

  // Step 1: Build with TypeScript
  await buildWithTypeScript();

  // Step 2: Optimize the JS files
  await optimizeFiles();

  // Additional optimizations info
  console.log('\n💡 Additional Optimization Tips:');
  console.log('--------------------------------');
  console.log('1. Use "npm run build:prod" for TypeScript-only production build (no sourcemaps)');
  console.log('2. The optimized build removes comments, minifies code, and applies tree-shaking');
  console.log('3. Consider using CDN for large dependencies in production');
  console.log('4. Use lazy loading for optional features\n');
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Build failed:', error);
  process.exit(1);
});

// Run the build
build();