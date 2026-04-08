import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';
import type { PatchObject } from '../schema/patchSchema.js';
import { fancyNameGenerator } from '../utils/fancyNameGenerator.js';
import { FILE_PATTERNS } from '../constants.js';

interface PatchStatus {
  applied: string[];  // Patch IDs that were successfully applied
  failed: string[];   // Patch IDs that failed
}

export class PatchRepository {
  private basePath: string;
  private runId: string;
  private fancyNamePromise: Promise<void> | null = null;
  private currentSolutionPath?: string;
  private registeredFiles: Set<string>;

  constructor(basePath: string = process.cwd(), _perSolutionReports: boolean = false) {
    this.basePath = basePath;
    this.registeredFiles = new Set<string>();
    // Generate initial ID with placeholder
    this.runId = this.generateBaseRunId() + '_temp';
    // Start async fancy name generation
    this.initializeFancyName();
  }

  /**
   * Initialize fancy name asynchronously
   */
  private initializeFancyName(): void {
    this.fancyNamePromise = (async () => {
      try {
        const fancyName = await fancyNameGenerator.generateFancyName();
        // Replace temp suffix with fancy name
        const baseId = this.runId.replace('_temp', '');
        this.runId = `${baseId}_${fancyName}`;
        logger.info(`Generated fancy run ID: ${this.runId}`);
      } catch (error) {
        // If fancy name fails, replace temp with random fallback
        const fallback = Math.random().toString(36).slice(-4);
        const baseId = this.runId.replace('_temp', '');
        this.runId = `${baseId}_${fallback}`;
        logger.info(`Using fallback run ID: ${this.runId}`);
      }
    })();
  }

