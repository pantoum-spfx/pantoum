---
title: Claude Code Plugin
sidebar_label: Claude Code Plugin
sidebar_position: 1
description: Optional Claude Code workflow for Pantoum
---

# Claude Code Plugin

The Claude Code plugin is an optional Pantoum workflow. Most users should start with Studio and only reach for the plugin if they prefer a conversational workflow.

## Available Commands

| Command | Purpose |
|---------|---------|
| `/pantoum` | Welcome screen and navigation |
| `/pantoum-doctor` | Check environment health |
| `/pantoum-upgrade` | Guided upgrade wizard |
| `/pantoum-analyze` | Analyze upgrade results |
| `/pantoum-studio` | Launch PANTOUM Studio |

## Getting Started

1. Clone and build Pantoum
2. Open Claude Code in the Pantoum directory
3. Use one of the slash commands above

## Doctor

`/pantoum-doctor` is the conversational version of `pantoum doctor`. Use it when you want a guided environment check inside Claude Code.

## Upgrade Wizard

`/pantoum-upgrade` walks through the same decisions you would normally make in Studio:

1. choose the solution path
2. choose the target version
3. choose the key AI settings
4. run the upgrade
5. inspect the reports

## Analyze

`/pantoum-analyze` reads the generated reports and helps you inspect the outcome. Use it when you want conversational help after the run, not as a replacement for the reports themselves.

## Studio

`/pantoum-studio` launches Studio at `http://localhost:5201`. It is equivalent to `npm run webapp`.

## When To Use The Plugin

Use the plugin when:

- you prefer guided prompts over the Studio UI
- you want to run Doctor or Analyze from Claude Code
- you are already working in Claude Code during an upgrade

Otherwise, start with [Studio](/docs/user-guide/webapp).
