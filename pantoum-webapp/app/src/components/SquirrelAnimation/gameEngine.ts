import { useRef, useEffect, useCallback, type RefObject } from 'react';
import {
  SQUIRREL, TREE, DEN, WOLF, CROW,
  RENDER_THROTTLE_MS, ITEMS_PER_CYCLE,
} from './constants';
import {
  createInitialWorld, randomSpawnTime, randomSpeed, pickRandomItem,
  type WorldState, type ItemKind, MAX_DEN_ITEMS,
} from './entities';

/** Refs to pre-rendered SVG elements — engine writes attributes directly */
export interface AnimationRefs {
  squirrelGroup: RefObject<SVGGElement | null>;
  squirrelInner: RefObject<SVGGElement | null>;
  carriedItem: RefObject<SVGGElement | null>;
  carriedItemKindRef: RefObject<ItemKind | null>;
  supplyItems: RefObject<(SVGGElement | null)[]>;
  denItems: RefObject<(SVGGElement | null)[]>;
  wolfGroup: RefObject<SVGGElement | null>;
  crowGroup: RefObject<SVGGElement | null>;
  crowItem: RefObject<SVGGElement | null>;
}

/** Write world state directly to SVG DOM — zero React coupling */
function renderToDOM(refs: AnimationRefs, world: WorldState): void {
  // Squirrel position + facing
  const scaleX = world.squirrel.facingRight ? -1 : 1;
  refs.squirrelGroup.current?.setAttribute('transform',
    `translate(${world.squirrel.x}, 0) scale(${scaleX}, 1)`);
  refs.squirrelInner.current?.setAttribute('transform',
    world.squirrel.facingRight ? 'translate(16, 0)' : 'translate(-16, 0)');

  // Carried item visibility + kind
  const ci = refs.carriedItem.current;
  if (ci) {
    ci.style.display = world.squirrel.carriedItem ? '' : 'none';
    // Update data-kind so CSS/children can react (the SVG shapes are static,
    // we show/hide sub-groups via data attribute)
    if (world.squirrel.carriedItem) {
      ci.setAttribute('data-kind', world.squirrel.carriedItem);
      // Show only the matching item kind child, hide others
      for (const child of Array.from(ci.children)) {
        const el = child as SVGElement;
        el.style.display = el.getAttribute('data-kind') === world.squirrel.carriedItem ? '' : 'none';
      }
    }
  }

  // Supply items: show/hide
  const supplyArr = refs.supplyItems.current;
  if (supplyArr) {
    for (let i = 0; i < ITEMS_PER_CYCLE; i++) {
      const el = supplyArr[i];
      if (el) {
        const item = world.supply[i];
        el.style.display = item?.visible ? '' : 'none';
        if (item?.visible) {
          // Update kind visibility
          for (const child of Array.from(el.children)) {
            const svg = child as SVGElement;
            svg.style.display = svg.getAttribute('data-kind') === item.kind ? '' : 'none';
          }
        }
      }
    }
  }

  // Den items: show/hide + position
  const denArr = refs.denItems.current;
  if (denArr) {
    for (let i = 0; i < MAX_DEN_ITEMS; i++) {
      const el = denArr[i];
      if (el) {
        const item = world.den[i];
        if (item) {
          el.style.display = '';
          el.setAttribute('transform', `translate(${item.x}, ${item.y})`);
          // Update kind visibility
          for (const child of Array.from(el.children)) {
            const svg = child as SVGElement;
            svg.style.display = svg.getAttribute('data-kind') === item.kind ? '' : 'none';
          }
        } else {
          el.style.display = 'none';
        }
      }
    }
  }

  // Wolf visibility + position
  const wg = refs.wolfGroup.current;
  if (wg) {
    wg.style.display = world.wolf.active ? '' : 'none';
    if (world.wolf.active) wg.setAttribute('transform', `translate(${world.wolf.x}, 0)`);
  }

  // Crow visibility + position + facing
  const cg = refs.crowGroup.current;
  if (cg) {
    cg.style.display = world.crow.active ? '' : 'none';
    if (world.crow.active) {
      const crowScale = world.crow.facingRight ? -1 : 1;
      cg.setAttribute('transform', `translate(${world.crow.x}, 0) scale(${crowScale}, 1)`);
    }
  }
  const crowItemEl = refs.crowItem.current;
  if (crowItemEl) crowItemEl.style.display = world.crow.hasItem ? '' : 'none';
}

