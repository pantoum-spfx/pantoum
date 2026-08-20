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

## GitHub Copilot

Pantoum can also run its AI stages on GitHub Copilot. Set `agent_provider: "github-copilot"` (or pass `--agentProvider github-copilot`) and pick a model with `agent_model`:

| Model | Flag Value |
|-------|-----------|
| GPT-5 (default) | `gpt-5` |
| GPT-5 mini | `gpt-5-mini` |
| MAI Code Flash (current variant) | `mai-code-1-flash-picker` |
| MAI Code 1.1 Flash (pinned) | `mai-code-1.1-flash` |

Authentication comes from the Copilot CLI's own login — install the [GitHub Copilot CLI](https://github.com/github/copilot-cli) and sign in once with `copilot`, then Pantoum uses that session.

Model availability depends on your Copilot plan and, on Business/Enterprise plans, on the organization's Copilot model policies — some models are off by default until an administrator enables them. A model your plan does not serve fails at session start with `Model "…" is not available`; Pantoum reports this as a provider-side failure. `mai-code-1-flash-picker` routes to the MAI Code variant your plan currently serves, so it keeps working when pinned model ids are rotated or policy-gated — prefer it unless you need a specific pinned variant.

The prompts are the same for both runtimes. Only the execution backend changes.

## Usage Visibility

Pantoum writes AI usage details into its reports so you can see what the AI did and how much it cost.

## Next Steps

- [Quick Start](./quick-start.md)
- [Studio](/docs/user-guide/webapp)
- [Settings Reference](/docs/user-guide/settings-reference)
