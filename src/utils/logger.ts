// src/logger.ts
import * as util from 'util';

/** Our supported levels, in increasing verbosity. */
export enum Level {
  Error = 0,
  Warn  = 1,
  Info  = 2,
}

/** A single, process-wide Logger instance you can `import { logger } from './logger'` anywhere. */
class Logger {
  private static _instance: Logger;
  private level: Level = Level.Info;
  private _onLog: ((level: string, message: string) => void) | null = null;

  private constructor() {}

  /** Set a callback that fires on every log write (used by webapp to intercept output) */
  public set onLog(callback: ((level: string, message: string) => void) | null) {
    this._onLog = callback;
  }

  public static get instance(): Logger {
    if (!this._instance) {
      this._instance = new Logger();
    }
    return this._instance;
  }

  /** Set the minimum level to actually print. */
  public setLevel(l: Level) {
    this.level = l;
  }

  public error(message: string, ...args: any[]) {
    if (this.level >= Level.Error) {
      this._write('ERROR', message, args, '\x1b[31m'); // red
    }
  }

  public warn(message: string, ...args: any[]) {
    if (this.level >= Level.Warn) {
      this._write('WARN ', message, args, '\x1b[33m'); // yellow
    }
  }

  public info(message: string, ...args: any[]) {
    if (this.level >= Level.Info) {
      this._write('INFO ', message, args, '\x1b[36m'); // cyan
    }
  }

  private _write(prefix: string, message: string, args: any[], color: string) {
    const msg = util.format(message, ...args);

    // Fire the onLog callback (used by webapp's UpgradeOrchestrator)
    if (this._onLog) {
      this._onLog(prefix.trim().toLowerCase(), msg);
    }

    const reset = '\x1b[0m';
    // Use local time instead of UTC
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    console.log(`${color}[${time}] [${prefix}]${reset} ${msg}`);
  }
}

/** A convenient singleton export */
export const logger = Logger.instance;
