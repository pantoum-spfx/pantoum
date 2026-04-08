---
description: PANTOUM codebase conventions and safety rules
user-invocable: false
---

# PANTOUM Conventions

These conventions are automatically applied when working in the PANTOUM codebase.

## Template Safety

All AI prompts live in `src/templates/*.md`. Changes to templates affect how Claude Code interacts with user codebases during upgrades.

**Rules:**
- Any change to a template file requires re-testing against the PuntoBello suite of SPFx solutions
- Do not hardcode prompts in source code — use the template system
- Templates use Mustache-style substitution (`{{variable}}`) and conditional blocks (`{{#if condition}}...{{/if}}`)

## SDK Caution

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is a critical dependency. Version changes can alter AI behavior during upgrades.

**Rules:**
- Do not upgrade the Agent SDK without testing against real SPFx solutions
- Document any SDK version changes in commit messages
- If upgrading, verify that metrics tracking (tokens, cost, tools) still works correctly

## Defaults Source of Truth

`src/defaults.ts` is the **single source of truth** for all default values.

**Rules:**
- Never define default values in `src/cli.ts` or other files
- All files that need defaults must import from `src/defaults.ts`
- When adding a new setting, add the default in `src/defaults.ts` first

## Cross-Platform Scripts

All scripts must work on Windows, macOS, and Linux.

**Rules:**
- Use Node.js (`#!/usr/bin/env node`) for scripts, not bash or PowerShell
- Use `path.join()` for paths, not hardcoded separators
- Use `child_process.execSync` for commands, not shell-specific syntax
- Exception: `scripts/sync-to-public.sh` is bash (only runs on dev machine)

## Security

**Rules:**
- No web browsing in AI prompts — all migration instructions must be self-contained
- WebFetch and WebSearch tools are intentionally removed from the adapter
- Never include API keys, tokens, or credentials in templates or committed files
- Sanitize user input at system boundaries
