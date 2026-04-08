---
title: Advanced Extensibility
sidebar_label: Extensibility
sidebar_position: 3
description: Advanced customization through pantoum.patches.yml
---

# Advanced Extensibility

`pantoum.patches.yml` is the advanced customization surface. You do not need it for a normal first upgrade.

Use it when the built-in upgrade flow is not enough and you want to add your own deterministic steps or migration contexts.

## What It Is For

- custom package migrations
- repository-specific deterministic steps
- advanced pre/post upgrade adjustments
- custom AI migration contexts

## Main Building Blocks

The file typically contains:

- `manualSteps` for deterministic changes
- `aiContexts` for advanced Claude-guided migration instructions

Start from the example file in the repository and adapt it to your project:

[`examples/pantoum.patches.example.yml`](https://github.com/pantoum-spfx/pantoum/blob/main/examples/pantoum.patches.example.yml)

## Example Shape

```yaml
manualSteps:
  - id: "M100001"
    description: "My custom patch"
    when: post
    condition:
      type: packageVersion
      packageName: "@pnp/sp"
      comparator: "<"
      version: "4.0.0"
    type: updateDependency
    file: package.json
    depType: dependencies
    packageName: "@pnp/sp"
    newVersion: "4.17.0"

aiContexts:
  my-custom-migration:
    description: "Custom migration"
    targetVersion: "2.0.0"
    template: "my-custom-migration"
```

## Recommended Approach

1. get a normal upgrade working first
2. add only the custom steps you actually need
3. keep changes small and explicit
4. test the result on a branch

## Where To Go Deeper

If you want the exact schema and behavior, use:

- the example configuration file
- the existing built-in templates
- the source code in the repository

This page is intentionally high level. The main public story for Pantoum remains installation, upgrade, and review.
