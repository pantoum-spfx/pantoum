import { runAllChecks, type CheckResult } from './doctor/checks.js';

interface DoctorOptions {
  json?: boolean;
  verbose?: boolean;
}

/**
 * Format a check result for display
 */
function formatCheck(check: CheckResult, verbose: boolean): string {
  const icon =
    check.status === 'ok' ? '\x1b[32m✓\x1b[0m' : // Green checkmark
    check.status === 'warn' ? '\x1b[33m!\x1b[0m' : // Yellow warning
    '\x1b[31m✗\x1b[0m'; // Red X

  const name = check.name.padEnd(14);
  const value = check.value;
  const required = check.required ? ` (required: ${check.required})` : '';

  let line = `  ${icon} ${name}${value}${required}`;

  if (verbose && check.message) {
    line += `\n      → ${check.message}`;
  }

  return line;
}

/**
 * Format a section header
 */
function formatSection(title: string): string {
  return `\n${title}:`;
}

/**
 * Get overall status from all checks
 */
function getOverallStatus(checks: {
  system: CheckResult[];
  dependencies: CheckResult[];
  ai: CheckResult[];
  pantoum: CheckResult[];
}): 'ok' | 'warn' | 'error' {
  const allChecks = [
    ...checks.system,
    ...checks.dependencies,
    ...checks.ai,
    ...checks.pantoum,
  ];

  if (allChecks.some((c) => c.status === 'error')) {
    return 'error';
  }
  if (allChecks.some((c) => c.status === 'warn')) {
    return 'warn';
  }
  return 'ok';
}

/**
 * Run the doctor command
 */
export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const { json = false, verbose = false } = options;

  const checks = runAllChecks();
  const status = getOverallStatus(checks);

  if (json) {
    // Output JSON format
    console.log(
      JSON.stringify(
        {
          status,
          checks,
        },
        null,
        2
      )
    );
    return;
  }

  // Output formatted text
  const pantoumVersion = checks.pantoum[0]?.value || 'unknown';
  console.log(`\n\x1b[1mPANTOUM Doctor ${pantoumVersion}\x1b[0m`);

  // System section
  console.log(formatSection('System'));
  for (const check of checks.system) {
    console.log(formatCheck(check, verbose));
  }

  // Dependencies section
  console.log(formatSection('Dependencies'));
  for (const check of checks.dependencies) {
    console.log(formatCheck(check, verbose));
  }

  // AI section
  console.log(formatSection('AI'));
  for (const check of checks.ai) {
    console.log(formatCheck(check, verbose));
  }

  // Summary
  console.log('');
  if (status === 'ok') {
    console.log('\x1b[32m✓ Ready to upgrade!\x1b[0m');
  } else if (status === 'warn') {
    console.log('\x1b[33m! Some warnings detected (see above)\x1b[0m');
  } else {
    console.log('\x1b[31m✗ Issues found (see above)\x1b[0m');

    // Show detailed messages for errors if not verbose
    if (!verbose) {
      console.log('\nRun with --verbose for more details.');
    }
  }
  console.log('');
}
