import React, { useState, useEffect } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { AggregatedMetrics, QueueState } from '../../stores/upgradeStore';

interface TotalStatsBarProps {
  metrics: AggregatedMetrics;
  queue: QueueState;
  totalSolutions: number;
  isRunning: boolean;
  startTime: number | null;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    fontVariantNumeric: 'tabular-nums',
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  separator: {
    color: tokens.colorNeutralStroke2,
  },
  queueRow: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
});

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export const TotalStatsBar: React.FC<TotalStatsBarProps> = ({
  metrics,
  queue,
  totalSolutions,
  isRunning,
  startTime,
}) => {
  const styles = useStyles();

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    setElapsed(Date.now() - startTime);
    if (!isRunning) return;
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [startTime, isRunning]);

  const doneCount = queue.completed.length + queue.failed.length;

  return (
    <div className={styles.root}>
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <Text size={300} weight="bold">{formatElapsed(elapsed)}</Text>
        </div>
        <Text className={styles.separator}>|</Text>
        <div className={styles.stat}>
          <Text size={300} weight="semibold">{metrics.totalLogs}</Text>
          <Text size={200}>Logs</Text>
        </div>
        <Text className={styles.separator}>|</Text>
        <div className={styles.stat}>
          <Text size={300} weight="semibold" style={{ color: metrics.totalWarns > 0 ? tokens.colorPaletteYellowForeground2 : undefined }}>
            {metrics.totalWarns}
          </Text>
          <Text size={200}>Warns</Text>
        </div>
        <Text className={styles.separator}>|</Text>
        <div className={styles.stat}>
          <Text size={300} weight="semibold" style={{ color: metrics.totalErrors > 0 ? tokens.colorPaletteRedForeground1 : undefined }}>
            {metrics.totalErrors}
          </Text>
          <Text size={200}>Errors</Text>
        </div>
        {metrics.totalTokens > 0 && (
          <>
            <Text className={styles.separator}>|</Text>
            <div className={styles.stat}>
              <Text size={300} weight="semibold" style={{ color: tokens.colorPalettePurpleForeground2 }}>
                {formatTokens(metrics.totalTokens)}
              </Text>
              <Text size={200}>Tokens</Text>
            </div>
            <Text className={styles.separator}>|</Text>
            <div className={styles.stat}>
              <Text size={300} weight="semibold" style={{ color: tokens.colorPalettePurpleForeground2 }}>
                ${metrics.totalCostUSD.toFixed(2)}
              </Text>
              <Text size={200}>Cost</Text>
            </div>
          </>
        )}
      </div>
      <Text size={200} className={styles.queueRow}>
        {doneCount}/{totalSolutions} solutions
        {queue.completed.length > 0 && ` (${queue.completed.length} completed`}
        {queue.failed.length > 0 && `, ${queue.failed.length} failed`}
        {queue.active.length > 0 && `, ${queue.active.length} active`}
        {queue.queued.length > 0 && `, ${queue.queued.length} queued`}
        {(queue.completed.length > 0 || queue.failed.length > 0) && ')'}
      </Text>
    </div>
  );
};
