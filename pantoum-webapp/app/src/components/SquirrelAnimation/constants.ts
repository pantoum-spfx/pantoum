// World dimensions (SVG viewBox is 800x44)
export const WORLD = {
  WIDTH: 800,
  HEIGHT: 44,
  GROUND_Y: 38,
} as const;

export const SQUIRREL = {
  BASE_SPEED: 80, // px/s
  SCARED_SPEED: 180, // px/s
  SPEED_VARIANCE: 0.2, // ±20% random multiplier per trip
  IDLE_MIN_MS: 800,
  IDLE_MAX_MS: 2500,
  PICKUP_MS: 600,
  DROPOFF_MS: 500,
} as const;

export const TREE = {
  SUPPLY_ZONE_X: 65, // Where items sit at tree base
  SUPPLY_SPACING: 12, // Spacing between supply items
} as const;

export const DEN = {
  DROPOFF_ZONE_X: 720, // x position of den
  ITEM_BASE_X: 735, // Where items appear in den
  ITEM_SPACING_X: 3,
  ITEM_SPACING_Y: 3,
} as const;

export const WOLF = {
  SPAWN_INTERVAL_MIN: 60000, // 60s
  SPAWN_INTERVAL_MAX: 120000, // 120s
  LURK_X: 650, // Where wolf stops to scare squirrel
  SPEED: 60, // px/s
  LURK_DURATION_MS: 2000,
  RETREAT_SPEED: 100,
} as const;

export const CROW = {
  SPAWN_INTERVAL_MIN: 45000, // 45s
  SPAWN_INTERVAL_MAX: 90000, // 90s
  SPEED: 40, // px/s
  STEAL_PAUSE_MS: 1500,
} as const;

export const RENDER_THROTTLE_MS = 50; // ~20fps React state updates
export const ITEMS_PER_CYCLE = 4; // Items before cycle resets
