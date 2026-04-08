import React, { memo, useRef, useMemo } from 'react';
import { makeStyles, tokens, shorthands } from '@fluentui/react-components';
import { useSquirrelGameEngine, type AnimationRefs } from './gameEngine';
import { ITEMS_PER_CYCLE, TREE } from './constants';
import { MAX_DEN_ITEMS } from './entities';

const useStyles = makeStyles({
  container: {
    width: '100%',
    height: '52px',
    ...shorthands.overflow('hidden'),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...shorthands.padding('4px', '0px'),
  },
});

interface SquirrelAnimationProps {
  isActive: boolean;
}

/**
 * All four item shapes rendered inline, toggled by data-kind attribute.
 * The engine shows/hides the correct child via data-kind matching.
 */
function AllItemShapes({ x, y }: { x: number; y: number }) {
  return (
    <>
      {/* Acorn */}
      <g data-kind="acorn" style={{ display: 'none' }}>
        <ellipse cx={x} cy={y - 3} rx="5" ry="2.5" fill="#8B6914" />
        <line x1={x} y1={y - 5.5} x2={x} y2={y - 8} stroke="#8B6914" strokeWidth="1" strokeLinecap="round" />
        <ellipse cx={x} cy={y + 1} rx="4" ry="5" fill="#C4922A" />
      </g>
      {/* Mushroom */}
      <g data-kind="mushroom" style={{ display: 'none' }}>
        <rect x={x - 1.5} y={y - 2} width="3" height="6" rx="1" fill="#E8DCC8" />
        <ellipse cx={x} cy={y - 3} rx="5" ry="3.5" fill="#C0392B" />
        <circle cx={x - 2} cy={y - 4} r="1" fill="#FADBD8" opacity="0.7" />
        <circle cx={x + 2} cy={y - 2.5} r="0.8" fill="#FADBD8" opacity="0.7" />
      </g>
      {/* Berry */}
      <g data-kind="berry" style={{ display: 'none' }}>
        <circle cx={x} cy={y} r="4" fill="#6C3483" />
        <circle cx={x - 1} cy={y - 1} r="1" fill="#A569BD" opacity="0.5" />
        <line x1={x} y1={y - 4} x2={x} y2={y - 7} stroke="#27AE60" strokeWidth="1" strokeLinecap="round" />
      </g>
      {/* Leaf */}
      <g data-kind="leaf" style={{ display: 'none' }}>
        <ellipse cx={x} cy={y} rx="4" ry="2" fill="#5ca04e" transform={`rotate(-30 ${x} ${y})`} />
        <line x1={x - 2} y1={y} x2={x + 3} y2={y - 1} stroke="#3D6B35" strokeWidth="0.5" />
      </g>
    </>
  );
}

export const SquirrelAnimation: React.FC<SquirrelAnimationProps> = memo(({ isActive }) => {
  const styles = useStyles();

  // Refs for all dynamic SVG elements
  const squirrelGroupRef = useRef<SVGGElement | null>(null);
  const squirrelInnerRef = useRef<SVGGElement | null>(null);
  const carriedItemRef = useRef<SVGGElement | null>(null);
  const carriedItemKindRef = useRef<null>(null);
  const supplyItemsRef = useRef<(SVGGElement | null)[]>([]);
  const denItemsRef = useRef<(SVGGElement | null)[]>([]);
  const wolfGroupRef = useRef<SVGGElement | null>(null);
  const crowGroupRef = useRef<SVGGElement | null>(null);
  const crowItemRef = useRef<SVGGElement | null>(null);

  // Stable refs object — never changes identity
  const refs: AnimationRefs = useMemo(() => ({
    squirrelGroup: squirrelGroupRef,
    squirrelInner: squirrelInnerRef,
    carriedItem: carriedItemRef,
    carriedItemKindRef,
    supplyItems: supplyItemsRef,
    denItems: denItemsRef,
    wolfGroup: wolfGroupRef,
    crowGroup: crowGroupRef,
    crowItem: crowItemRef,
  }), []);

  useSquirrelGameEngine(isActive, refs);

  // Pre-compute supply positions
  const supplySlots = useMemo(() =>
    Array.from({ length: ITEMS_PER_CYCLE }, (_, i) => ({
      x: TREE.SUPPLY_ZONE_X + i * TREE.SUPPLY_SPACING,
      y: 31,
    })),
  []);

  return (
    <div className={styles.container}>
      <svg viewBox="0 0 800 44" width="100%" height="44" preserveAspectRatio="xMidYMid meet">
        {/* Ground path */}
        <line
          x1="60" y1="38" x2="740" y2="38"
          stroke={tokens.colorNeutralStroke2}
          strokeWidth="1"
          strokeDasharray="6 4"
        />

        {/* Tree (left) */}
        <TreeGroup />

        {/* Supply items at tree base — pre-rendered, hidden by default */}
        {supplySlots.map((slot, i) => (
          <g
            key={`supply-${i}`}
            ref={el => { supplyItemsRef.current[i] = el; }}
            style={{ display: 'none' }}
          >
            <AllItemShapes x={slot.x} y={slot.y} />
          </g>
        ))}

        {/* Squirrel */}
        <g ref={squirrelGroupRef}>
          <g ref={squirrelInnerRef}>
            <image href="/logo.png" x={-20} y={10} width="32" height="32" />
            {/* Carried item — hidden by default */}
            <g ref={carriedItemRef} style={{ display: 'none' }}>
              <AllItemShapes x={-22} y={28} />
            </g>
          </g>
        </g>

        {/* Den (right) */}
        <DenGroup />

        {/* Den items — pre-rendered slots, hidden by default */}
        {Array.from({ length: MAX_DEN_ITEMS }, (_, i) => (
          <g
            key={`den-${i}`}
            ref={el => { denItemsRef.current[i] = el; }}
            style={{ display: 'none' }}
          >
            {/* Den items use translate transform set by engine, so shapes are at origin */}
            <AllItemShapes x={0} y={0} />
          </g>
        ))}

        {/* Wolf — hidden by default */}
        <g ref={wolfGroupRef} style={{ display: 'none' }}>
          <WolfSilhouette />
        </g>

        {/* Crow — hidden by default */}
        <g ref={crowGroupRef} style={{ display: 'none' }}>
          <CrowBird />
          {/* Crow's stolen item */}
          <g ref={crowItemRef} style={{ display: 'none' }}>
            <AcornShape x={-8} y={30} />
          </g>
        </g>
      </svg>
    </div>
  );
});
SquirrelAnimation.displayName = 'SquirrelAnimation';

