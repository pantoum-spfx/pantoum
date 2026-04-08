---
title: Installation
sidebar_label: Installation
sidebar_position: 1
description: Install Pantoum and verify the local environment
---

# Installation

Install Pantoum, verify the local environment, and launch Studio.

## Prerequisites

Pantoum needs three things:

- **Node.js 22+**
- **CLI for Microsoft 365**
- **Claude access** through a Claude Code subscription or `ANTHROPIC_API_KEY`

Quick check:

```bash
node --version
npm install -g @pnp/cli-microsoft365
m365 --version
```

See [Authentication](./authentication.md) for the Claude setup options.

## Install Pantoum

Clone the repository and build from source:

```bash
git clone https://github.com/pantoum-spfx/pantoum.git
cd pantoum
npm install
npm run build
```

## Verify Everything

Run the built-in doctor command:

```bash
npm run doctor
```

This is the fastest way to confirm that Pantoum, M365 CLI, and Claude authentication are ready.

## Launch Studio

Pantoum Studio is the recommended interface for the public release:

```bash
npm run webapp
```

Studio opens at `http://localhost:5201`. On first launch, Studio installs its own webapp dependencies automatically — expect a short one-time delay.

## Optional: global `pantoum` CLI

If you want the `pantoum` command available from any directory (for scripting, CI, or terminal-first workflows), create a global symlink to your local build:

```bash
npm link
pantoum doctor
```

Pantoum isn't published to npm, so `npm link` is the way to expose the local build as a global command. Skip this step if you only plan to use Studio.

## Next Steps

- [Before You Start](./before-you-start.md)
- [Authentication](./authentication.md)
- [Quick Start](./quick-start.md)
