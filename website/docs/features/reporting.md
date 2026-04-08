---
title: Reports
sidebar_label: Reports
sidebar_position: 3
description: Review Pantoum upgrade results through Markdown and JSON reports
---

# Reports

Pantoum writes reports so you can review the result of an upgrade instead of treating it as a black box.

## What You Get

Each run produces:

- a **Markdown summary** for fast human review
- a **JSON report** for full structured detail
- optional **per-solution reports** when you enable them

## Where They Live

Pantoum creates a `pantoum_run_*` directory for each run.

Typical files:

| File | Use |
|------|-----|
| `Pantoum_Upgrade_Report_{version}.md` | Fast review |
| `pantoum_final-report_{version}.json` | Full run detail |
| `pantoum_error_report_{version}.log` | Failure detail when something breaks |

If `per_solution_reports` is enabled, Pantoum also writes report copies inside each solution directory.

## What To Review First

Start with the Markdown report and look for:

- overall success or failure
- skipped or failed patches
- whether Claude had to step in
- whether follow-up work is still needed

Then open the JSON report if you need the full structured record.

## What The Reports Explain

Reports show:

- which patches were applied
- which patches were skipped or failed
- whether Claude was used
- what the upgrade status was for each solution

## Optional Plugin Workflow

If you use the Claude Code plugin, `/pantoum-analyze` can read these reports and help you inspect the result conversationally. That is optional; the reports remain the main artifact either way.

## Next Steps

- [Studio](/docs/user-guide/webapp)
- [CLI Reference](/docs/user-guide/cli)
- [Troubleshooting](/docs/guides/troubleshooting)
