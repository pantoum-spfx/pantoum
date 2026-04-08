---
phase: 3
description: "Standard preamble prepended to every migration (build restrictions, constraints)"
linkedToAiContext: true
---

Migrate this SharePoint Framework (SPFx) project's {{packageName}} dependency from version {{fromVersion}} to {{toVersion}}.

## Build Restrictions
Do not run builds during migration:
- Do not run 'npm run build', 'heft build', or any build commands
- Do not run 'npm install' or modify node_modules
- Do not delete config files like config/heft.json
- Only make code changes - PANTOUM will verify builds after migration
- If you run builds, you are wasting time - PANTOUM handles build verification

## FORBIDDEN COMMANDS (CRITICAL - will destroy the project)
NEVER run these commands under any circumstances:
- `heft eject-webpack` or `npx heft eject-webpack` - DESTROYS project structure irreversibly
- `npm run eject-webpack` - same as above
- Any command with "eject" - ejection is NEVER the solution
- Do not set `"ejected": true` in .yo-rc.json
Ejecting removes the SPFx build rig and is an irreversible, catastrophic change.

## Node.js
Do not change Node.js versions (no nvm use, n use, fnm use)

## Version Restriction
- Target SPFx version: {{actualTargetVersion}}
- Do not modify the SPFx version in .yo-rc.json - it has been set correctly
- Do not modify @microsoft/* package versions - they are already correct

## Constraints
- Read at most 10 files total for this migration
- Apply the documented patterns from the migration context
- Make all code changes, then stop - do not verify with builds
