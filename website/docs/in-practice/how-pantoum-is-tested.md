---
title: How PANTOUM Is Tested
sidebar_label: How PANTOUM Is Tested
sidebar_position: 1
description: Testing methodology and reliability approach
---

# How PANTOUM Is Tested

## Determinism by Design

PANTOUM is designed to produce consistent, predictable results. The M365 CLI patches and dependency updates are fully deterministic — the same input always produces the same output. For the AI-powered phases, prompts are carefully engineered with structured constraints, and a self-verification loop ensures that critical patterns are correctly applied before a migration is marked complete.

That said, Claude Code is powered by large language models, which are inherently non-deterministic. Given the same error, Claude Code may choose a slightly different fix path or produce a slightly different code edit from one run to another. In practice, the end result — a cleanly building solution with the correct patterns applied — is highly consistent across runs, even if the individual edits are not identical.

This is a strength, not a limitation. Claude Code's ability to reason about code means it can adapt to codebases it has never seen before, handle edge cases that rigid tooling would miss, and produce fixes that are contextually appropriate rather than templated.

## Regression Testing

Even successful upgrades need re-testing when PANTOUM's code changes. Upgrading the Claude Agent SDK, adjusting prompt templates, or modifying upgrade logic can significantly impact both upgrade quality and token costs. A change that improves one solution might regress another. Changes are measured carefully — not just "does it still build?" but "are the diffs reasonable and the token usage acceptable?"

## The PuntoBello Test Suite

PANTOUM is tested against 8 real-world SPFx solutions from [PuntoBello](https://github.com/diemobiliar), an open-source library by [die Mobiliar](https://github.com/diemobiliar). These are production-grade solutions with varying complexity — different web part types, diverse dependency sets, and real-world patterns.

Testing uses old commits to simulate genuine upgrades (e.g., upgrading a solution from SPFx 1.18 to 1.22). Each change to PANTOUM's upgrade engine is verified by re-running upgrades against these solutions and carefully reviewing the diffs. This catches regressions that automated tests alone would miss: unnecessary file changes, suboptimal AI fixes, or inflated token usage.

## Careful Evolution

Changes to the upgrade engine are deliberately planned and tested. The codebase evolves, but the author has learned to be very careful about changes that affect how solutions are upgraded and how many tokens are consumed. A seemingly minor prompt adjustment can cascade into different AI behavior across multiple solutions. This is why every change to the upgrade pipeline is validated against the full PuntoBello test suite before release.
