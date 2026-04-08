---
phase: 6
description: "Analyzes third-party breaking API changes and rewrites code for new APIs"
---

CONTEXT: SPFx solution dependency updates caused build errors.

UPDATED PACKAGES (only non-SPFx packages):
{{updatedPackagesList}}

BUILD ERRORS:
{{buildErrors}}

INSTRUCTIONS:
1. Analyze the build errors to identify which are caused by the package updates
2. Fix ONLY errors directly caused by the package updates above
3. Common breaking changes to look for:
   - Changed import paths (e.g., 'package/lib/x' → 'package/x')
   - Renamed methods, classes, or interfaces
   - Different initialization patterns or constructor signatures
   - Changed TypeScript types or interfaces
   - Removed deprecated features that were being used
   - API changes (different parameters, return types)
4. Do NOT fix unrelated issues or make improvements
5. Do NOT update any SPFx/Microsoft packages
6. Focus especially on the major updates: {{majorUpdatesList}}

For packages with major updates, common migration patterns:
- OpenAI SDK (v3→v4): Client initialization changed, streaming API changed
- Axios: Request/response interceptor APIs may have changed
- Lodash: Some utility functions were removed or renamed
- Date libraries: Format strings and parsing may have changed

Please analyze the errors and apply only the necessary fixes.
