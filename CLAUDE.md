# PANTOUM Development Context for Claude Code

## Project Overview

PANTOUM is an SPFx (SharePoint Framework) upgrade automation tool that combines M365 CLI and AI-powered error resolution.

## Architecture Highlights

### Core Services
- **UpgradeService** - Main orchestration, handles solution processing workflow
- **PatchService** - Deterministic patch generation and application
- **ReportService** - Comprehensive JSON/Markdown reporting
- **ClaudeMigrationExecutor** - AI-powered error analysis and code fixes

### Key Implementation Details
- **TypeScript** throughout with strict typing
- **Modular architecture** with clear separation of concerns
- **Hierarchical CLI flags** (master flags control sub-flags)
- **Three interfaces**: CLI, Webapp, Claude Code Plugin
- **Git-based workflow** with automatic run directories
- **Centralized defaults** in `src/defaults.ts` (single source of truth)

## Webapp (`pantoum-webapp/`)

### Architecture
- **React 19 + Fluent UI v9** single-page application, branded **PANTOUM Studio**
- **Express + WebSocket** backend for real-time upgrade streaming
- **Zustand stores** for state management
- **Vite** for frontend bundling, **esbuild** for server compilation
- **Ports** are centralized in `pantoum-webapp/shared/ports.json` (currently `apiPort: 5200`, `devPort: 5201`). Do not hardcode port numbers — import from there.

### Pages (`pantoum-webapp/app/src/pages/`)
- **HomePage** - Hero with ASCII art, quick-action cards (Solutions, Upgrade, Reports, Doctor)
- **SettingsPage** - Tabbed settings editor synced with `pantoum.settings.yml`
- **UpgradePage** - Solution selection, upgrade execution with real-time WebSocket log streaming, animated squirrel
- **ReportsPage** - Browse and view upgrade reports (JSON/Markdown)
- **AiConsolePage** - Launch `Doctor` (environment health check) and `Analyze` (post-upgrade analysis) skills with live event streaming

### Stores (`pantoum-webapp/app/src/stores/`)
| Store | Purpose |
|-------|---------|
| `settingsStore` | Settings editor state, synced with `pantoum.settings.yml` via REST |
| `upgradeStore` | Upgrade session state, solution selection, log buffers, live status |
| `historyStore` | Upgrade history index read from `pantoum_history/` |
| `connectionStore` | WebSocket connection liveness + reconnection state |
| `themeStore` | Dark/light theme toggle |

### Server Routes (`pantoum-webapp/server/routes/`)
| Route | Purpose |
|-------|---------|
| `settings.ts` | GET/PUT `pantoum.settings.yml` |
| `solutions.ts` | Scan repo for SPFx solutions |
| `upgrade.ts` | Start/stop upgrade session, WebSocket upgrade handshake |
| `reports.ts` | List + read JSON/Markdown reports from run directories |
| `history.ts` | Read run history from `pantoum_history/` |
| `ai-console.ts` | Run Doctor / Analyze skills |
| `health.ts` | Liveness probe |
| `versions.ts` | Available SPFx target versions |

### Server Services (`pantoum-webapp/server/services/`)
- `UpgradeOrchestrator.ts` — drives a sequential upgrade run, parses core engine logs via `LogParser`, broadcasts WebSocket events
- `ParallelUpgradeOrchestrator.ts` — drives a parallel upgrade run by spawning isolated `SolutionWorker` child processes
- `SolutionWorker.ts` — per-solution child process entry point for parallel runs
- `SessionManager.ts` — tracks active upgrade sessions and fans out WebSocket broadcasts
- `LogParser.ts` — stateful parser that converts core engine log lines into structured `progress` / `solution:status` / `ai:action` / `ai:metrics` / `pipeline:event` events
- `HistoryService.ts` — reads/writes `pantoum_history/` entries
- `defaultsLoader.ts` — loads engine defaults for the settings editor

