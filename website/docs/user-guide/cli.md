---
title: CLI Reference
sidebar_label: CLI
sidebar_position: 1
description: Command-line interface reference for Pantoum
---

# CLI Reference

The CLI is the direct path for scripting, automation, and terminal-first workflows. The public release uses neutral `agent_*` naming, but the supported runtime is still Claude only.

## Prerequisite

The examples below assume `pantoum` is available on your PATH. Pantoum isn't published to npm, so expose the local build as a global command with `npm link`:

```bash
git clone https://github.com/pantoum-spfx/pantoum.git
cd pantoum
npm install
npm run build
npm link
```

If you don't want the global command, run any example via `node dist/cli.js ...` from the repo root instead.

## First Commands

Check the local setup:

```bash
pantoum doctor
```

Run a straightforward upgrade:

```bash
pantoum --localPath ./my-spfx-project --toVersion 1.23.0

pantoum \
  --localPath ./my-project \
  --toVersion 1.23.0 \
  --aiFixM365Errors true \
  --aiFixBuildErrors true
```

Use Opus when you expect a harder upgrade:

```bash
pantoum --localPath ./my-project --toVersion 1.23.0 --agentModel opus
```

## Common Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--localPath` | string | `.` | Path to repository containing SPFx solutions |
| `--toVersion` | string | `1.23.0` | Target SPFx version |
| `--agentProvider` | string | `claude` | AI runtime for this public release |
| `--agentModel` | string | `sonnet` | Claude model: `sonnet` or `opus` |
| `--aiFixM365Errors` | boolean | `true` | Use AI to fix M365 CLI upgrade errors |
| `--aiFixBuildErrors` | boolean | `true` | Use AI to fix build/test errors |
| `--aiMaxRetries` | number | `3` | Max AI retry iterations |
| `--updateThirdPartyDeps` | `none` \| `patch` \| `minor` \| `major` | `none` | Strategy for production dependencies |
| `--perSolutionReports` | boolean | `false` | Save reports inside each solution directory |
| `--onSingleSolutionFail` | `halt` \| `continue` | `halt` | Behavior when a solution fails |
| `--excludeSolutions` | string[] | `[]` | Solution name patterns to skip |
| `--excludePatchIds` / `-e` | string[] | `[]` | Patch IDs to skip |
| `--silent` / `-s` | boolean | `false` | Suppress INFO-level logs |

## Model Values

| Value | Use Case |
|-------|----------|
| `sonnet` | Default for most upgrades |
| `opus` | More difficult upgrades |

## Reports

Every CLI run writes report files you can review later. The main ones are:

| File | Purpose |
|------|---------|
| `Pantoum_Upgrade_Report_{version}.md` | Human-readable summary |
| `pantoum_final-report_{version}.json` | Machine-readable run data |
| `pantoum_error_report_{version}.log` | Error details on failure |

See [Reports](/docs/features/reporting) for the review path.

## Full Reference

For the complete public settings surface, including advanced settings and YAML mappings, see [Settings Reference](/docs/user-guide/settings-reference).
