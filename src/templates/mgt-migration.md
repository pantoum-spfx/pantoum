---
phase: 3
description: "Migrates Microsoft Graph Toolkit components"
linkedToAiContext: true
---

When this migration is triggered:

1. Apply the code patterns defined above:
   - Follow the codePatterns section for exact transformations
   - All necessary migration patterns are documented below

   Note: Do not use disambiguation.
   The Microsoft docs recommend customElementHelper.withDisambiguation(),
   but this causes components to fail registration with dynamic imports.
   Skip any code that includes withDisambiguation or customElementHelper.

2. Search for patterns:
   Execute these commands to find all patterns:
   - grep -r "@microsoft/mgt-react" src/ --include="*.tsx" --include="*.ts"
   - grep -r "Providers.globalProvider" src/ --include="*.ts"
   - grep -r "Person\|PeoplePicker" src/ --include="*.tsx"
   - find . -name "gulpfile.js"

3. Required transformations:

   a) Find the main SPFx component file:
      - Look for classes extending BaseClientSideWebPart, BaseApplicationCustomizer, or BaseAdaptiveCardExtension
      - Locate the onInit() method (or create if missing)

   b) Update onInit() method:
      - Add SharePointProvider setup if not present
      - Add dynamic import of @microsoft/mgt-components
      - Wrap any existing return statement with the import
      - Do not add customElementHelper.withDisambiguation() - it causes issues
      Example structure (adapt to existing code):
      ```typescript
      protected onInit(): Promise<void> {
        if (!Providers.globalProvider) {
          Providers.globalProvider = new SharePointProvider(this.context);
        }

        return import(/* webpackChunkName: 'mgt-components' */ '@microsoft/mgt-components').then(() => {
          // existing initialization code here
        });
      }
      ```

   c) Convert all MGT components:
      - Remove all imports from @microsoft/mgt-react
      - Use web components directly: <mgt-person>, <mgt-people-picker>, etc.
      - Add TypeScript declarations for the web components you use

   d) Update gulpfile.js with Babel configuration for Lit components

4. Verification checklist:
   [ ] Applied all code patterns from the codePatterns section above
   [ ] No @microsoft/mgt-react imports remain
   [ ] Dynamic import added in onInit() method
   [ ] gulpfile.js has webpack config
   [ ] Babel dependencies installed
   [ ] Web components used with proper TypeScript declarations

These changes prevent runtime failures:
- 3MB+ bundle bloat without proper imports
- Components not registering without dynamic import
- Production failures without webpack config

This migration is similar to the PnP JS v4 migration:
- Code will fail at runtime without these changes
- These are breaking changes, not optimizations

Package requirements:
- Add: @microsoft/mgt-element, @microsoft/mgt-sharepoint-provider, @microsoft/mgt-components
- Add: @microsoft/mgt-spfx-utils (for utilities if needed)
- For React: add @microsoft/mgt-react
- Dev dependencies: babel-loader and plugins

Runtime failures without migration:
1. Large bundle size causing SharePoint throttling
2. Components not loading without dynamic import in onInit()
3. Lit components failing in IE11 and older Edge
4. Memory leaks from improper component registration
5. Authentication context failures

Known limitations after migration:
1. Person-card hover/click functionality may not work (flyout.open error in MGT v3)
2. Styling differences - web components do not inherit parent styles
3. Some React component features lost when converting to web components
