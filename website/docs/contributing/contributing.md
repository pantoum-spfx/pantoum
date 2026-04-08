---
title: Contributing
sidebar_label: Contributing
sidebar_position: 1
description: How to contribute to PANTOUM
---

# Contributing to PANTOUM

Thank you for your interest in contributing to PANTOUM! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 22+
- npm 9+
- M365 CLI (`npm install -g @pnp/cli-microsoft365`)
- Anthropic API key (for AI features)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/pantoum-spfx/pantoum.git
cd pantoum

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## How to Contribute

1. **Create an issue** describing the bug or feature
2. **Fork the repository** and create a branch from `main`
3. **Make your changes** and ensure tests pass (`npm test`) and build succeeds (`npm run build`)
4. **Submit a pull request** against `main`

The `main` branch is protected. All changes go through pull requests.

## Code Style

- TypeScript strict mode enabled
- ESLint for linting
- Prettier for formatting

Run before committing:

```bash
npm run build
npm test
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point
├── core/               # Core business logic
│   ├── upgradeService/ # Upgrade orchestration
│   ├── patchService.ts # Patch management
│   └── reportService/  # Report generation
├── commands/           # CLI commands (doctor)
├── templates/          # Migration templates
└── utils/              # Shared utilities

pantoum-webapp/         # PANTOUM Studio
├── app/src/            # React frontend
├── server/             # Express + WebSocket backend
└── shared/types/       # Shared types
```

## AI Prompt Templates

All AI prompts live in `src/templates/*.md` files. If you want to improve how PANTOUM interacts with Claude -- migration instructions, error fixing strategies, or verification checks -- edit the relevant template file rather than modifying TypeScript source code. See the [Extensibility Guide](/docs/guides/extensibility) for details on the template system.

## Testing

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Writing Tests

- Tests live in `src/__tests__/` using Vitest

## Reporting Issues

When reporting issues, please include:

1. Output of `node scripts/claude-doctor.cjs`
2. SPFx source and target versions
3. Steps to reproduce
4. Expected vs actual behavior
5. Relevant parts of the upgrade report (with sensitive data redacted)

## Feature Requests

Feature requests are welcome. Please check existing issues first and describe the use case and expected behavior.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
