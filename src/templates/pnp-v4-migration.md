---
phase: 3
description: "Migrates PnP JS v1/v2/v3 to v4"
linkedToAiContext: true
---

## Reference Documentation
- v3 to v4 migration guide: https://pnp.github.io/pnpjs/transition-guide/

## Known Breaking Changes
- sp → spfi, graph → graphfi import changes
- Data property removed from all responses
- Termstore functionality moved to @pnp/graph
- items.get() → items() for collections
- New initialization pattern with factory functions
- CRITICAL: .add() response no longer has .item property - use getById(newItem.ID) instead
- Pattern change: newItem.item.select() → getById(newItem.ID).select()
- Pattern change: newItem.data → newItem (data wrapper removed)
- PagedItemCollection replaced with AsyncIterator pattern for pagination
- Response structure: items.add() returns {ID, data} not {item, data}
- Method chaining after .add() operations requires explicit getById() call
- All .add() operations (items, fields, lists) affected by .item removal
- CRITICAL: Graph API requires proper authentication context
- GraphSPFx() MUST receive context parameter - empty object causes 403
- getSP() calls MUST pass context parameter
- Graph permissions required in package-solution.json for termStore access
- Admin approval needed in SharePoint Admin Center for Graph permissions

Key migration patterns for PnP JS v{{fromMajor}} to v4:

## Import Changes
- "@pnp/common" → "@pnp/core"
- "@pnp/odata" → "@pnp/queryable"
- "@pnp/sp/taxonomy" → "@pnp/graph/taxonomy" (requires @pnp/graph dependency)
- "import { sp }" → "import { spfi, SPFx }"
- "import { graph }" → "import { graphfi }"

## Selective Imports (Required)
Replace presets/all with selective imports to optimize bundle size:
```typescript
// Remove: import { Web } from "@pnp/sp/presets/all"
// Replace with:
import { Web } from "@pnp/sp/webs";
import "@pnp/sp/lists";   // Required: Include module imports to avoid runtime errors
import "@pnp/sp/items";
import "@pnp/sp/site-users/web";  // For user operations
```
Each feature used (lists, items, users, fields) needs its corresponding import.

## List Access Patterns
Preserve existing patterns:
- If using .getList(url) → keep using .getList(url) in v4
- Don't change to .lists.getByTitle() unless explicitly needed
- Variables ending in 'Url' or 'ListUrl' contain URLs, not titles

## API Changes
- Remove .get() from collections: items.get() → items()
- Remove .data property from all responses
- sp.termStore → graph.termStore (requires @pnp/graph)

## .add() Response Structure (Breaking Change)

**Key Change:** PnP v4 returns the item **directly** - no wrapper types.

```typescript
// v3: { data: { ID: number }, item: IItem }  ← wrapper object
// v4: { Id: number, Title: string, ... }     ← raw REST payload
```

**DO NOT recreate removed interfaces.** IItemAddResult, IItemUpdateResult etc. were intentionally removed in v4 for flexibility. Don't recreate them.

**Pattern 1 - Extend your domain interface (RECOMMENDED):**
```typescript
// Add ID to YOUR existing interface (e.g., in IMyListItem.ts):
interface IMyListItem {
    ID?: number;        // Add this for created items
    Title: string;
    // ...your existing fields
}

// Use directly - v4 returns the item payload:
const item: IMyListItem = await list.items.add({ Title: "X" });
console.log(item.ID);
```

**Pattern 2 - Dynamic typing (simple cases):**
```typescript
const result = await list.items.add({ Title: "X" });
console.log(result.Id);  // Access raw REST response
```

**WRONG - Don't recreate removed interfaces:**
```typescript
// DON'T DO THIS - IItemAddResult was removed on purpose!
interface IItemAddResult { Id: number; [key: string]: any; }
```

**Fix .data wrapper removal:**
- `result.data.ID` → `result.ID`
- `result.data.Id` → `result.Id`

**Fix .item chaining with getById() pattern:**
```typescript
// PnP v3 (breaks at runtime in v4):
const result = await list.items.add(item);
await result.item.breakRoleInheritance(true, false);  // .item is undefined!

// PnP v4 (correct):
const result = await list.items.add(item);
const createdItem = list.items.getById(result.Id);
await createdItem.breakRoleInheritance(true, false);
```
Search for ".item." after any .add() call and replace with getById() pattern.