function updateSquirrel(world: WorldState, dt: number): void {
  const sq = world.squirrel;
  const dx = sq.speed * (dt / 1000);

  switch (sq.state) {
    case 'IDLE': {
      sq.stateTimer -= dt;
      if (sq.stateTimer <= 0) {
        if (sq.carriedItem) {
          sq.state = 'WALKING_RIGHT';
          sq.facingRight = true;
          sq.speed = randomSpeed(SQUIRREL.BASE_SPEED, SQUIRREL.SPEED_VARIANCE);
        } else {
          if (sq.x > TREE.SUPPLY_ZONE_X + sq.supplyIndex * TREE.SUPPLY_SPACING + 5) {
            sq.state = 'WALKING_LEFT';
            sq.facingRight = false;
            sq.speed = randomSpeed(SQUIRREL.BASE_SPEED, SQUIRREL.SPEED_VARIANCE);
          } else {
            sq.state = 'PICKING_UP';
            sq.stateTimer = SQUIRREL.PICKUP_MS;
          }
        }
      }
      break;
    }

    case 'WALKING_RIGHT': {
      sq.x += dx;
      if (sq.x >= DEN.DROPOFF_ZONE_X) {
        sq.x = DEN.DROPOFF_ZONE_X;
        sq.state = 'DROPPING_OFF';
        sq.stateTimer = SQUIRREL.DROPOFF_MS;
      }
      break;
    }

    case 'WALKING_LEFT': {
      sq.x -= dx;
      const targetX = TREE.SUPPLY_ZONE_X + sq.supplyIndex * TREE.SUPPLY_SPACING;
      if (sq.x <= targetX) {
        sq.x = targetX;
        sq.state = 'PICKING_UP';
        sq.stateTimer = SQUIRREL.PICKUP_MS;
      }
      break;
    }

    case 'PICKING_UP': {
      sq.stateTimer -= dt;
      if (sq.stateTimer <= 0) {
        const supplyItem = world.supply[sq.supplyIndex];
        if (supplyItem && supplyItem.visible) {
          sq.carriedItem = supplyItem.kind;
          supplyItem.visible = false;
          sq.supplyIndex++;
        }
        sq.state = 'IDLE';
        sq.stateTimer = SQUIRREL.IDLE_MIN_MS + Math.random() * (SQUIRREL.IDLE_MAX_MS - SQUIRREL.IDLE_MIN_MS);
      }
      break;
    }

    case 'DROPPING_OFF': {
      sq.stateTimer -= dt;
      if (sq.stateTimer <= 0) {
        if (sq.carriedItem) {
          const denCount = world.den.length;
          world.den.push({
            kind: sq.carriedItem,
            x: DEN.ITEM_BASE_X + (denCount % 2 === 0 ? 0 : DEN.ITEM_SPACING_X),
            y: 32 - denCount * DEN.ITEM_SPACING_Y,
          });
          sq.carriedItem = null;
          sq.deliveryCount++;
        }
        if (sq.deliveryCount >= ITEMS_PER_CYCLE) {
          resetCycle(world);
        }
        sq.facingRight = false;
        sq.state = 'IDLE';
        sq.stateTimer = SQUIRREL.IDLE_MIN_MS + Math.random() * (SQUIRREL.IDLE_MAX_MS - SQUIRREL.IDLE_MIN_MS);
      }
      break;
    }

    case 'SCARED': {
      sq.x -= SQUIRREL.SCARED_SPEED * (dt / 1000);
      sq.facingRight = false;
      if (sq.x <= TREE.SUPPLY_ZONE_X) {
        sq.x = TREE.SUPPLY_ZONE_X;
        // Put carried item back in supply so the squirrel can re-collect it
        if (sq.carriedItem && sq.supplyIndex > 0) {
          sq.supplyIndex--;
          const slot = world.supply[sq.supplyIndex];
          if (slot) slot.visible = true;
        }
        sq.carriedItem = null;
        sq.state = 'IDLE';
        sq.stateTimer = SQUIRREL.IDLE_MAX_MS;
      }
      break;
    }
  }
}

