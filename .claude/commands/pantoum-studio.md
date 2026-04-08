# PANTOUM Studio — Launch PANTOUM Studio

Launch the PANTOUM Studio webapp for visual configuration and upgrade monitoring.

## Instructions

1. **Start the studio** by running the launcher script from the PANTOUM project root:
   ```
   node scripts/start-webapp.cjs
   ```

   The launcher script will:
   - Check if the studio is already running on ports 5200/5201
   - Auto-install npm dependencies if needed
   - Start the Express API server (port 5200) and Vite dev server (port 5201)
   - Wait until both services are healthy

2. **Tell the user** to open their browser at: **http://localhost:5201**

3. **Describe what's available** in the studio:
   - **Settings** — Configure all 28+ upgrade settings visually (target version, AI behaviour, PnP, advanced options)
   - **Solutions** — Scan local directories to discover SPFx solutions, view version and complexity info
   - **Upgrade** — Run upgrades with real-time progress monitoring (coming soon)
   - **Reports** — Browse past upgrade reports with summaries, patch details, and AI metrics

4. **If the launcher fails**, check:
   - Node.js 22+ is installed
   - The `pantoum-webapp/` directory exists in the PANTOUM project root
   - No other process is using ports 5200 or 5201
   - Run `/pantoum-doctor` to diagnose environment issues

## Notes

- The studio runs locally — no data leaves the machine
- Settings are saved to `pantoum.settings.yml`
- The studio can be used alongside CLI and Claude Code plugin commands
- Stop the studio by pressing Ctrl+C in its terminal or closing the terminal window
