import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import { FILE_PATTERNS } from './constants.js';

interface M365Result {
  success: boolean;
  reportJson?: string;
  error?: string;
}

export async function runSpfxUpgrade(
  solutionPath: string,
  toVersion: string
): Promise<M365Result> {
  try {
    // Delete any existing UPGRADE_REPORT.md created by previous M365 CLI runs
    const reportPath = path.join(solutionPath, FILE_PATTERNS.UPGRADE_REPORT_MD);
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }

    const { stdout } = await execa(
      'm365',
      ['spfx', 'project', 'upgrade', '--toVersion', toVersion, '--output', 'json'],
      { cwd: solutionPath, all: true }
    );

    // M365 CLI creates UPGRADE_REPORT.md by default even with --output json
    // Remove it to avoid confusion with our comprehensive report in pantoum_run folder
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }

    return { success: true, reportJson: stdout };
  } catch (err: any) {
    // Extract the actual error message from stderr if available
    let errorMessage = err.message || String(err);

    // If it's an execa error, try to get more details
    if (err.stderr) {
      errorMessage = err.stderr;
    } else if (err.stdout && err.stdout.includes('Error:')) {
      // Sometimes m365 outputs errors to stdout
      errorMessage = err.stdout;
    }

    return { success: false, error: errorMessage };
  }
}
