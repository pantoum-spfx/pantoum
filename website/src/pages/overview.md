---
title: PANTOUM Overview
description: PANTOUM is an SPFx upgrade automation tool that combines deterministic patches, AI self-healing, and reproducible runs.
---

# PANTOUM Overview

PANTOUM automates SharePoint Framework upgrades so you stop re-running the same manual cleanup on every release. It combines deterministic patches, AI-assisted error recovery, and reports you can hand off — and every run is reproducible from the same inputs, so there is no penalty for trying again.

## What Pantoum Does

Pantoum combines three ideas:

- **Deterministic patches** for the mechanical upgrade work that is the same every time
- **Claude-assisted recovery** for M365 CLI issues and build failures that are different every time
- **Reports** that document every change so you can review what happened and what still needs attention

You do not need to understand the internal engine before using it. The goal is to get you from scan to review with a smaller amount of manual cleanup — and to keep the run reproducible so you can iterate safely.

## The Basic Flow

1. Install Pantoum and run `npm run doctor`
2. Launch PANTOUM Studio (or use the CLI)
3. Scan your repository and configure the main settings
4. Run the upgrade and review the reports

## Three Interfaces, Same Engine

Pick whichever fits your workflow — the engine underneath is identical:

- **PANTOUM Studio** — React + Fluent UI webapp for solution selection, live upgrade monitoring, and report browsing. Recommended for most users.
- **`pantoum` CLI** — for scripting, automation, and CI/CD pipelines.
- **Claude Code plugin** — `/pantoum-upgrade`, `/pantoum-analyze`, `/pantoum-doctor`, `/pantoum-studio` slash commands for running upgrades and analysis without leaving your editor.

## What This Release Supports

- All three interfaces (Studio, CLI, Claude Code plugin)
- **Claude-only runtime support** in this public release
- **Neutral settings names** through `agent_provider` and `agent_model` so the configuration can accept other providers in the future

In v1, Pantoum is aimed at helping you start, run, and review upgrades more easily. It is not trying to explain every internal switch on the first page.

## Start Here

- [Quick Start](/docs/getting-started/quick-start)
- [Studio](/docs/user-guide/webapp)
- [Reports](/docs/features/reporting)
- [How Pantoum Works](/docs/architecture/overview)

---

*PANTOUM is free and open source under the MIT License.*
