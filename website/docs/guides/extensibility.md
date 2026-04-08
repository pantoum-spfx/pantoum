---
title: Extensibility
sidebar_label: Extensibility
sidebar_position: 5
description: Extend PANTOUM with custom patches and AI migration contexts
---

# Extensibility

PANTOUM is designed to be fully extensible. Beyond the built-in SPFx upgrade path, you can define custom patches, dependency updates, and AI-powered migration contexts for any package through the `pantoum.patches.yml` configuration file.

## Two Extensibility Layers

| Layer | Method | Behavior |
|-------|--------|----------|
| **Deterministic** | `manualSteps` in `pantoum.patches.yml` | Always runs if condition matches |
| **AI (Claude Code)** | `aiContexts` with template files (`src/templates/*.md`) | Prompt-driven migration with verification |

The deterministic layer handles repeatable, predictable changes (version bumps, file modifications, JSON updates). The AI layer handles complex migrations that require code analysis, pattern recognition, and multi-file transformations.

## How It All Connects

The key to PANTOUM's extensibility is the link between deterministic patches and AI-powered migrations. Here's the flow:

PANTOUM reads a step from `pantoum.patches.yml` and checks whether it sets `requiresMigrationAnalysis`. If not, the step runs as a deterministic patch and stops there. If yes, PANTOUM looks up the matching `aiContext`, loads the referenced template file from `src/templates/*.md` (with variable substitution), and hands it to Claude Code to execute the migration. A verification loop then greps for the patterns the migration was supposed to remove — anything still present triggers another fix pass until it converges.

**Why combine `updateDependency` with AI?** The version bump in `package.json` is deterministic — PANTOUM can do that reliably. But the code migration across all your files (import changes, API updates, authentication patterns) requires Claude Code to analyze your codebase and make targeted fixes. That's why a single manual step can trigger both: the deterministic version bump AND an AI-powered code migration.

## Custom Patches (Manual Steps)

Manual steps are deterministic patches defined in `pantoum.patches.yml`. Each step has a unique ID, execution stage, optional condition, and a patch type.

### Execution Stages

| Stage | When | Use Case |
|-------|------|----------|
| `pre` | Before M365 CLI upgrade | Prepare project, remove blockers |
| `post` | After M365 CLI upgrade | Update third-party deps, clean up |
| `success` | After successful build | Verification steps |

### Conditions

Conditions control when a patch executes:

```yaml
# Always execute
condition:
  type: always

# Execute only if package version matches
condition:
  type: packageVersion
  packageName: "@pnp/sp"
  comparator: "<"        # < | > | >= | <= | =
  version: "4.0.0"
```

### Patch Types

#### updateDependency

Update a package version in package.json. Optionally trigger an AI migration for the code changes:

```yaml
# Real example from pantoum.patches.yml
- id: "M000001"
  description: "Upgrade @pnp/sp to v4 after SPFx upgrade"
  when: post
  condition:
    type: packageVersion
    packageName: "@pnp/sp"
    comparator: "<"
    version: "4.0.0"
  type: updateDependency
  file: package.json
  depType: dependencies          # dependencies | devDependencies
  packageName: "@pnp/sp"
  newVersion: "4.17.0"
  requiresMigrationAnalysis: true  # Trigger AI migration
  aiContext: "pnp-to-v4"           # Which AI context to use
```

#### removeDependency

Remove a package from package.json:

```yaml
- id: "M100002"
  type: removeDependency
  file: package.json
  depType: dependencies
  packageName: "@microsoft/mgt-spfx"
```

#### updateJsonSnippet

Merge JSON content into a file:

```yaml
- id: "M100003"
  type: updateJsonSnippet
  file: config/package-solution.json
  jsonPath: [solution]
  value:
    webApiPermissionRequests:
      - resource: "Microsoft Graph"
        scope: "TermStore.Read.All"
  mergeStrategy: "merge"       # merge | replace
  skipIfExists: true
```

#### removeJsonArrayElement

Remove an element from a JSON array:

```yaml
- id: "M100004"
  type: removeJsonArrayElement
  file: config/config.json
  jsonPath: [bundles, main-bundle, components]
  value:
    entrypoint: "./lib/extensions/oldExtension/OldExtension.js"
```

#### addFile

Create a new file:

```yaml
- id: "M100005"
  type: addFile
  file: config/rig.json
  content: |
    {
      "rigPackageName": "@pnp/spfx-controls-react"
    }
```

#### removeFile / renameFile / runShellCommand

```yaml
# Delete a file
- id: "M100006"
  type: removeFile
  file: config/obsolete-config.json

# Rename/move a file
- id: "M100007"
  type: renameFile
  file: config/old-name.json
  newFileName: config/new-name.json

# Run a shell command (subject to security allowlist)
- id: "M100008"
  type: runShellCommand
  command: "npm install"
```

