// M365 CLI upgrade report types

export interface M365UpgradeReportItem {
  /** Unique identifier like "FN001001" */
  id: string;
  /** Human readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** File that needs to be modified */
  file?: string;
  /** Package name for dependency updates */
  packageName?: string;
  /** New version for dependency updates */
  newVersion?: string;
  /** Resolution text */
  resolution?: string;
  /** Severity level */
  severity?: 'Required' | 'Optional' | 'Warning';
  /** Additional metadata */
  [key: string]: any;
}

export type M365UpgradeReport = M365UpgradeReportItem[];

// ManualStep is now imported from manualConfig.ts to avoid duplication