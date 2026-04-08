// src/core/npmRegistryService.ts
import { execa } from 'execa';
import * as semver from 'semver';
import { logger } from '../utils/logger.js';
import type { PackageVersionInfo } from '../schema/complexityTypes.js';
import { TIMEOUTS } from '../constants.js';
import { NPM_REGISTRY_DEFAULTS } from '../defaults.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for interacting with NPM registry with built-in caching
 */
export class NpmRegistryService {
  private cache: Map<string, CacheEntry<any>>;
  private cacheTTL: number;
  private readonly maxRetries = NPM_REGISTRY_DEFAULTS.MAX_RETRIES;
  private readonly retryDelay = NPM_REGISTRY_DEFAULTS.RETRY_DELAY_MS;

  constructor(cacheTTL: number = 3600000) { // Default: 1 hour
    this.cache = new Map();
    this.cacheTTL = cacheTTL;
  }

  /**
   * Get the latest version of a package from NPM
   */
  async getLatestVersion(
    packageName: string,
    includePrerelease: boolean = false
  ): Promise<string | null> {
    const cacheKey = `latest:${packageName}:${includePrerelease}`;
    const cached = this.getFromCache<string>(cacheKey);
    if (cached !== null) return cached;

    try {
      const { stdout } = await this.execWithRetry(
        'npm',
        ['view', packageName, 'version'],
        TIMEOUTS.THIRD_PARTY_TIMEOUT
      );

      const version = stdout.trim();
      if (version && semver.valid(version)) {
        this.setCache(cacheKey, version);
        return version;
      }
      return null;
    } catch (error) {
      logger.warn(`Failed to fetch latest version for ${packageName}: ${error}`);
      return null;
    }
  }

  /**
   * Get all versions of a package
   */
  async getAllVersions(packageName: string): Promise<string[]> {
    const cacheKey = `versions:${packageName}`;
    const cached = this.getFromCache<string[]>(cacheKey);
    if (cached !== null) return cached;

    try {
      const { stdout } = await this.execWithRetry(
        'npm',
        ['view', packageName, 'versions', '--json'],
        TIMEOUTS.THIRD_PARTY_TIMEOUT
      );

      const versions = JSON.parse(stdout) as string[];
      const validVersions = versions.filter(v => semver.valid(v));

      this.setCache(cacheKey, validVersions);
      return validVersions;
    } catch (error) {
      logger.warn(`Failed to fetch versions for ${packageName}: ${error}`);
      return [];
    }
  }

  /**
   * Get detailed package information including release dates
   */
  async getPackageInfo(packageName: string): Promise<PackageVersionInfo | null> {
    const cacheKey = `info:${packageName}`;
    const cached = this.getFromCache<PackageVersionInfo>(cacheKey);
    if (cached !== null) return cached;

    try {
      // Get basic package info
      const { stdout: packageJson } = await this.execWithRetry(
        'npm',
        ['view', packageName, '--json'],
        TIMEOUTS.THIRD_PARTY_TIMEOUT
      );

      const data = JSON.parse(packageJson);

      // Get time data (release dates)
      let timeData: Record<string, string> = {};
      try {
        const { stdout: timeJson } = await this.execWithRetry(
          'npm',
          ['view', packageName, 'time', '--json'],
          TIMEOUTS.THIRD_PARTY_TIMEOUT
        );
        timeData = JSON.parse(timeJson);
      } catch {
        // Time data is optional
      }

      const info: PackageVersionInfo = {
        name: packageName,
        current: '', // Will be filled by caller
        latest: data.version || data['dist-tags']?.latest || '',
        versions: data.versions || [],
        time: timeData,
        deprecated: !!data.deprecated
      };

      this.setCache(cacheKey, info);
      return info;
    } catch (error) {
      logger.warn(`Failed to fetch package info for ${packageName}: ${error}`);
      return null;
    }
  }

  /**
   * Calculate how many days behind a version is from the latest
   */
  async getDaysBehind(
    packageName: string,
    currentVersion: string
  ): Promise<number | null> {
    try {
      const info = await this.getPackageInfo(packageName);
      if (!info || !info.time) return null;

      const current = semver.clean(currentVersion);
      const latest = info.latest;

      if (!current || !latest) return null;
      if (current === latest) return 0;

      const currentDate = info.time[current];
      const latestDate = info.time[latest];

      if (!currentDate || !latestDate) return null;

      const daysDiff = Math.floor(
        (new Date(latestDate).getTime() - new Date(currentDate).getTime())
        / (1000 * 60 * 60 * 24)
      );

      return Math.max(0, daysDiff);
    } catch {
      return null;
    }
  }

  /**
   * Get the best version to update to based on strategy
   */
  async getBestUpdateVersion(
    packageName: string,
    currentVersion: string,
    strategy: 'patch' | 'minor' | 'major'
  ): Promise<string | null> {
    const versions = await this.getAllVersions(packageName);
    if (versions.length === 0) return null;

    const cleanCurrent = semver.clean(currentVersion.replace(/^[\^~]/, ''));
    if (!cleanCurrent) return null;

    let targetVersion: string | null = null;

    switch (strategy) {
      case 'patch':
        // Get latest patch version within same minor
        targetVersion = semver.maxSatisfying(versions, `~${cleanCurrent}`);
        break;
      case 'minor':
        // Get latest minor version within same major
        targetVersion = semver.maxSatisfying(versions, `^${cleanCurrent}`);
        break;
      case 'major':
        // Get absolute latest stable version
        targetVersion = semver.maxSatisfying(versions, '*', {
          includePrerelease: false
        });
        break;
    }

    // Only return if it's actually newer
    if (targetVersion && semver.gt(targetVersion, cleanCurrent)) {
      return targetVersion;
    }

    return null;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get data from cache if not expired
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set data in cache
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Execute command with retry logic
   */
  private async execWithRetry(
    command: string,
    args: string[],
    timeout: number
  ): Promise<{ stdout: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await execa(command, args, { timeout });
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    throw lastError;
  }
}