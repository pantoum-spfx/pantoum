---
title: Settings Reference
sidebar_label: Settings Reference
sidebar_position: 4
description: Complete reference for the public Pantoum settings surface
---

# Settings Reference

This is the full public settings reference. The first-time workflow uses only a small set of settings, but the rest of the supported public surface is still available here.

## Where Settings Live

| Interface | Location | Use Case |
|-----------|----------|----------|
| **Studio + CLI** | `pantoum.settings.yml` and CLI flags | Normal upgrades |
| **Advanced extensibility** | `pantoum.patches.yml` | Custom patches and migration contexts |

## Main vs Advanced

Studio splits settings into:

- **Main** for the small set of upgrade decisions most teams need
- **Advanced** for the remaining supported controls

## Main Settings

| Setting | Purpose |
|---------|---------|
| `target_version` | Target SPFx version |
| `ai_fix_m365_errors` | Claude fixes M365 CLI upgrade issues |
| `ai_fix_build_errors` | Claude fixes build/test failures |
| `ai_max_retries` | Retry budget for AI-assisted fixing |
| `update_production_deps` | Third-party dependency update strategy |
| `per_solution_reports` | Save reports inside each solution directory |

## AI Runtime Contract

Pantoum already uses provider-neutral names in the public settings contract:

| Setting | Default | Notes |
|---------|---------|-------|
| `agent_provider` | `claude` | Fixed to Claude in this public release |
| `agent_model` | `sonnet` | Supported values: `sonnet`, `opus` |
| `thinking_effort` | `medium` | Advanced tuning for Claude reasoning effort |

Older `claude_model` values are still read and normalized to `agent_model` for backward compatibility.

## Advanced Settings

### AI Runtime

| Setting | Default | Notes |
|---------|---------|-------|
| `agent_model` | `sonnet` | `sonnet` or `opus` |
| `thinking_effort` | `medium` | Advanced tuning for Claude behavior |

### Engine And Recovery

| Setting | Default | Notes |
|---------|---------|-------|
| `excluded_patches` | `[]` | Skip specific patches |
| `env_injection_strategy` | `webpack-patch` | Heft-related env handling |
| `continue_on_solution_fail` | `false` | Continue after a failed solution |
| `max_parallel_upgrades` | `4` | Studio parallelism limit |
| `analyze_complexity` | `false` | Studio keeps this off by default |
| `include_dev_deps_complexity` | `false` | Complexity analysis detail |
| `ai_fix_third_party_errors` | `true` | Claude follow-up for dependency breakage |
| `ai_fix_eslint_properly` | `true` | Prefer real code fixes over disable comments |
| `ai_fix_typescript_warnings` | `true` | Fix TypeScript warnings after the upgrade |

### Version Updates

| Setting | Default | Notes |
|---------|---------|-------|
| `update_version_numbers` | `true` | Master switch |
| `update_package_json` | `true` | Package version bump |
| `update_readme_files` | `true` | README updates |
| `update_version_badges` | `true` | Badge updates |
| `maintain_version_history` | `true` | README history entries |
| `version_comment` | `Upgraded to {SPFxVersion}` | History text template |

### Dependencies, Output, And Templates

| Setting | Default | Notes |
|---------|---------|-------|
| `update_dev_deps` | `none` | Dev dependency updates |
| `clean_install_after_updates` | `true` | Clean reinstall after updates |
| `write_pantoum_history` | `true` | Keep run history |
| `update_nvmrc_file` | `true` | PnP template support |
| `update_devcontainer_config` | `true` | PnP template support |
| `disable_animations` | `false` | Studio UI preference |

## Common CLI Mappings

| Setting | CLI Flag |
|---------|----------|
| `target_version` | `--toVersion` |
| `agent_provider` | `--agentProvider` |
| `agent_model` | `--agentModel` |
| `ai_fix_m365_errors` | `--aiFixM365Errors` |
| `ai_fix_build_errors` | `--aiFixBuildErrors` |
| `ai_max_retries` | `--aiMaxRetries` |
| `update_production_deps` | `--updateThirdPartyDeps` |
| `per_solution_reports` | `--perSolutionReports` |

## Settings Merge Order

Highest priority wins:

1. CLI flags
2. `pantoum.settings.yml`
3. built-in defaults
