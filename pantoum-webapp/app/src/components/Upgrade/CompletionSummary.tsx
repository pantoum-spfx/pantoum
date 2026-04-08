import React from 'react';
import { makeStyles, tokens, Text, Card, Button } from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ClockRegular,
  DocumentTextRegular,
} from '@fluentui/react-icons';
import type { WSCompleteMessage } from '@shared/types/WebSocketProtocol';

interface CompletionSummaryProps {
  data: WSCompleteMessage['data'];
  onViewReports: () => void;
}

const useStyles = makeStyles({
  card: {
    padding: '20px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '16px',
    marginTop: '12px',
  },
  stat: {
    textAlign: 'center',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
});

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export const CompletionSummary: React.FC<CompletionSummaryProps> = ({
  data,
  onViewReports,
}) => {
  const styles = useStyles();

  return (
    <Card className={styles.card}>
      <div className={styles.titleRow}>
        {data.success ? (
          <CheckmarkCircleRegular style={{ fontSize: '24px', color: tokens.colorPaletteGreenForeground1 }} />
        ) : (
          <DismissCircleRegular style={{ fontSize: '24px', color: tokens.colorPaletteRedForeground1 }} />
        )}
        <Text size={500} weight="bold">
          {data.success ? 'Upgrade Complete' : 'Upgrade Finished with Errors'}
        </Text>
      </div>
      <div className={styles.grid}>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: tokens.colorNeutralForeground1 }}>
            {data.summary.total}
          </div>
          <Text size={200}>Total</Text>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: tokens.colorPaletteGreenForeground1 }}>
            {data.summary.succeeded}
          </div>
          <Text size={200}>Succeeded</Text>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ color: tokens.colorPaletteRedForeground1 }}>
            {data.summary.failed}
          </div>
          <Text size={200}>Failed</Text>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <ClockRegular style={{ fontSize: '20px' }} />
            {formatDuration(data.summary.durationMs)}
          </div>
          <Text size={200}>Duration</Text>
        </div>
      </div>
      <div className={styles.actions}>
        <Button appearance="primary" icon={<DocumentTextRegular />} onClick={onViewReports}>
          View Reports
        </Button>
      </div>
    </Card>
  );
};