### Components (`pantoum-webapp/app/src/components/`)
- `Layout/` — app shell, navigation
- `SettingsTabs/` — tabbed settings form with per-field controls
- `Upgrade/` — upgrade page widgets (solution list, log stream, completion summary)
- `UpgradeStats/` — cost/token/duration stats for in-progress and completed runs
- `AiAnalyzePanel/` — shared panel for AI console skill output (events, tool calls, metrics)
- `SquirrelAnimation/` — animated upgrade mascot

### Shared Types (`pantoum-webapp/shared/types/`)
`Settings.ts`, `Upgrade.ts`, `Solution.ts`, `Report.ts`, `History.ts`, `AiConsole.ts`, `ManualConfig.ts`, `WebSocketProtocol.ts`

### WebSocket Protocol
The upgrade page uses WebSocket for real-time streaming:
- Server sends `log`, `phase`, `progress`, `solution:status`, `ai:action`, `ai:metrics`, `pipeline:event`, `complete`, `batch:complete`, `error` messages
- Client renders live log output with phase tracking and progress indicators
- Protocol types defined in `pantoum-webapp/shared/types/WebSocketProtocol.ts`

### Running the Webapp
```bash
npm run webapp        # Production: build + serve (Express on apiPort from ports.json, default 5200)
npm run webapp:dev    # Development: Express API on apiPort + Vite HMR on devPort (default 5201)
npm run webapp:stop   # Stop a detached production webapp (reads PID from tmpdir)
```

## Claude Code Plugin (`.claude/`)

### Slash Commands (`.claude/commands/`)
| Command | Purpose |
|---------|---------|
| `pantoum.md` | Welcome screen with navigation |
| `pantoum-upgrade.md` | Interactive upgrade wizard |
| `pantoum-analyze.md` | Post-upgrade analysis with report context |
| `pantoum-doctor.md` | Environment health check |
| `pantoum-studio.md` | Launch PANTOUM Studio |

### Skills (`.claude/skills/`)
| Skill | Purpose |
|-------|---------|
| `pantoum-conventions/SKILL.md` | Auto-applied codebase conventions and safety rules (template safety, SDK caution, defaults source of truth) |

### Hooks (`.claude/hooks/`)
- `hooks.json` — wires a `session_start` hook that runs `session-start.js` when Claude Code opens the project
- `session-start.js` — prints an ASCII squirrel welcome banner listing available `/pantoum-*` commands

### Integration
- Slash commands can open the webapp via `open http://localhost:5200` (port from `shared/ports.json`)
- Analyze command accepts context from `upgradeStore` (solution paths, report path)
- Doctor command runs directly in Claude Code terminal

## CLI Flag System

### AI Flags (with "ai" prefix for clarity)
AI-related flags now have the `ai` prefix to make AI usage explicit:

```bash
# AI error fixing
--aiFixM365Errors true       # Use AI to fix M365 CLI upgrade errors
--aiFixBuildErrors true      # Use AI to fix build/test errors
--aiFixThirdPartyErrors true # Use AI to fix third-party breaking changes
--aiFixEslintProperly true   # AI fixes ESLint by fixing code (vs disable comments)
--aiFixTypeScriptWarnings true # Use AI to fix TypeScript warnings
--aiMaxRetries 3             # Max AI retry iterations for error fixing (1-10)

# AI thinking
--thinkingEffort high        # Adaptive thinking: max, high (default), medium, low, off
```

### Hierarchical Design
Master flags control activation of sub-flags:

```bash
# Version updates (master flag)
--versionUpdates true
  --updatePackageJson true      # Increment MINOR version (1.0.0 -> 1.1.0)
  --updateReadme true           # Update README files
  --updateBadges true           # Update version badges
  --updateVersionHistory true   # Add history entries
```

### Implementation
- `src/defaults.ts` - **Single source of truth** for all default values and `PantoumSettings` interface
- `src/cli.ts` - CLI argument definitions (imports from defaults.ts)

## Reporting System

### Report Types
1. **JSON Reports** - Machine-readable, complete data
2. **Markdown Reports** - Human-readable summaries
3. **Per-Solution Reports** - Individual solution details

### Report Locations
- Global: `pantoum_run_{runId}/` directory
- Per-solution: `{solution}/pantoum_run_{runId}/` (when enabled)

