# PANTOUM Upgrade Analyzer

Perform a defensive post-mortem analysis of PANTOUM upgrade results. This is the most important plugin command — it diagnoses what happened during an upgrade by reading the report files.

## Analysis Principles

1. **Be critical, not paranoid** — analyze with a critical eye, but be fair. PANTOUM has safeguards (verification builds, patch validation, AI retry loops). When those safeguards worked and the outcome is GREEN, report it with confidence. Reserve alarming language for actual problems.
2. **Never modify the solution** — this skill is read-only analysis. Do not attempt to fix, patch, edit, or update any files in the solution. Only read and report.
3. **Present evidence** — always cite specific files, error messages, and metrics. Don't speculate without data.
4. **Proportionate severity** — label severity based on what actually happened, not what could theoretically go wrong. A PnP migration that passed all verification checks is "info", not "high severity". A failed patch with no workaround is "critical".
5. **Include a testing reminder** — always recommend testing in SharePoint before deploying, but keep it brief and matter-of-fact for GREEN outcomes. Don't frame routine testing as a crisis.

## Output Formatting

- **Never expose internal phase numbers** in your output. Use descriptive headings like "Quick Health Summary", "Detailed Analysis", "Diagnosis", etc. — not "Phase 1", "Phase 3".
- **Interactive vs static mode** — when invoked from the webapp (indicated by a "non-interactive session" note in the context), end the report after the Recommendations section. Do not include follow-up menus or "What would you like to do next?" prompts. When invoked interactively in Claude Code, present the Phase 5 follow-up menu as normal.

## Phase 1: Locate

Ask the user for the solution path (or use the current directory).

Search for `pantoum_run_*` directories using Glob:
```
pantoum_run_*/pantoum_final-report_*.json
```

Handle these cases:
- **None found** — inform the user that no upgrade reports were found. Suggest running `/pantoum-upgrade` first.
- **Multiple found** — list all found directories with their timestamps and let the user select which to analyze.
- **Single found** — auto-proceed with that directory.

Also check for per-solution reports inside the solution directory itself.

## Phase 2: Quick Health

Read the following files from the selected run directory:

1. **`pantoum_final-report_*.json`** — the main JSON report with all metrics
2. **`Pantoum_Upgrade_Report_*.md`** — the human-readable summary
3. **`patch_status.json`** — if it exists, patch application status

Classify the overall upgrade health:
- **Green** — all patches applied, build succeeded, no errors remaining
- **Partial** — some patches applied but issues remain (build errors, warnings, failed patches)
- **Failed** — upgrade failed to complete or critical errors remain

Display a one-line health summary before proceeding to detailed analysis.

## Phase 3: Defensive Analysis

Analyze each area systematically. For each issue found, note the evidence and severity.

### M365 CLI Errors
- Were there any M365 CLI parsing errors?
- Were all recommended patches applied successfully?
- Were any patches skipped and why?

### Build Errors
- Did the solution build successfully after upgrade?
- What build errors occurred and were they resolved?
- Are there remaining TypeScript errors?
- Check for SCSS/CSS issues (common in SPFx 1.22+)

### Patch Failures
- List any patches that failed to apply
- Identify the reason (file not found, content mismatch, conflict)
- Assess impact of each failed patch

### AI Metrics
- How many AI iterations were used?
- What was the total token usage and cost?
- What tools did the AI use?
- Were retries exhausted without resolution?

### Third-Party Dependencies
- Were any third-party packages updated?
- Are there known breaking changes in updated packages?
- Were any packages left at incompatible versions?

## Phase 4: Diagnosis

Present a structured diagnosis report:

### Summary
- Overall health status (Green / Partial / Failed)
- Number of patches: applied, skipped, failed
- Build status: success / failure with error count

### Issues Found
For each issue:
- **What**: description of the issue
- **Evidence**: specific file, line, or error message
- **Severity**: critical / warning / info
- **Root Cause**: likely cause
- **Recommendation**: specific fix or next step

### AI Cost Summary
- Total tokens used (input + output)
- Total cost in USD
- Number of AI iterations
- Cache utilization percentage

### Recommendations
Ordered list of suggested next steps, from most to least important.

### Tone Calibration

Match report language to health status:
- **Green**: Confident, concise summary. Standard migration steps that succeeded (PnP upgrade, env injection, Heft migration) are "info" severity notes, not warnings. Keep recommendations short — the upgrade worked.
- **Partial**: Balanced — clearly flag unresolved items but acknowledge what did work. Don't catastrophize resolved issues.
- **Failed**: Direct and specific. State what's broken, cite evidence, suggest concrete next steps.

## Phase 5: Follow-up

Ask the user what they'd like to do next:

- **Fix remaining issues** — help resolve specific errors identified in the analysis
- **Re-run with adjusted settings** — suggest configuration changes and generate the CLI command
- **View in Studio** — open PANTOUM Studio in the browser to view reports visually. Run `node scripts/start-webapp.cjs` from the PANTOUM root to start the studio, then navigate to the Reports page.
- **Show logs** — display error logs or specific report sections in detail
- **Compare runs** — if multiple `pantoum_run_*` directories exist, compare two runs side by side
- **Done** — end the analysis (but remind them to run regression tests on the upgraded solution)

When the user selects "Done", close with a brief testing reminder proportionate to the outcome:
- **Green**: "As a next step, test the upgraded solution in SharePoint before deploying."
- **Partial/Failed**: "Unresolved issues remain — test thoroughly in SharePoint and address the items above before deploying."

## Important Notes

- Read files with the Read tool — never assume file contents
- Use Glob to find report files — paths contain timestamps and version numbers
- If a report file is very large, summarize the key sections rather than showing everything
- Cross-reference the JSON report with the Markdown report for completeness
- If you see evidence of template changes or SDK version changes between runs, flag this as a potential source of behavioral differences
