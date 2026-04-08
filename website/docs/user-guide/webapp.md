---
title: Studio
sidebar_label: Studio
sidebar_position: 2
description: Pantoum Studio for scanning, upgrading, and reviewing SPFx solutions
---

# Studio

Pantoum Studio is the recommended way to use Pantoum. It gives you a simple path for scanning solutions, choosing the main controls, running the upgrade, and reviewing the result.

## Getting Started

```bash
npm run webapp
```

Open `http://localhost:5201`.

## Main Pages

Studio centers on four pages:

### Home

The starting point for the main workflows.

### Settings

A settings editor backed by `pantoum.settings.yml`.

- **Main** for the most common controls
- **Advanced** for the remaining public controls

### Upgrade

The main workflow:

- scan the repository
- choose the solutions you want to process
- run the upgrade
- follow progress live

### Reports

Browse the Markdown and JSON output from `pantoum_run_*` directories.

## Main Settings

The public onboarding path is built around these settings:

- `target_version`
- `ai_fix_m365_errors`
- `ai_fix_build_errors`
- `ai_max_retries`
- `update_production_deps`
- `per_solution_reports`

Advanced settings are still available, but they are intentionally not the first thing a new user sees.

## Where Settings Are Saved

Studio saves its settings to `pantoum.settings.yml`.

## Studio vs CLI

| Feature | CLI | Webapp |
|---------|-----|--------|
| Automation/scripting | Yes | No |
| Solution discovery | Manual path | Auto-scan |
| Configuration | Command-line flags | Visual settings editor |
| Progress tracking | Text output | Live progress view |
| Report viewing | File-based | Integrated report browser |

## Troubleshooting

If Studio does not start:

- confirm Node.js 22+
- confirm ports `5201` and `5200` are free
- rerun `npm run doctor`
- restart `npm run webapp`

For the broader troubleshooting list, see [Troubleshooting](/docs/guides/troubleshooting).
