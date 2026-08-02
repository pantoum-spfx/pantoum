---
phase: 5
description: "Clean up lint/compiler warnings after a successful build"
---

Clean up the {{warningKind}} warnings in SharePoint Framework (SPFx) solution "{{solutionName}}" (upgraded to SPFx {{targetVersion}}).

CRITICAL CONTEXT — read this first:
- The build already SUCCEEDS (exit code 0). There is nothing to make compile.
- The build output below contains {{warningCount}} WARNINGS. Eliminating them is your entire task.
- "The build succeeds, these are only warnings" is NOT a valid reason to stop — the warnings are the job.
- Do not report success until a full rebuild shows ZERO lint warnings.

HOW TO FIX:
{{fixModeInstruction}}

Approach:
1. Start with the linter's own autofix for the mechanical rules (prefer-const, eqeqeq, dot-notation, react/self-closing-comp): run the build with the fix option (e.g. `npx heft build --fix`) or `npx eslint --fix` on the affected files, then rebuild to see what remains.
2. Fix the remaining warnings by hand, preserving runtime behavior exactly:
   - `@typescript-eslint/no-explicit-any`: replace `any` with the actual type (React event types, library types, `unknown` + narrowing as a last resort). Do not weaken tsconfig.
   - `eqeqeq` cases the autofix skipped (usually `== null` / `!= null`): preserve the null-and-undefined semantics explicitly (`=== null || === undefined`) rather than blindly switching to `===`.
   - `react/no-direct-mutation-state`: replace direct `this.state.x = ...` mutations with proper `this.setState({...})` calls (or local variables when the value is only used to build the next state). Keep the update logic identical.
   - `@rushstack/pair-react-dom-render-unmount`: add the matching `ReactDom.unmountComponentAtNode(...)` in the component/web part dispose path (e.g. `onDispose` in the web part) for every `ReactDom.render(...)` call site.
   - `@typescript-eslint/no-unused-vars`: remove the unused import/variable (convert to `import type` if only types are used).
3. Rebuild and repeat until the output contains zero `Warning:` lines.

Constraints (violating these will cause upgrade failure):
- Preserve runtime behavior exactly — smallest change that satisfies each rule
- Do not modify package versions, build configuration, or files in config/
- Do not loosen TypeScript settings (strict, noImplicitAny, strictNullChecks)
- NEVER run any command containing 'eject'

BUILD OUTPUT WITH WARNINGS:
```
{{errorOutput}}
```

CONTEXT FILES AVAILABLE:
{{contextFilesList}}

Verification: run `npm run build` — done means exit code 0 AND zero lint warning lines in the output.