## AI Integration

### Claude Agent SDK Integration
PANTOUM uses the official Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for all AI operations. This provides:
- **Claude Code Authentication** - No API keys needed, uses Claude Code's native auth
- **Performance Metrics** - Detailed token usage, costs, and execution timing
- **Tool Tracking** - Complete visibility into AI tool usage
- **Session Management** - Unique session IDs for debugging

### Claude Models Used
- **Sonnet 4.6**: `claude-sonnet-4-6` (default - fast, capable for most migrations)
- **Opus 4.6**: `claude-opus-4-6` (optional - best for complex multi-file migrations)
- **Haiku 4.5**: `claude-haiku-4-5` (lightweight operations like fancy name generation)

**Note**: Claude Max subscribers can use Opus 4.6 at the same rate as Sonnet 4.6.

### Error Resolution Workflow
1. **Pattern Analysis** - Identify error types and root causes
2. **Context Building** - Read relevant files and understand codebase
3. **Fix Generation** - Create targeted patches via Edit/MultiEdit tools
4. **Verification** - Re-run builds to confirm fixes
5. **Iteration** - Retry up to `aiMaxRetries` times if needed (default: 3, configurable 1-10)

### Key Implementation
- `src/core/claudeMigrationExecutor.ts` - Main AI orchestration
- `src/adapters/claudeAgentSdkAdapter.ts` - Claude Agent SDK adapter
- **Authentication**: Agent SDK natively supports both Claude Code subscription and `ANTHROPIC_API_KEY`
- Supports both upgrade errors and build errors
- Tracks all AI actions in patch metadata

### AI Performance Metrics
When using Claude Agent SDK, PANTOUM captures and reports:
- **Token Usage** - Input, output, and cache tokens with total counts
- **Cost Tracking** - Real-time cost in USD for each AI operation
- **Performance** - Execution duration and API response times
- **Tool Usage** - Detailed tracking of which tools AI used and how often
- **Session IDs** - Unique identifiers for debugging AI interactions

These metrics appear in both JSON and Markdown reports for full transparency.

## Patch System

### Three Patch Systems
PANTOUM uses three complementary systems that work together:

1. **M365 CLI Patches** (FN prefixes) — Deterministic patches generated from `m365 spfx project upgrade --output json`. The `DeterministicPatchGenerator` class in `src/patchGeneratorDeterministic.ts` translates each M365 CLI instruction into a `PatchObject`.

2. **YAML-Driven Patches** (`pantoum.patches.yml`) — Declarative configuration for post-upgrade steps, deterministic steps, patch filters, version corrections, and detection patterns. All manual patches (M prefixes), deterministic steps (SASS, SCRIPT, ENV, HEFTFIX prefixes), and success-phase commands are defined here.

3. **AI Templates** (`src/templates/*.md`) — Prompt templates for Claude-powered migrations (PnP v4, MGT, build errors). Templates use Mustache-style substitution and are referenced from `aiContexts` in `pantoum.patches.yml`.

### Patch ID Conventions
- **FN####** — M365 CLI patches (from official upgrade reports)
- **M######** — Manual post-upgrade patches (YAML-driven)
- **SASS###** — Sass config patches (YAML deterministic)
- **SCRIPT###** — Script migration patches (YAML deterministic)
- **ENV###** — Environment injection patches (YAML deterministic)
- **HEFTFIX###** — Heft bug fix patches (YAML deterministic)
- **FILTER###** — Patch filters (YAML, not patches themselves)
- **C####** — Claude AI-generated fixes (runtime)

### `pantoum.patches.yml` Structure