## Graph API Authentication
termStore moved from @pnp/sp to @pnp/graph - requires proper Graph initialization:

**Pattern 1 - Direct WebPartContext (for web parts/components):**
```typescript
// Correct:
graphfi().using(GraphSPFx(props.context))
graphfi().using(GraphSPFx(this.context))
// Wrong (causes 403):
graphfi().using(GraphSPFx({}))
```

**Pattern 2 - ServiceScope with AadTokenProviderFactory (for service classes):**
```typescript
import { AadTokenProviderFactory } from "@microsoft/sp-http";

constructor(serviceScope: ServiceScope) {
  serviceScope.whenFinished(() => {
    const aadTokenProviderFactory = serviceScope.consume(AadTokenProviderFactory.serviceKey);
    this.graph = graphfi().using(GraphSPFx({aadTokenProviderFactory}));
  });
}
```

Choose pattern based on where Graph is initialized:
- Web part/component with context prop → Pattern 1
- Service class with ServiceScope → Pattern 2

## External API Types (Graph, etc.)

For external APIs like Microsoft Graph, use **official type packages** instead of creating local interfaces.

**CORRECT - Use @microsoft/microsoft-graph-types:**
```typescript
import { TermStore } from "@microsoft/microsoft-graph-types";

const terms: TermStore.Term[] = await graph.termStore.sets.getById(id).children();
// TermStore.Term has .id, .labels[], etc. - no local interfaces needed
```

**WRONG - Don't create "fake" interfaces:**
```typescript
// DON'T DO THIS:
interface ITerm { id?: string; labels?: ITermLabel[]; }
interface ITermLabel { languageTag?: string; name?: string; }
```

Install if needed: `npm install --save-dev @microsoft/microsoft-graph-types`

## Initialization Patterns
- SharePoint: const sp = spfi().using(SPFx(context))
- Graph: const graph = graphfi().using(GraphSPFx(context))
- Utility functions: getSP(context) - pass context parameter
- React components: Initialize before first use
- Class services: Initialize in constructor/onInit with this.context

## WebPartContext vs PageContext
PnP v4 requires full WebPartContext (not just PageContext):
- PageContext: page metadata (site URL, user info)
- WebPartContext: includes HttpClient, AadTokenProviderFactory, auth tokens

```typescript
// Incorrect (PageContext only - fails silently):
this.sp = spfi().using(SPFx(this.pageContext as any));

// Correct (use setContext with full WebPartContext):
public setContext(context: any): void {
  this.sp = spfi().using(SPFx(context));
}
// Call from WebPart.onInit():
spo.setContext(this.context);
```

---

## Migration Steps

1. Scan all TypeScript files for {{packageName}} usage

2. Search for ".data.ID" and ".data.Id" patterns and fix all occurrences:
   ```bash
   grep -r "\.data\.ID\|\.data\.Id" src/ --include="*.ts" --include="*.tsx"
   ```
   Replace every ".data.ID" and ".data.Id" with ".Id"

3. Search for patterns that compile but fail at runtime:
   - ".item.select", ".item.expand", ".item.update" after .add() calls
   - GraphSPFx({}) or GraphSPFx without context
   - getSP() calls without context parameter
   - Service classes with ServiceScope (need AadTokenProviderFactory pattern)
   - Look for ServiceKey.create/ServiceScope → likely needs Pattern 2
   - WebPartContext in props/interface → needs Pattern 1

4. Apply all necessary changes directly to the files

5. If taxonomy/termStore is used:
   - Add @pnp/graph dependency to package.json
   - Add Graph permissions to config/package-solution.json:
     ```json
     "webApiPermissionRequests": [
       { "resource": "Microsoft Graph", "scope": "TermStore.Read.All" }
     ]
     ```

6. Run 'npm run build' to verify (not 'npx tsc' - it won't work correctly in SPFx)

7. Fix any build errors reported

## Node Version Restrictions
- Do not change Node.js versions (no 'nvm use', 'n use', 'fnm use')
- The project is configured with the correct Node version
- If you see Node version errors, fix the code to be compatible
- Allowed: npm install, npm run build, npm test
- Not allowed: nvm use, n use, or any Node version switching

Make the changes directly to the files. Fix all occurrences across the entire project.
Use 'npm run build' for compilation, not 'npx tsc'.
