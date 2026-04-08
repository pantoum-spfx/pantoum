import { TREE, DEN, ITEMS_PER_CYCLE } from './constants';

/** Maximum den items (same as ITEMS_PER_CYCLE) — used to pre-allocate SVG slots */
export const MAX_DEN_ITEMS = ITEMS_PER_CYCLE;

type SquirrelState = 'IDLE' | 'WALKING_RIGHT' | 'WALKING_LEFT' | 'PICKING_UP' | 'DROPPING_OFF' | 'SCARED';

export type ItemKind = 'acorn' | 'mushroom' | 'berry' | 'leaf';

export interface SupplyItem {
  kind: ItemKind;
  x: number;
  y: number;
  visible: boolean;
}

export interface DenItem {
  kind: ItemKind;
  x: number;
  y: number;
}

export interface SquirrelEntity {
  x: number;
  facingRight: boolean;
  state: SquirrelState;
  stateTimer: number;
  speed: number;
  carriedItem: ItemKind | null;
  supplyIndex: number;
  deliveryCount: number;
}

export interface WolfEntity {
  active: boolean;
  x: number;
  phase: 'entering' | 'lurking' | 'retreating';
  timer: number;
}

export interface CrowEntity {
  active: boolean;
  x: number;
  phase: 'entering' | 'stealing' | 'leaving';
  facingRight: boolean;
  timer: number;
  hasItem: boolean;
}

export interface WorldState {
  squirrel: SquirrelEntity;
  supply: SupplyItem[];
  den: DenItem[];
  wolf: WolfEntity;
  crow: CrowEntity;
  wolfSpawnTimer: number;
  crowSpawnTimer: number;
}

interface RenderSnapshot {
  squirrelX: number;
  squirrelFacingRight: boolean;
  squirrelState: SquirrelState;
  carriedItem: ItemKind | null;
  supply: SupplyItem[];
  den: DenItem[];
  wolf: { active: boolean; x: number };
  crow: { active: boolean; x: number; facingRight: boolean; hasItem: boolean };
}

const ITEM_WEIGHTS: [ItemKind, number][] = [
  ['acorn', 55],
  ['mushroom', 18],
  ['berry', 15],
  ['leaf', 12],
];

export function pickRandomItem(): ItemKind {
  const total = ITEM_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [kind, weight] of ITEM_WEIGHTS) {
    r -= weight;
    if (r <= 0) return kind;
  }
  return 'acorn';
}

function generateSupply(): SupplyItem[] {
  const items: SupplyItem[] = [];
  for (let i = 0; i < ITEMS_PER_CYCLE; i++) {
    items.push({
      kind: pickRandomItem(),
      x: TREE.SUPPLY_ZONE_X + i * TREE.SUPPLY_SPACING,
      y: 31,
      visible: true,
    });
  }
  return items;
}

export function createInitialWorld(): WorldState {
  return {
    squirrel: {
      x: TREE.SUPPLY_ZONE_X,
      facingRight: true,
      state: 'IDLE',
      stateTimer: 1000,
      speed: 0,
      carriedItem: null,
      supplyIndex: 0,
      deliveryCount: 0,
    },
    supply: generateSupply(),
    den: [],
    wolf: { active: false, x: 820, phase: 'entering', timer: 0 },
    crow: { active: false, x: 820, phase: 'entering', facingRight: false, timer: 0, hasItem: false },
    wolfSpawnTimer: 60000 + Math.random() * 60000,
    crowSpawnTimer: 45000 + Math.random() * 45000,
  };
}

export function randomSpawnTime(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomSpeed(base: number, variance: number): number {
  return base * (1 + (Math.random() * 2 - 1) * variance);
}