  /**
   * Generate base run ID: YYYYMMDD_HHMMSS
   */
  private generateBaseRunId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `${date}_${time}`;
  }

  /**
   * Ensure fancy name is ready before using runId
   */
  private async ensureFancyName(): Promise<void> {
    if (this.fancyNamePromise) {
      await this.fancyNamePromise;
      this.fancyNamePromise = null;
    }
  }

  /**
   * Get the current run ID
   */
  getRunId(): string {
    return this.runId;
  }

  /**
   * Get the base run directory path (internal helper)
   */
  private getRunRoot(): string {
    if (this.currentSolutionPath) {
      return path.join(this.currentSolutionPath, `pantoum_run_${this.runId}`);
    }
    return path.join(this.basePath, `pantoum_run_${this.runId}`);
  }

  /**
   * Get the run directory path
   */
  getRunDirectory(): string {
    return this.getRunRoot();
  }

  /**
   * Get the run directory path (async - ensures fancy name is ready)
   */
  async getRunDirectoryAsync(): Promise<string> {
    await this.ensureFancyName();
    return this.getRunRoot();
  }

  /**
   * Get the solution directory path within the run
   */
  getSolutionRunDirectory(solutionName: string): string {
    const runRoot = this.getRunDirectory();
    // If currentSolutionPath is set, use run dir directly (no subdirectory for solution name)
    if (this.currentSolutionPath) {
      return runRoot;
    }
    // For global runs, create subdirectory per solution
    const sanitizedSolutionName = this.sanitizeName(solutionName);
    return path.join(runRoot, sanitizedSolutionName);
  }

  /**
   * Initialize patch repository for a solution
   */
  async initializePatchRepository(
    solutionName: string,
    _targetVersion: string,
    solutionPath?: string
  ): Promise<string> {
    // Ensure fancy name is ready before creating directories
    await this.ensureFancyName();

    // Store the solution path for later use
    if (solutionPath) {
      this.currentSolutionPath = solutionPath;
    }

    const runDir = this.getRunRoot();
    const solutionDir = this.currentSolutionPath
      ? runDir
      : path.join(runDir, this.sanitizeName(solutionName));

    // Ensure directory exists
    if (!fs.existsSync(solutionDir)) {
      fs.mkdirSync(solutionDir, { recursive: true });
    }

    // Initialize empty patches file if it doesn't exist
    const patchesPath = path.join(solutionDir, FILE_PATTERNS.PATCHES_JSON);
    if (!fs.existsSync(patchesPath)) {
      fs.writeFileSync(patchesPath, JSON.stringify([], null, 2), 'utf8');
    }
    
    // Initialize patch status if it doesn't exist
    const statusPath = path.join(solutionDir, FILE_PATTERNS.PATCH_STATUS_JSON);
    if (!fs.existsSync(statusPath)) {
      const status: PatchStatus = { applied: [], failed: [] };
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
    }
    
    logger.info(`→ Initialized patch repository for ${solutionName} (run: ${this.runId})`);
    return solutionDir;
  }

  /**
   * Save all patches for a solution in a single file
   */
  async savePatchesBySolution(
    solutionName: string,
    _targetVersion: string,
    patches: PatchObject[]
  ): Promise<string> {
    const runDir = this.getRunDirectory();
    const solutionDir = this.currentSolutionPath
      ? runDir
      : path.join(runDir, this.sanitizeName(solutionName));

    // Ensure directory exists
    if (!fs.existsSync(solutionDir)) {
      fs.mkdirSync(solutionDir, { recursive: true });
    }

    // Save all patches in order to a single file
    const patchesPath = path.join(solutionDir, FILE_PATTERNS.PATCHES_JSON);
    fs.writeFileSync(patchesPath, JSON.stringify(patches, null, 2), 'utf8');
    
    // Initialize patch status
    const statusPath = path.join(solutionDir, FILE_PATTERNS.PATCH_STATUS_JSON);
    const status: PatchStatus = { applied: [], failed: [] };
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
    
    logger.info(`→ Saved ${patches.length} patches for ${solutionName} (run: ${this.runId})`);
    return solutionDir;
  }

  /**
   * Load all patches for a solution
   */
  async loadPatchesBySolution(
    solutionName: string,
    _targetVersion: string
  ): Promise<PatchObject[]> {
    const runDir = this.getRunDirectory();
    const solutionDir = this.currentSolutionPath
      ? runDir
      : path.join(runDir, this.sanitizeName(solutionName));

    const patchesPath = path.join(solutionDir, FILE_PATTERNS.PATCHES_JSON);
    if (!fs.existsSync(patchesPath)) {
      return [];
    }

    const fileContent = fs.readFileSync(patchesPath, 'utf8');
    return JSON.parse(fileContent);
  }

  /**
   * Update patch status (applied/failed)
   */
  async updatePatchStatus(
    solutionName: string,
    _targetVersion: string,
    patchId: string,
    success: boolean
  ): Promise<void> {
    const runDir = this.getRunDirectory();
    const solutionDir = this.currentSolutionPath
      ? runDir
      : path.join(runDir, this.sanitizeName(solutionName));
    
    const statusPath = path.join(solutionDir, FILE_PATTERNS.PATCH_STATUS_JSON);
    if (!fs.existsSync(statusPath)) {
      return;
    }
    
    const status: PatchStatus = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    
    // Remove from both arrays first
    status.applied = status.applied.filter(id => id !== patchId);
    status.failed = status.failed.filter(id => id !== patchId);
    
    // Add to appropriate array
    if (success) {
      status.applied.push(patchId);
    } else {
      status.failed.push(patchId);
    }
    
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  }

  /**
   * Add new patches to existing repository (e.g., build-fix or self patches)
   */
  async addPatches(
    solutionName: string,
    targetVersion: string,
    newPatches: PatchObject[]
  ): Promise<void> {
    const existingPatches = await this.loadPatchesBySolution(solutionName, targetVersion);
    
    // Remove any existing patches with same IDs as new patches (global deduplication)
    const filteredExisting = existingPatches.filter(existing => 
      !newPatches.some(newPatch => newPatch.id === existing.id)
    );
    
    const allPatches = [...filteredExisting, ...newPatches];

    // Save patches without re-initializing the status file
    const runDir = this.getRunDirectory();
    const solutionDir = this.currentSolutionPath
      ? runDir
      : path.join(runDir, this.sanitizeName(solutionName));
    
    const patchesPath = path.join(solutionDir, FILE_PATTERNS.PATCHES_JSON);
    fs.writeFileSync(patchesPath, JSON.stringify(allPatches, null, 2), 'utf8');
    
    const removedCount = existingPatches.length - filteredExisting.length;
    if (removedCount > 0) {
      logger.info(`→ Replaced ${removedCount} existing patches with same IDs`);
    }
    logger.info(`→ Added ${newPatches.length} patches for ${solutionName} (total: ${allPatches.length})`);
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Register a file that was created
   */
  registerFile(filePath: string): void {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    this.registeredFiles.add(absolutePath);
    // logger.info('Registered file: %s', absolutePath); // Too verbose, commented out
  }

  /**
   * Get all registered files
   */
  getAllRegisteredFiles(): string[] {
    return Array.from(this.registeredFiles);
  }
}