function updateWolf(world: WorldState, dt: number): void {
  const wolf = world.wolf;

  if (!wolf.active) {
    world.wolfSpawnTimer -= dt;
    if (world.wolfSpawnTimer <= 0) {
      wolf.active = true;
      wolf.x = 820;
      wolf.phase = 'entering';
      wolf.timer = 0;
    }
    return;
  }

  switch (wolf.phase) {
    case 'entering': {
      wolf.x -= WOLF.SPEED * (dt / 1000);
      if (wolf.x <= WOLF.LURK_X) {
        wolf.x = WOLF.LURK_X;
        wolf.phase = 'lurking';
        wolf.timer = WOLF.LURK_DURATION_MS;
        const sq = world.squirrel;
        if (sq.state !== 'SCARED') {
          sq.state = 'SCARED';
          sq.stateTimer = 0;
        }
      }
      break;
    }
    case 'lurking': {
      wolf.timer -= dt;
      if (wolf.timer <= 0) {
        wolf.phase = 'retreating';
      }
      break;
    }
    case 'retreating': {
      wolf.x += WOLF.RETREAT_SPEED * (dt / 1000);
      if (wolf.x > 830) {
        wolf.active = false;
        world.wolfSpawnTimer = randomSpawnTime(WOLF.SPAWN_INTERVAL_MIN, WOLF.SPAWN_INTERVAL_MAX);
      }
      break;
    }
  }
}

function updateCrow(world: WorldState, dt: number): void {
  const crow = world.crow;

  if (!crow.active) {
    world.crowSpawnTimer -= dt;
    if (world.crowSpawnTimer <= 0 && world.den.length > 0) {
      crow.active = true;
      crow.x = 820;
      crow.phase = 'entering';
      crow.facingRight = false;
      crow.hasItem = false;
      crow.timer = 0;
    }
    return;
  }

  switch (crow.phase) {
    case 'entering': {
      crow.x -= CROW.SPEED * (dt / 1000);
      if (crow.x <= DEN.DROPOFF_ZONE_X + 18) {
        crow.x = DEN.DROPOFF_ZONE_X + 18;
        crow.phase = 'stealing';
        crow.timer = CROW.STEAL_PAUSE_MS;
      }
      break;
    }
    case 'stealing': {
      crow.timer -= dt;
      if (crow.timer <= 0) {
        if (world.den.length > 0) {
          world.den.pop();
          crow.hasItem = true;
        }
        crow.facingRight = true;
        crow.phase = 'leaving';
      }
      break;
    }
    case 'leaving': {
      crow.x += CROW.SPEED * (dt / 1000);
      if (crow.x > 830) {
        crow.active = false;
        world.crowSpawnTimer = randomSpawnTime(CROW.SPAWN_INTERVAL_MIN, CROW.SPAWN_INTERVAL_MAX);
      }
      break;
    }
  }
}

function resetCycle(world: WorldState): void {
  world.den = [];
  world.squirrel.supplyIndex = 0;
  world.squirrel.deliveryCount = 0;
  for (let i = 0; i < ITEMS_PER_CYCLE; i++) {
    world.supply[i] = {
      kind: pickRandomItem(),
      x: TREE.SUPPLY_ZONE_X + i * TREE.SUPPLY_SPACING,
      y: 31,
      visible: true,
    };
  }
}

/**
 * Game engine hook — drives the animation via direct DOM writes (no React state).
 * The RAF loop updates worldRef and writes SVG attributes directly to the refs.
 */
export function useSquirrelGameEngine(isActive: boolean, refs: AnimationRefs): void {
  const worldRef = useRef<WorldState>(createInitialWorld());
  const lastTimeRef = useRef<number>(0);
  const lastRenderRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const tick = useCallback((timestamp: number) => {
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
      lastRenderRef.current = timestamp;
    }

    const dt = Math.min(timestamp - lastTimeRef.current, 100);
    lastTimeRef.current = timestamp;

    const world = worldRef.current;

    updateSquirrel(world, dt);
    updateWolf(world, dt);
    updateCrow(world, dt);

    if (timestamp - lastRenderRef.current >= RENDER_THROTTLE_MS) {
      lastRenderRef.current = timestamp;
      renderToDOM(refs, world);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [refs]);

  useEffect(() => {
    if (isActive) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isActive, tick]);
}
