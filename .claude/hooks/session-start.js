#!/usr/bin/env node

/**
 * PANTOUM Claude Code Plugin — Session Start Hook
 *
 * Displays a welcome message with ASCII squirrel art and available commands.
 * Cross-platform: works on Windows, macOS, and Linux.
 */

const art = `
   .  .
  (\\_/)
 >(o.o)<      ╔═══════════════════════════════════╗
  (> <)       ║  P A N T O U M                    ║
  /|  |\\      ║  SPFx Upgrade Automation Tool      ║
 (_|  |_)     ╚═══════════════════════════════════╝

  Commands:
    /pantoum             Welcome screen & overview
    /pantoum-studio      Launch PANTOUM Studio
    /pantoum-upgrade     Guided upgrade wizard
    /pantoum-doctor      Environment health check
    /pantoum-analyze     Analyze upgrade results
`;

console.log(art);