```yaml
# Manual steps — the core patch definitions
manualSteps:
  - id: "M000001"
    when: post | deterministic | success
    condition: { type: always | packageVersion | instructionPresent | ... }
    type: updateDependency | addFile | regexReplace | ...

# AI contexts — instructions for Claude migrations
aiContexts:
  pnp-to-v4:
    template: "pnp-v4-migration"
    verificationPatterns: [...]

# Patch filters — conditionally exclude M365 CLI patches
patchFilters:
  - targetPatchId: "FN012017"
    action: exclude
    condition: { type: instructionPresent, instructionId: "FN015011" }

# Version corrections — fix M365 CLI version bugs
versionCorrections:
  - packageName: "typescript"
    badVersion: "5.8.0"
    correctedVersion: "~5.8.0"

# Detection patterns — config-driven build system detection
detectionPatterns:
  standardScripts: [build, clean, test, ...]
  customGulpfilePatterns: [{ name: "...", pattern: "..." }]

# Excluded packages — never update via third-party updater
excludedPackages:
  - "@microsoft/*"
  - "@pnp/*"
  - ...
```

### Condition Types
| Type | Description |
|------|-------------|
| `always` | Always true |
| `packageVersion` | Compare a package version in package.json |
| `instructionPresent` | M365 CLI instruction ID exists in upgrade report |
| `instructionAbsent` | M365 CLI instruction ID does NOT exist |
| `fileExists` | File exists at path (relative to solution root) |
| `fileAbsent` | File does NOT exist |
| `fileContains` | File (or glob pattern) matches a regex |
| `all` | AND — all sub-conditions must be true |
| `any` | OR — any sub-condition must be true |

### Patch Phases (`when`)
| Phase | When it runs | Example |
|-------|-------------|---------|
| `deterministic` | During M365 CLI patch generation, interleaved with FN patches | SASS001, SCRIPT001, ENV001-003, HEFTFIX001 |
| `post` | After all FN patches are applied | M000001 (PnP upgrade), M000005 (wipe node_modules) |
| `success` | After npm install + build, scans output | M999997 (npm install), M999999 (build) |

### Env Injection Strategies
| Strategy | Description |
|----------|-------------|
| `webpack-patch` (default) | Creates `config/webpack-patch/env-inject.js` — YAML-driven via ENV001-003 |
| `none` | Skips env injection patches; Claude fixes at build time via `build-error-fix.md` |

### Decision Framework: Deterministic vs YAML vs AI
| Scenario | System | Why |
|----------|--------|-----|
| M365 CLI instruction → patch | Deterministic (`patchGeneratorDeterministic.ts`) | Direct translation, no config needed |
| Sass config, script translation, env injection | YAML deterministic steps | Transparent, user-customizable rules |
| Version correction, patch filtering | YAML config sections | Simple data, no code needed |
| PnP v4 migration, MGT migration | AI templates | Complex, requires code understanding |
| Build errors, ESLint warnings | AI (build-fix phase) | Unpredictable, needs runtime analysis |

### Implementation
- `src/patchGeneratorDeterministic.ts` — M365 CLI instruction → patch translation engine + YAML deterministic step processing
- `src/core/patchService.ts` — Orchestrates all patch generation (deterministic + post + AI)
- `src/patchApplier.ts` — Low-level patch application (all types including `regexReplace`)
- `src/utils/manualLoader.ts` — YAML config loading, condition evaluation, step-to-patch conversion
- `src/schema/manualConfig.ts` — TypeScript types for all YAML config sections
- `src/schema/patchSchema.ts` — `PatchObject` union type definitions

## Template System

ALL AI prompts live in `src/templates/*.md` -- no prompts are hardcoded in source code. Templates use Mustache-style variable substitution (`{{variable}}`) and conditional blocks (`{{#if condition}}...{{/if}}`).

### Migration Templates
| Template | Purpose |
|----------|---------|
| `pnp-v4-migration.md` | PnP JS v1/v2/v3 to v4 migration |
| `mgt-migration.md` | Microsoft Graph Toolkit migration |

### Build/Error Templates
| Template | Purpose |
|----------|---------|
| `build-error-fix.md` | Build/test error fix prompt with SCSS hint |
| `m365-cli-error-fix.md` | M365 CLI parsing error fix |
| `eslint-optimization.md` | Bulk ESLint rule disabling |

### Verification Templates
| Template | Purpose |
|----------|---------|
| `migration-verification.md` | Post-migration grep verification |
| `migration-fix.md` | Fix for failed verification checks |

