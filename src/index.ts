// src/index.ts
import { UpgradeService } from './core/upgradeService/index.js';
import type { UpgradeOptions, UpgradeResult } from './core/upgradeService/index.js';

const upgradeService = new UpgradeService();

export type { UpgradeResult, UpgradeOptions };

export async function upgradeRepo(options: UpgradeOptions): Promise<UpgradeResult> {
  return await upgradeService.upgradeRepository(options);
}