/** Memoized tree group */
const TreeGroup = memo(() => (
  <g>
    <rect x="30" y="20" width="8" height="18" rx="1" fill={tokens.colorNeutralForeground3} />
    <ellipse cx="34" cy="16" rx="18" ry="14" fill="#4a8c3f" opacity="0.85" />
    <ellipse cx="28" cy="18" rx="12" ry="10" fill="#5ca04e" opacity="0.7" />
  </g>
));
TreeGroup.displayName = 'TreeGroup';

/** Memoized den group */
const DenGroup = memo(() => (
  <g>
    <rect x="730" y="22" width="16" height="16" rx="2" fill={tokens.colorNeutralForeground3} />
    <ellipse cx="738" cy="22" rx="10" ry="3" fill={tokens.colorNeutralForeground3} />
    <ellipse cx="738" cy="30" rx="5" ry="4" fill={tokens.colorNeutralBackground1} />
    <path d="M 726 22 L 738 12 L 750 22" fill="none" stroke={tokens.colorNeutralForeground3} strokeWidth="2" strokeLinejoin="round" />
  </g>
));
DenGroup.displayName = 'DenGroup';

/** Acorn shape (used for crow's stolen item) */
function AcornShape({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y - 3} rx="5" ry="2.5" fill="#8B6914" />
      <line x1={x} y1={y - 5.5} x2={x} y2={y - 8} stroke="#8B6914" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx={x} cy={y + 1} rx="4" ry="5" fill="#C4922A" />
    </g>
  );
}

/** Wolf silhouette SVG */
function WolfSilhouette() {
  return (
    <g transform="translate(0, 18)">
      <ellipse cx="0" cy="6" rx="14" ry="7" fill="#4A4A4A" />
      <circle cx="-12" cy="2" r="6" fill="#4A4A4A" />
      <polygon points="-16,-4 -14,-8 -12,-3" fill="#4A4A4A" />
      <polygon points="-10,-4 -8,-8 -6,-3" fill="#4A4A4A" />
      <ellipse cx="-18" cy="3" rx="4" ry="2.5" fill="#3A3A3A" />
      <circle cx="-13" cy="0" r="1.2" fill="#FFD700" />
      <circle cx="-13" cy="0" r="0.5" fill="#000" />
      <path d="M 14,4 Q 20,0 18,8" stroke="#4A4A4A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <line x1="-6" y1="12" x2="-6" y2="20" stroke="#4A4A4A" strokeWidth="2" />
      <line x1="6" y1="12" x2="6" y2="20" stroke="#4A4A4A" strokeWidth="2" />
    </g>
  );
}

/** Crow SVG */
function CrowBird() {
  const bodyColor = tokens.colorNeutralForeground1;
  return (
    <g transform="translate(0, 24)">
      <ellipse cx="0" cy="4" rx="10" ry="5" fill={bodyColor} />
      <circle cx="-9" cy="0" r="4" fill={bodyColor} />
      <polygon points="-14,-1 -13,1 -10,0" fill="#E8A317" />
      <circle cx="-10" cy="-1" r="1" fill={tokens.colorNeutralBackground1} />
      <polygon points="10,2 16,0 15,5" fill={bodyColor} />
      <line x1="-3" y1="8" x2="-3" y2="13" stroke={bodyColor} strokeWidth="1" />
      <line x1="3" y1="8" x2="3" y2="13" stroke={bodyColor} strokeWidth="1" />
      <line x1="-5" y1="13" x2="-1" y2="13" stroke={bodyColor} strokeWidth="1" />
      <line x1="1" y1="13" x2="5" y2="13" stroke={bodyColor} strokeWidth="1" />
    </g>
  );
}