### Other Templates
| Template | Purpose |
|----------|---------|
| `migration-preamble.md` | Standard migration preamble (build restrictions, constraints) |
| `migration-preamble-removal.md` | Preamble for package removal migrations |
| `third-party-migration.md` | Third-party breaking change fix |

### Implementation
- `src/utils/templateLoader.ts` - Template loading, caching, and variable substitution
- `TemplateName` type enforces valid template names at compile time
- Templates are cached after first load for performance

## Repository Layout

```
pantoum-public/
├── src/                          # Core TypeScript engine (CLI + library)
│   ├── index.ts                  # Library entry point
│   ├── cli.ts                    # CLI entry point (yargs)
│   ├── defaults.ts               # Single source of truth for defaults + PantoumSettings
│   ├── constants.ts              # Legacy re-exports (imports from defaults.ts)
│   ├── settingsLoader.ts         # Load + merge pantoum.settings.yml
│   ├── solutionScanner.ts        # Scan repo for SPFx solutions
│   ├── m365cli.ts                # M365 CLI wrapper (runs `m365 spfx project upgrade`)
│   ├── patchGeneratorDeterministic.ts  # M365 CLI → patch translation + YAML deterministic steps
│   ├── patchApplier.ts           # Low-level patch application (all patch types)
│   ├── adapters/
│   │   ├── claudeAgentSdkAdapter.ts  # Claude Agent SDK adapter (thinking budget mapping, metrics)
│   │   └── types.ts              # Adapter interface types
│   ├── commands/
│   │   ├── doctor.ts             # `pantoum doctor` environment health check
│   │   └── doctor/checks.ts      # Individual doctor checks
│   ├── core/                     # Core business logic
│   │   ├── upgradeService/       # Main workflow orchestration
│   │   ├── patchService.ts       # Patch orchestration (deterministic + post + AI)
│   │   ├── patchRepository.ts    # Patch + run directory repository
│   │   ├── reportService/        # JSON + Markdown report generation
│   │   ├── errorAnalyzer/        # Error analysis and prompt generation
│   │   ├── complexityAnalyzer/   # Pre-upgrade complexity analysis (opt-in)
│   │   ├── thirdPartyDependencyService.ts  # Third-party dep updates
│   │   ├── claudeMigrationExecutor.ts      # AI integration entry point
│   │   ├── historyWriter.ts      # Writes `pantoum_history/pantoum_run_{runId}.json`
│   │   ├── npmRegistryService.ts # npm registry lookups (used by complexity analyzer)
│   │   ├── repositoryService.ts  # Git repo detection + root resolution
│   │   └── versionUpdateService.ts  # Package/README/badge version bumps
│   ├── templates/                # ALL AI prompt templates (*.md)
│   ├── schema/                   # TypeScript schemas (manualConfig, patchSchema, historyTypes, ...)
│   ├── utils/                    # Utilities (manualLoader, templateLoader, logger, ...)
│   ├── data/                     # Static lookup data
│   └── __tests__/                # Vitest unit tests
│
├── pantoum-webapp/               # React + Express webapp (PANTOUM Studio)
│   ├── app/src/                  # React 19 + Fluent UI v9 frontend
│   │   ├── pages/                # Home, Settings, Upgrade, Reports, AiConsole
│   │   ├── components/           # Layout, SettingsTabs, Upgrade, UpgradeStats, AiAnalyzePanel, SquirrelAnimation
│   │   ├── stores/               # Zustand: settings, upgrade, history, connection, theme
│   │   └── hooks/                # Custom React hooks (e.g. useWebSocket)
│   ├── server/                   # Express + WebSocket backend (esbuild-compiled)
│   │   ├── index.ts              # Server entry point
│   │   ├── routes/               # settings, solutions, upgrade, reports, history, ai-console, health, versions
│   │   └── services/             # UpgradeOrchestrator, ParallelUpgradeOrchestrator, SolutionWorker, SessionManager, LogParser, HistoryService, defaultsLoader
│   └── shared/
│       ├── ports.json            # Centralized apiPort/devPort — import from here, never hardcode
│       └── types/                # Settings, Upgrade, Solution, Report, History, AiConsole, ManualConfig, WebSocketProtocol
│
├── website/                      # Docusaurus 3.9 documentation site (see "Documentation Site" below)
│
├── scripts/                      # Root-level helper scripts (see "Scripts" below)
│   ├── start-webapp.cjs          # Detached webapp launcher (used by `npm run webapp`)
│   ├── parallel-upgrade.ts       # Parallel upgrade CLI helper
│   └── claude-doctor.cjs         # Claude Code plugin doctor script
│
├── .claude/                      # Claude Code plugin (see "Claude Code Plugin" above)
│   ├── commands/                 # Slash command markdown files
│   ├── skills/                   # Auto-applied skills (pantoum-conventions)
│   └── hooks/                    # session-start ASCII banner hook
│
├── assets/                       # Logo PNG files (various sizes)
├── examples/                     # Example configs (pantoum.patches.example.yml)
├── dist/                         # esbuild output (gitignored)
├── pantoum_history/              # Runtime: per-run history JSON (gitignored)
│
├── pantoum.settings.yml          # User-level settings (target version, AI flags, etc.)
├── pantoum.patches.yml           # Declarative patch rules (manualSteps, aiContexts, filters, ...)
├── package.json                  # Root engine scripts (build, start, webapp, test, parallel-upgrade)
├── build.js                      # Custom esbuild orchestrator (standard/production/optimized/compare/clean modes)
├── esbuild.config.js             # esbuild config used by build.js
├── tsconfig.json / tsconfig.prod.json
├── vitest.config.ts
├── CHANGELOG.md                  # Version history
├── CONTRIBUTING.md               # Contribution guide
├── SECURITY.md                   # Security policy
├── CODE_OF_CONDUCT.md
├── LICENSE                       # MIT
└── README.md
```

