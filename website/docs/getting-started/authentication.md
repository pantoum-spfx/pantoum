---
title: Authentication
sidebar_label: Authentication
sidebar_position: 4
description: Configure Claude authentication for Pantoum
---

# Authentication

Pantoum uses Claude for AI-assisted recovery in the public release.

## Choose One Authentication Method

You only need one of these:

### Claude Code Subscription

If you already use Claude Code, Pantoum can reuse that authentication automatically. This is the easiest option.

### Anthropic API Key

Alternatively, set the `ANTHROPIC_API_KEY` environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
```

Get your API key from the [Anthropic Console](https://console.anthropic.com/).

## Verify Your Setup

Run the built-in doctor command:

```bash
npm run doctor
```

This checks Node.js, M365 CLI, Claude access, and the local Pantoum setup.

:::note
M365 CLI runs locally to generate upgrade reports. No Microsoft 365 tenant login is required.
:::

## Choosing A Model

The public release supports these Claude model values:

| Model | Flag Value | Best For |
|-------|-----------|----------|
| **Sonnet** (default) | `sonnet` | Most upgrades |
| **Opus** | `opus` | More difficult upgrades |

Set it via CLI flag or Advanced settings in Studio:

```bash
pantoum --localPath ./project --toVersion 1.23.0 --agentModel opus
```

`agent_provider` is fixed to `claude` in this public release.

## Usage Visibility

Pantoum writes Claude usage details into its reports so you can see what the AI did and how much it cost.

## Next Steps

- [Quick Start](./quick-start.md)
- [Studio](/docs/user-guide/webapp)
- [Settings Reference](/docs/user-guide/settings-reference)
