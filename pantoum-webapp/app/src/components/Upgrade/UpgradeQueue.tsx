import React, { useEffect, useRef, useState } from 'react';
import { makeStyles, tokens, Text, Badge, Button } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';

interface UpgradeQueueProps {
  queued: string[];
  disableAnimations?: boolean;
  onRemove?: (solutionPath: string) => void;
}

interface QueueEntry {
  solutionPath: string;
  exiting: boolean;
}

const ENTER_DURATION = 300;
const EXIT_DURATION = 300;
const STAGGER_MS = 50;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    opacity: 0.7,
  },
  itemEnter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    animationName: {
      from: { opacity: 0, transform: 'translateY(-16px)' },
      to: { opacity: 0.7, transform: 'translateY(0)' },
    },
    animationDuration: `${ENTER_DURATION}ms`,
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
    opacity: 0,
  },
  itemExit: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    animationName: {
      from: { opacity: 0.7, transform: 'translateY(0) scale(1)', maxHeight: '40px' },
      to: { opacity: 0, transform: 'translateY(16px) scale(0.92)', maxHeight: '0px' },
    },
    animationDuration: `${EXIT_DURATION}ms`,
    animationTimingFunction: 'ease-in',
    animationFillMode: 'forwards',
    overflow: 'hidden',
  },
  name: {
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '13px',
    flex: 1,
  },
  position: {
    fontVariantNumeric: 'tabular-nums',
    minWidth: '24px',
    textAlign: 'center',
  },
});

function getBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

export const UpgradeQueue: React.FC<UpgradeQueueProps> = ({ queued, disableAnimations, onRemove }) => {
  const styles = useStyles();
  const prevQueuedRef = useRef<string[]>(queued);
  const isFirstRenderRef = useRef(true);
  const [entries, setEntries] = useState<QueueEntry[]>(() =>
    queued.map((solutionPath) => ({ solutionPath, exiting: false })),
  );

  useEffect(() => {
    const prev = new Set(prevQueuedRef.current);
    const curr = new Set(queued);

    // Items removed from the queue → mark as exiting
    const removed = prevQueuedRef.current.filter((p) => !curr.has(p));
    // Items newly added
    const currentEntries = queued.map((solutionPath) => ({ solutionPath, exiting: false }));

    if (removed.length > 0 && !disableAnimations) {
      const exitingEntries = removed.map((solutionPath) => ({ solutionPath, exiting: true }));
      // Merge: exiting items first, then current items
      setEntries([...exitingEntries, ...currentEntries]);
      // Remove exiting items after animation
      const timer = setTimeout(() => {
        setEntries((prev) => prev.filter((e) => !e.exiting));
      }, EXIT_DURATION);
      prevQueuedRef.current = queued;
      return () => clearTimeout(timer);
    } else {
      setEntries(currentEntries);
    }

    prevQueuedRef.current = queued;
  }, [queued, disableAnimations]);

  // Track first render for stagger
  useEffect(() => {
    isFirstRenderRef.current = false;
  }, []);

  // Count active (non-exiting) items for the badge
  const activeCount = entries.filter((e) => !e.exiting).length;
  if (entries.length === 0) return null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size={300} weight="semibold">Queue</Text>
        <Badge appearance="outline" size="small">{activeCount} pending</Badge>
      </div>
      {entries.map((entry, i) => {
        const itemClass = disableAnimations
          ? styles.item
          : entry.exiting
            ? styles.itemExit
            : styles.itemEnter;

        const staggerDelay = !disableAnimations && !entry.exiting && isFirstRenderRef.current
          ? `${i * STAGGER_MS}ms`
          : undefined;

        // Position counter only for non-exiting items
        const position = entry.exiting ? undefined : entries.filter((e, j) => !e.exiting && j <= i).length;

        return (
          <div
            key={entry.solutionPath}
            className={itemClass}
            style={staggerDelay ? { animationDelay: staggerDelay } : undefined}
          >
            {position !== undefined && (
              <Text size={200} className={styles.position}>{position}</Text>
            )}
            <Text className={styles.name}>{getBaseName(entry.solutionPath)}</Text>
            <Badge appearance="outline" color="informative" size="small">
              {entry.exiting ? 'Starting...' : 'Pending'}
            </Badge>
            {!entry.exiting && onRemove && (
              <Button
                appearance="subtle"
                size="small"
                icon={<DismissRegular />}
                onClick={() => onRemove(entry.solutionPath)}
                aria-label="Remove from queue"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
