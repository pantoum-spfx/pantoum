---
title: Building PANTOUM
sidebar_label: Building
sidebar_position: 1
description: Build system and development workflow
---

# Building PANTOUM

## Quick Start

```bash
# After making changes to the code:
npm run dev:link       # Build + update global commands
npm run webapp        # Test with PANTOUM Studio
# Or test with CLI:
pantoum --localPath ./my-project --toVersion 1.22.1
```

## Build Commands

```bash
npm run build          # Standard build with sourcemaps
npm run build:clean    # Remove all build artifacts
npm run dev:link       # Build + npm link (for development)
npm run link           # Just refresh npm link without building
```

## NPM Link

`npm link` creates a **global symlink** that makes the locally built `pantoum` command available system-wide. This is how you test local changes without publishing to npm.

Under the hood, `npm link` reads the `bin` field in `package.json` and creates a symlink in your global npm directory pointing to your local build output (`dist/cli.js`). After linking, running `pantoum` anywhere on your system executes the code from your local build.

```bash
npm run dev:link       # Build + npm link --force
npm run link           # Just refresh the link without rebuilding
```

To unlink (remove the global commands):

```bash
npm unlink -g pantoum
```

## Troubleshooting

### Command not found after npm link

```bash
npm list -g --depth=0 | grep pantoum
npm run build
npm unlink -g pantoum
npm link
```

### Permission denied after npm link

If `pantoum` gives `permission denied`, set execute permissions:

```bash
chmod +x dist/cli.js
npm run link
```

### Build fails with esbuild

```bash
# Clean and retry
npm run build:clean
npm run build
```
