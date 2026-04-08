# PANTOUM Doctor — Environment Health Check

Run the PANTOUM doctor script to check the user's environment for all prerequisites needed for SPFx upgrades.

## Instructions

1. Run the doctor script:
   ```
   node scripts/claude-doctor.cjs
   ```

2. Parse the JSON output. The script returns a JSON object with check categories: `system`, `dependencies`, `ai`, `pantoum`, and `webapp`. Each check has `name`, `status` (`ok`, `warn`, `error`), `value`, and optionally `required` and `message`.

3. Display the results as a formatted table grouped by category:
   - Use checkmarks for `ok`, warning signs for `warn`, and X marks for `error`
   - Show the check name, value, and any required version
   - Group under headers: **System**, **Dependencies**, **AI**, **PANTOUM**, **Studio**

4. After displaying results:
   - If all checks pass: confirm the environment is ready
   - If there are warnings: note them but confirm the environment is usable
   - If there are errors: list each error with its fix recommendation and offer to help resolve issues (e.g., suggest install commands, link to docs)

5. If the user wants help fixing an issue, provide specific guidance:
   - **Node.js**: suggest nvm or nodejs.org
   - **npm**: comes with Node.js
   - **M365 CLI**: `npm install -g @pnp/cli-microsoft365`
   - **Claude Code**: link to https://docs.anthropic.com/en/docs/claude-code
   - **Agent SDK**: `npm install` in the pantoum directory
   - **Auth**: explain both Claude Code subscription and ANTHROPIC_API_KEY options
   - **Studio**: `npm run webapp` from the pantoum root directory (auto-installs deps and starts server)
