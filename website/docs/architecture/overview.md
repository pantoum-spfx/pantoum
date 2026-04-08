---
title: How Pantoum Works
sidebar_label: How Pantoum Works
sidebar_position: 3
description: A light overview of Pantoum's upgrade flow
---

# How Pantoum Works

You do not need to understand Pantoum's full internals to use it well. The public story is simple: Pantoum scans your repository, applies the known upgrade work, uses Claude when recovery is needed, and writes reports so you can review the result.

## The Basic Flow

1. **Scan** your repository and find SPFx solutions
2. **Generate** the upgrade report through M365 CLI
3. **Apply** deterministic changes for the known upgrade work
4. **Use Claude** for M365 CLI issues and build failures when enabled
5. **Write reports** so the result is reviewable

## The Three Main Ideas

### Deterministic Patches

Pantoum does as much of the upgrade as possible through tracked, repeatable changes. This is the stable backbone of the tool.

### Claude-Assisted Recovery

When the deterministic path is not enough, Pantoum can ask Claude to help with M365 CLI issues and build failures. In the public release, Claude is the only supported runtime.

### Reports And Review

Pantoum always leaves behind reports so you can inspect the outcome and decide what still needs attention.

## What This Means For Users

You do not need to tune every part of Pantoum up front. Start with the main settings, run one upgrade, and let the reports tell you whether more customization is needed.

## Related Pages

- [Quick Start](/docs/getting-started/quick-start)
- [Studio](/docs/user-guide/webapp)
- [Reports](/docs/features/reporting)
