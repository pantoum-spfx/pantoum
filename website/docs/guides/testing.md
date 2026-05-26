---
title: Testing Guide
sidebar_label: Testing
sidebar_position: 2
description: Testing PANTOUM migrations
---

# Testing Guide

This guide covers how to test PANTOUM migrations on real SPFx repositories.

## Prerequisites

1. PANTOUM built and available (see [Building](./building.md))
2. Access to test repositories
3. Git command-line tools

## Step-by-Step Testing

### 1. Reset Repository to Pre-Upgrade State

```bash
cd /path/to/your-spfx-repo

# Find the commit before a previous upgrade
git log --oneline --grep="upgrade\|spfx" -20

# Create a backup branch
git checkout -b backup-current-$(date +%Y%m%d)

# Reset to the pre-upgrade commit
git checkout main
git reset --hard <commit-hash-before-upgrade>
```

### 2. Run PANTOUM Migration

```bash
cd /path/to/pantoum

node dist/cli.js \
  --localPath /path/to/your-spfx-repo \
  --toVersion 1.23.0 \
  --onSingleSolutionFail continue \
  --perSolutionReports true \
  --aiFixM365Errors true
```

### 3. Save and Compare Results

```bash
cd /path/to/your-spfx-repo
git add -A
git commit -m "PANTOUM migration results"

# Compare with the backup branch
git diff backup-current-* -- src/**/*.ts
```

## Test Repositories

PANTOUM can be tested against the PuntoBello open-source SPFx solutions:

- **puntobello-realtimenews** - Real-time news web part
- **puntobello-multilingualdocument** - Multilingual document management
- **puntobello-userapps** - User apps web part and extension
- **puntobello-anchor** - In-page navigation components

```bash
mkdir -p /path/to/test-solutions && cd /path/to/test-solutions

git clone https://github.com/diemobiliar/puntobello-realtimenews.git
git clone https://github.com/diemobiliar/puntobello-multilingualdocument.git
git clone https://github.com/diemobiliar/puntobello-userapps.git
git clone https://github.com/diemobiliar/puntobello-anchor.git
```

## What to Look For

### In Migration Reports

- Patch application results (applied, skipped, or failed)
- AI-generated fix details
- Build and test outcomes
- Third-party dependency updates

### In Code Changes

- SPFx framework references updated to target version
- Configuration files patched appropriately
- Dependencies updated in `package.json`
- TypeScript compilation succeeds after migration

### Success Indicators

- Build succeeds after migration (`npm run build`)
- No runtime errors with core operations
- Reports mention all expected patches
- Code changes align with the target SPFx version

## Finding Pre-Upgrade Commits

```bash
# Search commit messages
git log --oneline | grep -i "upgrade\|spfx\|version"

# Find when a dependency changed
git log -G'"@microsoft/sp-core-library"' --oneline package.json

# Use git blame on package.json
git blame package.json | grep "@microsoft/sp-"
```

## Troubleshooting Tests

- **Dirty repository**: Run `git stash` or `git reset --hard HEAD`
- **Return to original state**: `git checkout main && git pull`
- **Migration fails**: Check `pantoum_run_*/` directories and console output

## Best Practices

- Always create backup branches before testing
- Compare reports between different migration runs
- Test the build after migration to ensure it compiles
- Start with conservative settings, then enable AI features incrementally
