---
title: Security
sidebar_label: Security
sidebar_position: 3
description: What PANTOUM does on your machine
---

# Security

## What leaves your machine during an upgrade

PANTOUM runs locally against your SPFx repositories. The only outbound traffic an upgrade generates is:

- **Claude API** — PANTOUM's AI features route through the Claude Agent SDK, using either your Claude Code subscription or an `ANTHROPIC_API_KEY` in your environment. This is the only AI-side traffic.
- **npm registry** — the solution's own `npm install` during the upgrade, plus optional version lookups for the third-party dependency updater and Studio's SPFx version picker.

M365 CLI's `m365 spfx project upgrade` runs locally against your project files to generate the upgrade report — no Microsoft 365 tenant login is required for this command. PANTOUM itself adds no telemetry, no analytics endpoint, and doesn't phone home.

## PANTOUM does not use Claude to browse the web

When PANTOUM hands a task to Claude — a build fix, a PnP migration, a template-driven migration — the tool set is an explicit whitelist: `Read`, `Edit`, `Write`, `MultiEdit`, `Grep`, `Glob`, `LS`, `Bash`. **`WebSearch` and `WebFetch` are never enabled.**

Claude gets its instructions from the templates shipped with PANTOUM (`src/templates/*.md`) — it does not search the web for the error, pull an answer off StackOverflow, or browse package docs. Every prompt is self-contained, every tool call is logged in the run report, and you can audit the entire AI interaction before you commit anything.

If you want to verify this yourself:

```bash
grep -rn allowTools src/ pantoum-webapp/server/
```

Every call site lists its tools explicitly — none include web tools.

## Running PANTOUM safely

A few habits worth having regardless of the tool:

1. **Run against a branch**, not main. Every run writes to `pantoum_run_{runId}/` so you can diff and cherry-pick.
2. **Prefer Claude Code's native auth** over a hardcoded `ANTHROPIC_API_KEY` in scripts or CI.
3. **Read the Markdown report before you commit.** Every AI action is tracked as a patch with an id, a description, and a before/after.
4. **Isolate untrusted codebases.** For unknown or sensitive repositories, run in a fresh container or a disposable workspace.
5. **Keep Node.js and M365 CLI up to date.**