### Runtime Artifacts
- `pantoum_run_{runId}/` — per-run output directory in the repo being upgraded (patches, reports, debug files)
- `pantoum_history/pantoum_run_{runId}.json` — one history entry per run, written atomically via `src/core/historyWriter.ts`. The webapp's history page reads from this directory.
- Both directories are gitignored.

## Documentation Site (`website/`)

PANTOUM ships a **Docusaurus 3.9** documentation site under `website/`. It's a separate npm workspace — its `package.json` is not wired into the root `npm run` scripts.

### Running the docs site
```bash
cd website
npm install          # only on first run
npm start            # dev server on http://localhost:3000 (live reload)
npm run build        # static build to website/build/
npm run serve        # serve the static build locally
npm run clear        # clear Docusaurus cache
```

### Docs Structure (`website/docs/`)
| Category | Contents |
|----------|----------|
| `getting-started/` | installation, before-you-start, quick-start, authentication |
| `user-guide/` | webapp (Studio), cli, configuration, settings-reference |
| `features/` | ai-migration, claude-code-plugin, environment-config, fancy-names, reporting, third-party-deps, upgrade-analyzer |
| `architecture/` | overview, processing-flow, webapp-architecture |
| `guides/` | building, extensibility, testing, troubleshooting, windows-setup |
| `in-practice/` | how-pantoum-is-tested, upgrading-at-scale |
| `contributing/` | contributing, security |

### Other Site Content
- `website/src/pages/` — custom pages: `index.tsx` (homepage hero + feature grid), `overview.md`, `support-a-cause.md`
- `website/src/theme/` — theme overrides
- `website/src/css/custom.css` — Docusaurus theme customization
- `website/static/` — static assets served at site root, including standalone interactive HTML diagrams:
  - `architecture-flow.html` — system architecture flow
  - `ai-flow.html` — AI error resolution flow
  - `context-flow.html` — context building flow
- `website/sidebars.ts` — sidebar structure (Getting Started / Using Pantoum / Reference / Advanced / Contributing)
- `website/docusaurus.config.ts` — site config; base URL is `/pantoum/`, deployed to `https://pantoum-spfx.github.io/pantoum/`

## Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `start-webapp.cjs` | Detached webapp launcher used by `npm run webapp`. Builds, starts the server, waits for readiness, opens the browser, stores PID in tmpdir for `webapp:stop`. |
| `parallel-upgrade.ts` | Standalone CLI for parallel upgrades across many solutions. Run via `npm run parallel-upgrade` (uses `tsx`). |
| `claude-doctor.cjs` | Doctor script used by the Claude Code plugin (invoked from `/pantoum-doctor`). |

## Top-level Configuration Files

| File | Purpose |
|------|---------|
| `pantoum.settings.yml` | User-level engine settings (target version, AI flags, agent model, update flags). Loaded by `src/settingsLoader.ts`. |
| `pantoum.patches.yml` | Declarative patch rules: `manualSteps`, `aiContexts`, `patchFilters`, `versionCorrections`, `detectionPatterns`, `excludedPackages`. Loaded by `src/utils/manualLoader.ts`. |
| `build.js` | Custom esbuild orchestrator with `standard`/`production`/`optimized`/`compare`/`clean` modes (`npm run build[:prod|:opt|:compare|:clean]`). |
| `esbuild.config.js` | Shared esbuild config consumed by `build.js`. |
| `vitest.config.ts` | Vitest test runner config. |
| `tsconfig.json` / `tsconfig.prod.json` | TypeScript configs for dev vs production builds. |

## Build and Development

### Key Commands
```bash
npm run build        # TypeScript compilation (core engine)
npm start            # CLI interface
npm run webapp       # Launch webapp (build + serve)
npm run webapp:dev   # Webapp dev mode (Vite HMR + Express watch)
npm test             # Run vitest tests
```

### Environment Requirements
- Node.js 22+
- TypeScript 5.x
- M365 CLI (for SPFx operations)
- Claude API access (for AI features)

## Logo and Branding

### Visual Identity
- **Logo**: Squirrel mascot as PNG image
- **Colors**: Cyan primary, with status colors (green/red/yellow)
- **Webapp**: Animated squirrel during upgrade processing
- `assets/logo_medium.png` - Main logo file
- `pantoum-webapp/app/public/logo.png` - Webapp logo

## Development Guidelines

### Code Style
- **Strict TypeScript** - No any types except where explicitly needed
- **Functional approach** - Prefer pure functions and immutable data
- **Error handling** - Comprehensive try/catch with meaningful messages
- **Logging** - Use structured logging via utils/logger.ts

### Testing Strategy
- Test on real SPFx repositories
- Use test scripts in `scripts/` directory
- Unit tests with vitest (`src/__tests__/`)

### Key Patterns
- **Centralized defaults** - All defaults in `src/defaults.ts`
- **Hierarchical settings** with master/sub dependencies
- **Async workflows** with proper error propagation
- **Modular services** with clear interfaces
- **Comprehensive reporting** with multiple output formats

## Webapp Design Principles

- **Fluent UI v9** components for consistent Microsoft design language
- **Dark/light theme** support via themeStore
- **Real-time feedback** via WebSocket during upgrades
- **Color coding** - Status indication (green=success, red=error, yellow=warning)
- **Progress indicators** - Animated squirrel during upgrades, phase tracking
- **Report Design** - Executive summaries, detailed sections, clickable links

---

## Development Notes

### Recent Major Features
1. **Webapp Interface** - Full React + Fluent UI webapp replacing terminal TUI
2. **Claude Agent SDK** - Official SDK with metrics and performance tracking
3. **Claude Code Plugin** - Skill files for direct Claude Code integration
4. **Centralized Defaults** - All settings in `src/defaults.ts` (single source of truth)
5. **AI Performance Metrics** - Complete token, cost, and tool usage reporting
6. **WebSocket Streaming** - Real-time upgrade log streaming to webapp
7. **Scan Optimization** - Skip full solution scan when webapp provides exact paths
8. **Transparency Refactoring** - Hardcoded deterministic logic offloaded to declarative YAML in `pantoum.patches.yml` (patch filters, version corrections, detection patterns, deterministic steps, excluded packages)

### Technical Debt Notes
- Some type assertions in report generation (marked with any)
- Complexity analysis makes ~150 HTTP requests to npm (slow when enabled)
