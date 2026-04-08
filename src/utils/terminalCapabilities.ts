/**
 * Centralized terminal capability detection
 * Single source of truth for terminal information across the application
 */

export interface TerminalCapabilities {
  /** Terminal supports basic colors */
  hasColor: boolean;
  /** Terminal supports 256 colors */
  has256: boolean;
  /** Terminal supports true color (16 million colors) */
  hasTrueColor: boolean;
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
  /** Terminal is considered small (< 80x24) */
  isSmall: boolean;
  /** Terminal supports inline images (iTerm2, WezTerm, VS Code, Windows Terminal) */
  supportsImages: boolean;
  /** Terminal program name */
  termProgram: string;
  /** Is running in a TTY */
  isTTY: boolean;
  /** Is running in Windows Terminal */
  isWindowsTerminal: boolean;
  /** Is running on Windows */
  isWindows: boolean;
}

/**
 * Detect terminal capabilities once and cache the result
 */
function detectCapabilities(): TerminalCapabilities {
  const term = process.env.TERM || '';
  const termProgram = process.env.TERM_PROGRAM || '';
  const isTTY = process.stdout.isTTY ?? false;
  const isWindows = process.platform === 'win32';
  const isWindowsTerminal = process.env.WT_SESSION !== undefined;

  const hasColor = isTTY && term !== 'dumb';
  const has256 = term.includes('256color') || isWindowsTerminal;
  const hasTrueColor = process.env.COLORTERM === 'truecolor' || isWindowsTerminal;

  const width = process.stdout.columns || 80;
  const height = process.stdout.rows || 24;

  // iTerm2 and WezTerm have reliable inline image support
  // VS Code terminal claims support but often fails with protocol errors
  // Windows Terminal support is experimental
  const supportsImages = termProgram === 'iTerm.app' ||
                         termProgram === 'WezTerm';

  return {
    hasColor,
    has256,
    hasTrueColor,
    width,
    height,
    isSmall: width < 80 || height < 24,
    supportsImages,
    termProgram,
    isTTY,
    isWindowsTerminal,
    isWindows
  };
}

// Cached capabilities - detected once at module load
let cachedCapabilities: TerminalCapabilities | null = null;

/**
 * Get terminal capabilities (cached)
 */
export function getTerminalCapabilities(): TerminalCapabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = detectCapabilities();
  }
  return cachedCapabilities;
}
