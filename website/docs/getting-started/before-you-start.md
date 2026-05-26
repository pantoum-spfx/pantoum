---
title: Before You Start
sidebar_label: Before You Start
sidebar_position: 2
description: Important context before your first upgrade
---

# Before You Start

Pantoum edits source files, configuration, and dependencies in your repository. Treat the first run like a real upgrade operation, not a demo command.

## Work On A Branch

Always run Pantoum against a local git clone on a dedicated branch.

```bash
git checkout -b upgrade/spfx-1.23.0
```

## Pantoum Only Upgrades

Pantoum supports upgrading to newer SPFx versions. Downgrades are blocked. If a solution is already at the target version, Pantoum skips it.

## What Affects Success

A first run is usually smoother when:

- the version gap is modest
- the solution is reasonably standard
- third-party dependencies are not heavily outdated
- the project already builds cleanly before the upgrade

Pantoum is still useful on harder projects, but the remaining manual work tends to increase with project complexity.

## Review The Result

Do not merge an upgrade just because the command finished. Review the changes and the report.

```bash
git diff
```

Use the generated [Reports](/docs/features/reporting) as the explanation of what Pantoum changed.

## Keep The First Run Simple

For the first pass, stay close to the main settings:

- `target_version`
- `ai_fix_m365_errors`
- `ai_fix_build_errors`
- `ai_max_retries`
- `update_production_deps`
- `per_solution_reports`

Advanced customization through `pantoum.patches.yml` is available later if you need it.
