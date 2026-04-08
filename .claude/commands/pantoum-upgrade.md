# PANTOUM Upgrade Wizard

Guide the user through an interactive SPFx upgrade using PANTOUM. Ask questions step by step using `AskUserQuestion` — do not rush through all questions at once.

## Step 1: Solution Path

Ask the user where their SPFx solution is located:

- **Current directory** — use the current working directory
- **Enter a path** — let the user type or paste a path
- **Clone from git URL** — clone a repository first

If they choose a path or git URL, verify it exists and contains an SPFx project (look for `.yo-rc.json` or `config/package-solution.json`).

## Step 2: Detect Current Version

Read the solution's `.yo-rc.json` to find the current SPFx version (`@microsoft/generator-sharepoint` → `version` field). Display it to the user.

If `.yo-rc.json` is not found, check `package.json` for `@microsoft/sp-core-library` version as a fallback.

## Step 3: Target Version

Check available SPFx versions that M365 CLI supports. **Important:** M365 CLI may not support the very latest npm versions yet. To get the correct list, run:
```
m365 spfx project upgrade --toVersion 99.0.0 2>&1
```
This returns an error listing all supported versions. Parse the version list from the output.

Show available target versions that are HIGHER than the current version (downgrades are not supported). Let the user pick from available options, defaulting to the latest supported version.

## Step 4: AI Configuration

Ask the user which AI configuration preset to use:

- **Default** — AI fixes for M365 CLI errors and build errors enabled, Sonnet model, 3 retries
- **Conservative** — AI fixes for M365 CLI errors only, Sonnet model, 2 retries
- **Full Power** — All AI fixes enabled (M365, build, ESLint, TypeScript warnings), Opus model, 5 retries
- **Custom** — let the user configure each setting individually

If Custom, ask about each setting:
- AI model (Sonnet 4.5 vs Opus 4.6)
- Fix M365 CLI errors (true/false)
- Fix build errors (true/false)
- Fix ESLint properly (true/false)
- Fix TypeScript warnings (true/false)
- Max retries (1-10)

## Step 5: Confirm and Execute

Show a summary of all selected options. Ask the user:

- **Launch PANTOUM Studio (Recommended)** — Start the PANTOUM Studio webapp for visual configuration and monitoring. Run `node scripts/start-webapp.cjs` from the PANTOUM root directory, then tell the user to open http://localhost:5201 in their browser. The studio lets them fine-tune settings, scan solutions, and (when Phase 3 is complete) run upgrades with real-time streaming.
- **Generate CLI command** — Show the full `node dist/cli.js ...` command for the user to run in a separate terminal. This gives full real-time streaming output so they can follow exactly what PANTOUM is doing. After it finishes, suggest coming back and using `/pantoum-analyze` to review results.
- **Start upgrade** — Claude Code runs the upgrade directly. Note: output is captured and shown after completion (no real-time streaming). Before running, check if `dist/cli.js` exists — if not, run `npm run build` first.
- **Cancel** — abort

When constructing the command, always use `node dist/cli.js` (never `npx ts-node`, `pantoum`, or `npx pantoum` — the project is ESM and those approaches fail):
```
node dist/cli.js --localPath <path> --toVersion <version> --aiFixM365Errors <bool> --aiFixBuildErrors <bool> [other flags]
```

**Important:** The `node dist/cli.js` command must be run from the PANTOUM project root directory (where `package.json` lives).

## Step 6: Post-Upgrade

After the upgrade completes, ask:

- **View report** — read and summarize the Markdown report from the `pantoum_run_*` directory
- **Run analyzer** — suggest using `/pantoum-analyze` for deeper analysis
- **Done** — end the wizard

## Important Notes

- Always validate paths exist before proceeding
- Never suggest downgrading (target must be > current)
- Show the detected current version before asking for target
- If the user has a `pantoum.patches.yml`, mention that settings from it will be used as defaults
