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

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### Commit Messages

PANTOUM follows conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat(webapp): add version selection dropdown

Added a dropdown component for selecting target SPFx version
in the settings page.
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Ensure tests pass: `npm test`
5. Ensure build succeeds: `npm run build`
6. Submit a pull request

### PR Checklist

- [ ] Tests added/updated for changes
- [ ] Documentation updated if needed
- [ ] No breaking changes (or documented in PR)
- [ ] Commit messages follow conventions

## Code Style

- TypeScript strict mode enabled
- ESLint for linting
- Prettier for formatting

Run before committing:
```bash
npm run lint
npm run format
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point
├── defaults.ts         # Single source of truth for all defaults
├── core/               # Core business logic
│   ├── upgradeService/ # Upgrade orchestration
│   ├── patchService.ts # Patch management
│   └── reportService/  # Report generation
├── templates/          # Migration templates
└── utils/              # Shared utilities

pantoum-webapp/         # PANTOUM Studio (React + Fluent UI v9)
├── app/src/            # Frontend (pages, components, stores)
├── server/             # Express API + WebSocket
└── shared/types/       # Shared TypeScript types

.claude/commands/       # Claude Code Plugin skill files
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration
```

### Writing Tests

- Place unit tests next to source files: `src/core/__tests__/`
- Place integration tests in: `test/integration/`
- Use fixtures in: `test/fixtures/`

## Reporting Issues

When reporting issues, please include:

1. PANTOUM version (`pantoum --version`)
2. Node.js version (`node --version`)
3. Operating system
4. Steps to reproduce
5. Expected vs actual behavior
6. Relevant logs (with sensitive data redacted)

## Feature Requests

Feature requests are welcome! Please:

1. Check existing issues first
2. Describe the use case
3. Explain the expected behavior
4. Consider if it aligns with PANTOUM's goals

## Questions?

- Open a GitHub Discussion for questions
- Check existing documentation in `/docs`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
