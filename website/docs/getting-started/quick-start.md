---
title: Quick Start
sidebar_label: Quick Start
sidebar_position: 3
description: Run your first Pantoum upgrade with the smallest useful set of decisions
---

# Quick Start

This is the shortest useful path to a first upgrade.

## Launch Studio

Pantoum Studio is the recommended entry point:

```bash
npm run webapp
```

Open `http://localhost:5201`.

## Start With The Main Settings

Use the small set of settings most teams actually need:

- `target_version`
- `ai_fix_m365_errors`
- `ai_fix_build_errors`
- `ai_max_retries`
- `update_production_deps`
- `per_solution_reports`

Everything else can wait until you know you need it.

## Example Settings File

Pantoum stores its main settings in `pantoum.settings.yml`:

```yaml
target_version: "1.23.0"
agent_provider: "claude"
agent_model: "sonnet"
ai_fix_m365_errors: true
ai_fix_build_errors: true
ai_max_retries: 3
update_production_deps: "none"
per_solution_reports: false
```

`agent_provider` is fixed to `claude` in this public release.

## Run The Upgrade

1. Open **Settings** and confirm the main values
2. Go to **Upgrade**
3. Scan your repository
4. Select the SPFx solutions you want to process
5. Run the upgrade
6. Open **Reports** when it completes

## What You Will See

Pantoum will:

- detect SPFx solutions
- generate an upgrade report
- apply deterministic changes
- use Claude for M365 CLI issues and build failures when enabled
- write reports for review

The goal is not to hide what happened. The goal is to make the upgrade easier to run and easier to review.

## Review The Result

Use the reports to inspect:

- which patches were applied
- whether Claude had to fix anything
- whether the solution still needs follow-up

See [Reports](/docs/features/reporting) for the output format.

## CLI Alternative

```bash
pantoum \
  --localPath ./my-spfx-project \
  --toVersion 1.23.0 \
  --aiFixM365Errors true \
  --aiFixBuildErrors true
```

If you need a stronger Claude model for a difficult upgrade:

```bash
pantoum --localPath ./my-spfx-project --toVersion 1.23.0 --agentModel opus
```

## Next Steps

- [Studio](/docs/user-guide/webapp)
- [Reports](/docs/features/reporting)
- [How Pantoum Works](/docs/architecture/overview)
- [Settings Reference](/docs/user-guide/settings-reference)
