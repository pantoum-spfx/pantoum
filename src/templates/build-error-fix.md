---
phase: 5
description: "Analyzes build/test errors and applies targeted code fixes"
---

Fix {{targetDescription}} in SharePoint Framework (SPFx) solution "{{solutionName}}".

Version restriction:
- Target SPFx version: {{targetVersion}}
- Do not modify the SPFx version in .yo-rc.json - it has been set correctly
- Do not modify @microsoft/* package versions in package.json - they are already correct
- You CAN fix invalid dependency versions (like TypeScript) if they don't exist in npm registry

Constraints (violating these will cause upgrade failure):
- Do not delete any files in the config/ directory (heft.json, rig.json, etc.)
- Do not run 'rm' commands on config files - the build system needs them
- Do not downgrade any dependency version - fix the code instead
- Do not create custom webpack configurations
- Do not loosen TypeScript settings (strict, noImplicitAny, strictNullChecks)
- Do not simplify build scripts - the package-solution step is required
- Do not explore with 'npx heft --help' or similar - use the build command as-is

FORBIDDEN COMMANDS (CRITICAL - will destroy the project):
- NEVER run 'heft eject-webpack', 'npx heft eject-webpack', or 'npm run eject-webpack'
- NEVER run ANY command containing 'eject' - ejection is NEVER the solution
- Ejecting removes the SPFx build rig and is an irreversible, catastrophic change

Context:
This code was working before the SPFx upgrade. Your goal is to make it compile while preserving its functionality.
The errors are due to version incompatibilities, not broken business logic.

{{errorType}} OUTPUT:
```
{{errorOutput}}
```

AVAILABLE FILES:
{{contextFilesList}}

Approach:
1. Read ALL files mentioned in errors FIRST, before making any edits
2. Plan ALL fixes based on what you read - understand the full picture
3. Apply ALL fixes in one batch using Edit/MultiEdit
4. Run 'npm run build' ONCE after all fixes are applied
5. If errors persist, read the NEW errors, plan fixes, apply all at once, build again

Constraints:
- Read at most 5 files total - no exploration with find/ls/grep
- Do not run bash commands to explore the codebase
- Batch your edits - don't interleave reads/edits/builds
- Run 'npm run build' at most {{maxBuildRetries}} times total
- If you cannot fix an error, document it and move on

ESLint config format (common issue):
- .eslintrc.js requires rules inside a 'rules:' object wrapper
- Wrong: module.exports = { extends: [...], '@typescript-eslint/no-unused-vars': 'off' }
- Correct: module.exports = { extends: [...], rules: { '@typescript-eslint/no-unused-vars': 'off' } }

Unused variable patterns:
- For catch blocks: use 'catch (_error)' or 'catch' (empty) not 'catch (error)'
- For parameters: prefix with underscore '_param' to indicate intentionally unused
- Don't add eslint-disable comments for simple unused variable fixes

Heft build system (SPFx 1.22+):
- 'heft build --clean' - standard build
- 'heft build --production' - production build
- 'heft package-solution' - package the solution
- 'heft package-solution --production' - package for production
- Use 'npm run build' to run the build script

TypeScript strict mode patterns (batch these - apply ALL at once):
- TS2564 "has no initializer": Add '!' after property name (definite assignment assertion)
  Example: private _items: Item[]; → private _items!: Item[];
- TS2532 "possibly undefined": Use optional chaining (?.) or nullish coalescing (??)
  Example: obj.prop → obj?.prop or obj.prop ?? defaultValue
- TS2345 "Argument type": Add type assertion or fix the type
  Example: fn(value) → fn(value as ExpectedType)
- Apply ALL definite assignment fixes in ONE edit per file - don't do them one at a time

{{#if hasTypeScriptWarnings}}TypeScript warning patterns (appear as "Warning:" not "Error:"):
- TS7053 "Element implicitly has 'any' type because expression can't be used to index":
  This happens when accessing array index on an object typed as single value
  Example: obj.property[0] where property is typed as T not T[]
  Fix: Check interface definition - if data is an array, update type to T[]
  Fix: If data is not an array, remove the [0] index access
- TS7006 "Parameter implicitly has 'any' type": Add explicit type annotation
- TS18048 "value is possibly undefined": Use optional chaining (?.) or null check

Note: The build output contains both "Error -" and "Warning -" lines.
Fix both types. Warnings are not optional - they must be resolved.

{{/if}}Principles:
- The code was working before the upgrade - respect existing logic
- Compilation errors are usually about syntax/API changes, not logic flaws
- If you don't understand why code exists, it's probably important
- Preserve state management and pagination patterns

SPFx project context:
- Build: Use 'npm run build' (works for both Heft and Gulp)
- Do not use 'npx tsc' - SPFx has its own TypeScript configuration
- Do not change Node.js versions

Common migration patterns to preserve:
- response.results - find the new location for results
- .data property - still need that nested data access
- PagedItemCollection - preserve state for pagination (hasNext/getNext)
- State assignments (this.someState = value) - always important

Runtime failures (code compiles but fails):
- .item property after .add() - use getById(newItem.ID) instead
  Wrong: newItem.item.select()
  Correct: list.items.getById(newItem.ID).select()

Graph API authentication:
- WebPartContext: GraphSPFx(props.context) or GraphSPFx(this.context)
- ServiceScope: Use AadTokenProviderFactory pattern
- getSP() must receive context parameter

TypeScript TS2318 errors ("Cannot find global type"):
- This is a tsconfig.json problem, not source files
- Fix tsconfig.json lib array: ["es5", "es2015.promise", "es2015.collection", "es2015.iterable", "dom", "scripthost"]

NPM dependency conflicts:
- Use "overrides" in package.json for specific package conflicts
- Do not create .npmrc with legacy-peer-deps=true
- Do not override ajv globally to v8.x (breaks source-map-loader)

## SCSS Module Resolution (SPFx 1.22+ Heft builds)
If you see "Module not found: Can't resolve '.module.scss'" in lib/:
1. Add "cssOutputFolders": ["lib"] to config/sass.json
2. Add NormalModuleReplacementPlugin in webpack patch to redirect .module.scss to .module.scss.css
Do NOT try: staticAssetsToCopy, webpack resolve aliases, custom resolver plugins

Bash usage:
- Allowed: npm install, npm run build, npm run clean
- Not allowed: nvm, n, fnm (no Node version changes)

{{#if hasTypeScriptWarnings}}Priority order:
1. Fix all TypeScript errors first (lines with "Error -")
2. Then fix all TypeScript warnings (lines with "Warning -")
3. The upgrade is only complete when both errors and warnings are gone

{{/if}}Fix the types/imports, not the business logic.
