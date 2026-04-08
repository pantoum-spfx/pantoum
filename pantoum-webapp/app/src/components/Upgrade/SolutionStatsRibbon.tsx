import React, { useState, useEffect, useMemo } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { WSLogMessage, WSAIMetricsMessage } from '@shared/types/WebSocketProtocol';

interface SolutionStatsRibbonProps {
  logs: WSLogMessage[];
  aiMetrics: WSAIMetricsMessage[];
  isRunning: boolean;
  startedAt: number | null;
}

const useStyles = makeStyles({
  ribbon: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '4px 8px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
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

export const SolutionStatsRibbon: React.FC<SolutionStatsRibbonProps> = ({
  logs,
  aiMetrics,
  isRunning,
  startedAt,
}) => {
  const styles = useStyles();

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    setElapsed(Date.now() - startedAt);
    if (!isRunning) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt, isRunning]);

  const counts = useMemo(() => {
    let errors = 0, warns = 0;
    for (const log of logs) {
      if (log.data.level === 'error') errors++;
      else if (log.data.level === 'warn') warns++;
    }
    return { errors, warns };
  }, [logs]);

  const aiTotals = useMemo(() => {
    if (aiMetrics.length === 0) return null;
    let totalTokens = 0, costUSD = 0;
    for (const m of aiMetrics) {
      totalTokens += m.data.totalTokens;
      costUSD += m.data.costUSD;
    }
    return { totalTokens, costUSD };
  }, [aiMetrics]);

  return (
    <div className={styles.ribbon}>
      <div className={styles.stat}>
        <Text size={200} weight="semibold">{formatElapsed(elapsed)}</Text>
      </div>
      <Text className={styles.separator}>|</Text>
      <div className={styles.stat}>
        <Text size={200}>{logs.length} logs</Text>
      </div>
      {counts.errors > 0 && (
        <>
          <Text className={styles.separator}>|</Text>
          <div className={styles.stat}>
            <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>{counts.errors} errors</Text>
          </div>
        </>
      )}
      {counts.warns > 0 && (
        <>
          <Text className={styles.separator}>|</Text>
          <div className={styles.stat}>
            <Text size={200} style={{ color: tokens.colorPaletteYellowForeground2 }}>{counts.warns} warns</Text>
          </div>
        </>
      )}
      {aiTotals && (
        <>
          <Text className={styles.separator}>|</Text>
          <div className={styles.stat}>
            <Text size={200} style={{ color: tokens.colorPalettePurpleForeground2 }}>
              {formatTokens(aiTotals.totalTokens)} tokens
            </Text>
          </div>
          <Text className={styles.separator}>|</Text>
          <div className={styles.stat}>
            <Text size={200} style={{ color: tokens.colorPalettePurpleForeground2 }}>
              ${aiTotals.costUSD.toFixed(2)}
            </Text>
          </div>
        </>
      )}
    </div>
  );
};
