---
title: Upgrading at Scale
sidebar_label: Upgrading at Scale
sidebar_position: 2
description: Workflow and best practices for upgrading many SPFx solutions
---

# Upgrading at Scale

## Where PANTOUM Shines

While PANTOUM works well for upgrading a single solution, the real value emerges when upgrading many solutions. The iterative refinement process — tuning your configuration, learning from edge cases, and building confidence in the results — is what makes it powerful at scale.

## The Three-Phase Approach

Work in three passes: **Explore** a small sample, **Refine** your configuration based on what you saw, then **Execute** against the full codebase. If the Refine pass surfaces new surprises, loop back to Explore with a different sample before committing to the full run.

### Phase 1: Explore

Pick 2–3 representative solutions — ideally ones that cover your typical patterns (simple web parts, complex solutions with many dependencies, solutions using PnP JS or Fluent UI). Run PANTOUM against them and review the results carefully. Look at the diffs, check the reports, and note any edge cases.

### Phase 2: Refine

Based on what you learned, update your `pantoum.patches.yml`. Adjust AI settings, dependency strategies, or version update flags. Re-run on the same solutions and compare. Iterate until you're satisfied with the quality and consistency of the results. If something unexpected appears, go back to Explore with different solutions.

### Phase 3: Execute

Once your configuration is dialed in, run against the full codebase. Review the results — the reports and diffs should look familiar from your exploration phase. Solutions that fail can be investigated individually.

:::tip Parallel Upgrades
The webapp includes a parallelism slider that lets you process multiple solutions simultaneously. Start with sequential processing (parallelism = 1) during the Explore phase, then increase parallelism during Execute for faster throughput.
:::

## Monitoring Token Usage

Start small and check your usage before scaling up.

- **Claude Code subscription**: Use `/usage` in Claude Code to check your consumption. Note that usage statistics may have a slight delay. Claude Code subscriptions have weekly token limits — during mass upgrades, you may hit these limits. Plan accordingly.
- **Anthropic API key**: Per-operation costs appear directly in PANTOUM's JSON and Markdown reports, giving you precise cost tracking for each solution.

## Choosing Your Authentication Method

Both authentication methods work for mass upgrades, with different trade-offs:

- **Claude Code subscription** — Convenient, no API key management. However, weekly token limits may require spreading large upgrades across multiple days.
- **Anthropic API key** — Pay-per-use with no weekly limits. Per-operation costs appear in reports, providing better traceability for large-scale operations. Useful when you need predictable, uninterrupted execution.

See [Authentication](/docs/getting-started/authentication) for setup instructions.

## Getting Debugging Help

At scale, the generated reports matter even more than they do for a single solution.

Start with the Markdown and JSON reports, and if you use the Claude Code plugin you can optionally run `/pantoum-analyze` against those results for conversational follow-up.

## Third-Party Dependencies at Scale

:::warning
Enabling third-party dependency updates on many solutions simultaneously can produce very large diffs that are difficult to review. This is especially true with `minor` or `major` update strategies.
:::

A more controlled approach:

1. Run PANTOUM on a few solutions first to gather which packages need updating
2. Review the third-party dependency reports to understand the scope
3. Create targeted patches with AI context via the [extensibility system](/docs/guides/extensibility), focusing on specific packages across your codebase
4. Apply updates incrementally rather than all at once