## AI Migration Contexts

When a manual step has `requiresMigrationAnalysis: true`, PANTOUM triggers an AI-powered migration using Claude Code. The `aiContext` field links to a migration context that tells Claude Code what to do.

### How Prompts Are Built

Claude Code's migration prompt is assembled from template files in `src/templates/`. The `template` field in each aiContext specifies which template file to load.

PANTOUM builds the prompt from two pieces:

1. **Preamble** — loaded from `src/templates/migration-preamble.md` with variable substitution
2. **Package-specific template** — selected by the `template` field in the aiContext:

| Template | Used by |
|----------|-----------|
| `pnp-v4-migration.md` | `@pnp/sp` upgrade to v4 |
| `react-17-migration.md` | `react` upgrade to 17+ |
| `mgt-migration.md` | `@microsoft/mgt-spfx` migration |
| `fluent-ui-migration.md` | `office-ui-fabric-react` to `@fluentui/react` |
| `gulp-to-heft-migration.md` | Gulp to Heft script migration |
| `gulpfile-custom-migration.md` | Gulp to Heft with env injection |
| `scss-declaration-order-migration.md` | SCSS declaration order fixes |
| `generic-migration.md` | Any other package (fallback) |

Additionally, PANTOUM uses specialized prompt templates for error handling and verification:

| Template | Purpose |
|----------|---------|
| `build-error-fix.md` | Build/test error fix prompt |
| `m365-cli-error-fix.md` | M365 CLI parsing error fix |
| `eslint-optimization.md` | Bulk ESLint rule disabling |
| `migration-verification.md` | Post-migration grep verification |
| `migration-fix.md` | Fix for failed verification checks |
| `third-party-migration.md` | Third-party breaking change fix |
| `migration-preamble.md` | Standard migration preamble |
| `migration-preamble-removal.md` | Preamble for package removal |

Templates use Mustache-style variables (`{{packageName}}`, `{{fromVersion}}`, `{{toVersion}}`, `{{fromMajor}}`, `{{toMajor}}`, `{{actualTargetVersion}}`) and conditional blocks (`{{#if isRemoval}}...{{/if}}`).

### AIContext Fields

| Field | Used in | Purpose |
|-------|---------|---------|
| `description` | Logging | Human-readable name for the migration |
| `targetVersion` | Patch application | Target package version |
| `template` | Template selection | Name of the template file in `src/templates/` |

### Defining a Migration Context

```yaml
aiContexts:
  my-custom-migration:
    description: "Custom package migration"
    targetVersion: "2.0.0"
    template: "my-custom-migration"
```

The `template` field specifies which template file to load from `src/templates/`. In this example, PANTOUM would load `src/templates/my-custom-migration.md`. The template file contains all migration instructions for Claude Code — breaking changes, code patterns, migration steps, and verification rules should all be embedded directly in the template.

### Linking Context to Manual Steps

```yaml
manualSteps:
  - id: "M100001"
    description: "Upgrade custom-package to v2"
    when: post
    condition:
      type: packageVersion
      packageName: "custom-package"
      comparator: "<"
      version: "2.0.0"
    type: updateDependency
    file: package.json
    depType: dependencies
    packageName: "custom-package"
    newVersion: "2.0.0"
    requiresMigrationAnalysis: true
    aiContext: "my-custom-migration"

aiContexts:
  my-custom-migration:
    description: "Custom package v2 migration"
    targetVersion: "2.0.0"
    template: "my-custom-migration"
```

## Built-in Migration Contexts

PANTOUM ships with these pre-configured AI contexts in `pantoum.patches.yml`:

| Context | Package | Description |
|---------|---------|-------------|
| `pnp-to-v4` | `@pnp/sp` | PnP JS v1/v2/v3 to v4 migration |
| `react-17-lifecycle` | `react` | React lifecycle method updates |
| `mgt-spfx-deprecation` | `@microsoft/mgt-spfx` | MGT package replacement |
| `fluent-ui-v7-to-v8` | `office-ui-fabric-react` | Fluent UI migration |
| `gulp-to-heft-scripts` | -- | Gulp to Heft script migration |
| `gulpfile-custom-logic` | -- | Gulp to Heft with env injection |
| `scss-declaration-order` | -- | SCSS declaration order fixes |

## Best Practices

- **Create template files for custom migrations** — place them in `src/templates/` and reference them via the `template` field
- **Include build rules in all templates** to prevent common SPFx issues (`NEVER use npx tsc`)
- **Use specific conditions** to avoid running patches unnecessarily
- **Test incrementally** — add one patch at a time and verify
- **Keep IDs unique** — use a consistent numbering scheme (M100001+)
- **Embed all instructions in templates** — Claude Code operates exclusively on local files without web access, so all migration knowledge must be self-contained in the template files
