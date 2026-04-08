import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { logger } from '../utils/logger.js';
import type { PatchObject } from '../schema/patchSchema.js';
import { DEFAULTS } from '../constants.js';

export interface VersionUpdateOptions {
  enabled?: boolean;
  updatePackageJson?: boolean;
  updateReadme?: boolean;
  updateBadges?: boolean;
  updateVersionHistory?: boolean;
  versionComment?: string;
  PnPnvmrc?: boolean;
  PnPdevcontainer?: boolean;
}

export class VersionUpdateService {
  private defaultOptions: Required<VersionUpdateOptions> = {
    enabled: true,
    updatePackageJson: true,
    updateReadme: true,
    updateBadges: true,
    updateVersionHistory: true,
    versionComment: 'Upgraded with Pantoum SPFx AI Upgrader',
    PnPnvmrc: false,
    PnPdevcontainer: false
  };

  /**
   * Generate patches to update version in package.json and README.md
   */
  async generateVersionUpdatePatches(
    solutionPath: string,
    targetSpfxVersion: string,
    options?: VersionUpdateOptions
  ): Promise<PatchObject[]> {
    const opts = { ...this.defaultOptions, ...options };
    const patches: PatchObject[] = [];

    logger.info('📦 Version update options: %O', opts);

    if (!opts.enabled) {
      logger.info('Version updates are disabled');
      return patches;
    }

    try {
      // Read current version from package.json
      const packageJsonPath = path.join(solutionPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        logger.warn('No package.json found, skipping version updates');
        return patches;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, DEFAULTS.ENCODING));
      const currentVersion = packageJson.version || '1.0.0';
      
      // Increment minor version
      const newVersion = semver.inc(currentVersion, 'minor') || '1.1.0';
      logger.info(`📦 Version update: ${currentVersion} → ${newVersion}`);

      // Update package.json
      if (opts.updatePackageJson) {
        patches.push({
          id: 'PANTOUM-VERSION-UPDATE-PACKAGE',
          title: 'Update package.json version',
          description: `Increment version from ${currentVersion} to ${newVersion}`,
          type: 'updateJsonSnippet',
          file: packageJsonPath,
          jsonSnippet: { version: newVersion },
          stage: 'post-upgrade'
        });
      }

      // Update .yo-rc.json nodeVersion
      const yoRcPatch = this.generateYoRcNodeVersionPatch(solutionPath);
      if (yoRcPatch) {
        patches.push(yoRcPatch);
      }

      // Update README.md
      if (opts.updateReadme) {
        const readmePath = path.join(solutionPath, 'README.md');
        if (fs.existsSync(readmePath)) {
          const readmePatches = await this.generateReadmePatches(
            readmePath,
            solutionPath,
            newVersion,
            targetSpfxVersion,
            opts
          );
          patches.push(...readmePatches);
        } else {
          logger.warn('No README.md found, skipping README updates');
        }
      }

      // Update .nvmrc if PnPnvmrc flag is set
      if (opts.PnPnvmrc) {
        logger.info('📝 PnPnvmrc flag is enabled, generating .nvmrc patch...');
        const nvmrcPatch = this.generateNvmrcPatch(solutionPath);
        if (nvmrcPatch) {
          patches.push(nvmrcPatch);
          logger.info('   ✓ Added .nvmrc patch');
        } else {
          logger.warn('   ⚠ Could not generate .nvmrc patch');
        }
      } else {
        logger.info('   ℹ PnPnvmrc flag is disabled, skipping .nvmrc update');
      }

      // Update devcontainer.json if PnPdevcontainer flag is set
      if (opts.PnPdevcontainer) {
        logger.info('📝 PnPdevcontainer flag is enabled, generating devcontainer patch...');
        const devcontainerPatch = this.generateDevcontainerPatch(solutionPath, targetSpfxVersion);
        if (devcontainerPatch) {
          patches.push(devcontainerPatch);
          logger.info('   ✓ Added devcontainer.json patch');
        } else {
          logger.warn('   ⚠ Could not generate devcontainer.json patch');
        }
      } else {
        logger.info('   ℹ PnPdevcontainer flag is disabled, skipping devcontainer update');
      }

      return patches;
    } catch (error) {
      logger.error('Failed to generate version update patches:', error);
      return [];
    }
  }

  /**
   * Generate patches for README.md updates
   */
  private async generateReadmePatches(
    readmePath: string,
    _solutionPath: string,
    newVersion: string,
    targetSpfxVersion: string,
    options: Required<VersionUpdateOptions>
  ): Promise<PatchObject[]> {
    const patches: PatchObject[] = [];
    logger.info('📝 generateReadmePatches called with options: %O', options);
    const readmeContent = fs.readFileSync(readmePath, DEFAULTS.ENCODING);
    const lines = readmeContent.split('\n');

    // Get current Node.js version
    const nodeVersion = this.getCurrentNodeVersion();

    // Update badges
    if (options.updateBadges) {
      const badgePatch = this.generateBadgeUpdatePatch(lines, targetSpfxVersion, nodeVersion);
      if (badgePatch) {
        patches.push(badgePatch);
      }
    }

    // Update version history
    if (options.updateVersionHistory) {
      logger.info(`📝 Generating version history patch...`);
      logger.info(`   Version comment: "${options.versionComment}"`);
      logger.info(`   Target SPFx version: ${targetSpfxVersion}`);
      const versionHistoryPatch = this.generateVersionHistoryPatch(
        lines,
        newVersion,
        options.versionComment,
        targetSpfxVersion
      );
      if (versionHistoryPatch) {
        patches.push(versionHistoryPatch);
        logger.info('   ✓ Added version history patch');
      } else {
        logger.warn('   ⚠ Could not generate version history patch');
      }
    } else {
      logger.info('   ℹ updateVersionHistory is disabled');
    }

    return patches;
  }

  /**
   * Get current Node.js version from process
   */
  private getCurrentNodeVersion(): string {
    // Remove 'v' prefix from process.version
    const nodeVersion = process.version.substring(1);
    logger.info(`Using current Node.js version: ${nodeVersion}`);
    return nodeVersion;
  }

  /**
   * Generate patch to update nodeVersion in .yo-rc.json
   */
  private generateYoRcNodeVersionPatch(solutionPath: string): PatchObject | null {
    try {
      const yoRcPath = path.join(solutionPath, '.yo-rc.json');
      if (!fs.existsSync(yoRcPath)) {
        logger.warn('No .yo-rc.json found, skipping nodeVersion update');
        return null;
      }

      const nodeVersion = this.getCurrentNodeVersion();
      
      return {
        id: 'PANTOUM-UPDATE-YORC-NODE',
        title: 'Update Node version in .yo-rc.json',
        description: `Update nodeVersion to ${nodeVersion}`,
        type: 'updateJsonSnippet',
        file: yoRcPath,
        jsonSnippet: {
          "@microsoft/generator-sharepoint": {
            "nodeVersion": nodeVersion
          }
        },
        stage: 'post-upgrade'
      };
    } catch (error) {
      logger.warn('Failed to generate .yo-rc.json nodeVersion patch:', error);
      return null;
    }
  }

  /**
   * Generate patch to update version badges
   */
  private generateBadgeUpdatePatch(
    lines: string[],
    spfxVersion: string,
    nodeVersion: string
  ): PatchObject | null {
    // Find lines with SPFx and Node.js badges
    let spfxBadgeLineIndex = -1;
    let nodeBadgeLineIndex = -1;
    let badgeStartLine = -1;
    let badgeEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('img.shields.io/badge/SPFx')) {
        spfxBadgeLineIndex = i;
        if (badgeStartLine === -1) badgeStartLine = i;
        badgeEndLine = i;
      }
      if (line.includes('img.shields.io/badge/Node.js')) {
        nodeBadgeLineIndex = i;
        if (badgeStartLine === -1) badgeStartLine = i;
        badgeEndLine = i;
      }
    }

    if (spfxBadgeLineIndex === -1 && nodeBadgeLineIndex === -1) {
      logger.warn('No version badges found in README.md');
      return null;
    }

    // Generate new badge lines
    const newBadgeLines: string[] = [];
    
    // Update or add SPFx badge
    const spfxBadge = `![SPFx ${spfxVersion}](https://img.shields.io/badge/SPFx-${spfxVersion}-green.svg)`;
    newBadgeLines.push(spfxBadge);
    
    // Update or add Node.js badge
    const nodeBadge = `![Node.js v${nodeVersion}](https://img.shields.io/badge/Node.js-%20v${nodeVersion}-green.svg)`;
    newBadgeLines.push(nodeBadge);

    // If badges were on separate lines, keep them separate
    if (spfxBadgeLineIndex !== -1 && nodeBadgeLineIndex !== -1 && 
        Math.abs(spfxBadgeLineIndex - nodeBadgeLineIndex) > 1) {
      // Keep other badges between them
      for (let i = Math.min(spfxBadgeLineIndex, nodeBadgeLineIndex) + 1; 
           i < Math.max(spfxBadgeLineIndex, nodeBadgeLineIndex); i++) {
        if (lines[i].includes('img.shields.io/badge/')) {
          newBadgeLines.splice(1, 0, lines[i]);
        }
      }
    }

    return {
      id: 'PANTOUM-UPDATE-BADGES',
      title: 'Update SPFx and Node.js version badges',
      description: `Update badges to SPFx ${spfxVersion} and Node.js ${nodeVersion}`,
      type: 'updateTextSnippet',
      file: 'README.md',
      fromLine: badgeStartLine + 1, // Convert to 1-based
      toLine: badgeEndLine + 1,
      patchLines: newBadgeLines,
      stage: 'post-upgrade'
    };
  }

  /**
   * Generate patch to add version history entry
   */
  private generateVersionHistoryPatch(
    lines: string[],
    newVersion: string,
    comment: string,
    targetSpfxVersion?: string
  ): PatchObject | null {
    logger.info('   Looking for version history table...');
    logger.info(`   Comment parameter: "${comment}"`);
    logger.info(`   SPFx version parameter: "${targetSpfxVersion}"`);
    
    // Find version history table
    let versionTableStart = -1;
    let firstVersionLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      // Look for version history header
      if (line.includes('version') && line.includes('history')) {
        logger.info(`   Found version history header at line ${i}: "${lines[i]}"`);
        // Look for table header in next few lines
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          // Check for table separator (with or without spaces)
          if (lines[j].includes('---') && lines[j].includes('|')) {
            versionTableStart = j;
            logger.info(`   Found table separator at line ${j}`);
            // First version entry should be right after the separator
            if (j + 1 < lines.length && lines[j + 1].trim()) {
              firstVersionLine = j + 1;
              logger.info(`   First version line at ${firstVersionLine}: "${lines[firstVersionLine]}"`);
            }
            break;
          }
        }
        if (versionTableStart !== -1) break;
      }
    }

    if (firstVersionLine === -1) {
      logger.warn('   No version history table found in README.md');
      return null;
    }

    // Generate new version entry
    const currentDate = new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const formattedDate = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    
    // Replace placeholder in comment if present
    let finalComment = comment;
    if (targetSpfxVersion && comment && comment.includes('{SPFxVersion}')) {
      finalComment = comment.replace('{SPFxVersion}', targetSpfxVersion);
      logger.info(`   Replaced placeholder: "${comment}" -> "${finalComment}"`);
    }
    
    const newVersionEntry = `${newVersion}   | ${formattedDate} | ${finalComment}`;
    logger.info(`   New version entry: "${newVersionEntry}"`);
    
    // Get the existing first line to maintain formatting
    const existingFirstLine = lines[firstVersionLine];
    const newLines = [newVersionEntry, existingFirstLine];

    logger.info(`   Creating version history patch for line ${firstVersionLine + 1}`);
    return {
      id: 'PANTOUM-ADD-VERSION-HISTORY',
      title: 'Add version history entry',
      description: `Add version ${newVersion} to history`,
      type: 'updateTextSnippet',
      file: 'README.md',
      fromLine: firstVersionLine + 1, // Convert to 1-based
      toLine: firstVersionLine + 1,
      patchLines: newLines,
      stage: 'post-upgrade'
    };
  }

  /**
   * Generate patch to update .nvmrc file with Node.js version from README
   */
  private generateNvmrcPatch(solutionPath: string): PatchObject | null {
    try {
      const readmePath = path.join(solutionPath, 'README.md');
      if (!fs.existsSync(readmePath)) {
        logger.warn('No README.md found, skipping .nvmrc update');
        return null;
      }

      const readmeContent = fs.readFileSync(readmePath, DEFAULTS.ENCODING);
      
      // Extract Node.js version from README
      // Try badge format first: "Node.js v18.17.1" or "Node.js-v18.17.1"
      let nodeVersion: string | null = null;
      const badgeMatch = readmeContent.match(/Node\.js[- ]v?(\d+\.\d+\.\d+)/i);
      if (badgeMatch) {
        nodeVersion = badgeMatch[1];
      } else {
        // Try "Tested using Node.js: **v18.17.1**" format
        const testedMatch = readmeContent.match(/Tested using Node\.js:?\s*\*?\*?v?(\d+\.\d+\.\d+)/i);
        if (testedMatch) {
          nodeVersion = testedMatch[1];
        }
      }

      if (!nodeVersion) {
        logger.warn('Could not extract Node.js version from README.md, will use current Node version');
        nodeVersion = this.getCurrentNodeVersion();
      }

      logger.info(`📝 Updating .nvmrc to Node.js version: ${nodeVersion}`);

      const nvmrcPath = path.join(solutionPath, '.nvmrc');
      
      // Check if .nvmrc exists to decide on patch type
      if (fs.existsSync(nvmrcPath)) {
        // File exists, use updateTextSnippet to replace entire content
        return {
          id: 'PANTOUM-UPDATE-NVMRC',
          title: 'Update .nvmrc with Node.js version',
          description: `Set Node.js version to ${nodeVersion}`,
          type: 'updateTextSnippet',
          file: nvmrcPath,
          fromLine: 1,
          toLine: -1, // Replace all lines
          patchLines: [`${nodeVersion}`],
          stage: 'post-upgrade'
        };
      } else {
        // File doesn't exist, create it
        return {
          id: 'PANTOUM-UPDATE-NVMRC',
          title: 'Create .nvmrc with Node.js version',
          description: `Set Node.js version to ${nodeVersion}`,
          type: 'addFile',
          file: nvmrcPath,
          content: `${nodeVersion}\n`,
          stage: 'post-upgrade'
        };
      }
    } catch (error) {
      logger.warn('Failed to generate .nvmrc patch:', error);
      return null;
    }
  }

  /**
   * Generate patch to update devcontainer.json with SPFx version
   */
  private generateDevcontainerPatch(solutionPath: string, targetSpfxVersion: string): PatchObject | null {
    try {
      const devcontainerPath = path.join(solutionPath, '.devcontainer', 'devcontainer.json');
      if (!fs.existsSync(devcontainerPath)) {
        logger.warn('No .devcontainer/devcontainer.json found, skipping update');
        return null;
      }

      logger.info(`📝 Updating devcontainer.json to SPFx version: ${targetSpfxVersion}`);

      return {
        id: 'PANTOUM-UPDATE-DEVCONTAINER',
        title: 'Update devcontainer.json with SPFx version',
        description: `Update devcontainer to SPFx ${targetSpfxVersion}`,
        type: 'updateJsonSnippet',
        file: devcontainerPath,
        jsonSnippet: {
          name: `SPFx ${targetSpfxVersion}`,
          image: `docker.io/m365pnp/spfx:${targetSpfxVersion}`
        },
        stage: 'post-upgrade'
      };
    } catch (error) {
      logger.warn('Failed to generate devcontainer.json patch:', error);
      return null;
    }
  }
}