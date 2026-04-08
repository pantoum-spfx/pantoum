import React from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles, tokens, Text, Tooltip, Spinner } from '@fluentui/react-components';
import { useUpgradeStore } from '../../stores/upgradeStore';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
    padding: '0 8px',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  segment: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dotRunning: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: tokens.colorPaletteGreenForeground1,
    boxShadow: `0 0 4px ${tokens.colorPaletteGreenForeground1}`,
  },
  dotQueued: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: tokens.colorPaletteBlueForeground2,
  },
  separator: {
    color: tokens.colorNeutralForeground4,
    userSelect: 'none',
  },
});

export const UpgradeStatusIndicator: React.FC = () => {
  const styles = useStyles();
  const navigate = useNavigate();
  const batchStatus = useUpgradeStore((s) => s.batchStatus);
  const queue = useUpgradeStore((s) => s.queue);

  if (batchStatus !== 'running' && batchStatus !== 'starting') {
    return null;
  }

  const running = queue.active.length;
  const queued = queue.queued.length;
  const completed = queue.completed.length;
  const failed = queue.failed.length;
  const isInitializing = running === 0 && completed === 0 && failed === 0;

  const tooltipContent = isInitializing
    ? `Initializing upgrade — ${queued} solutions queued`
    : `${running} Running | ${queued} Queued | ${completed} Completed | ${failed} Failed`;

  return (
    <Tooltip content={tooltipContent} relationship="label">
      <div className={styles.root} onClick={() => navigate('/upgrade')}>
        {isInitializing ? (
          <div className={styles.segment}>
            <Spinner size="extra-tiny" />
            <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
              Upgrading {queued}…
            </Text>
          </div>
        ) : (
          <>
            <div className={styles.segment}>
              <div className={styles.dotRunning} />
              <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                {running} Running
              </Text>
            </div>
            {queued > 0 && (
              <>
                <Text size={200} className={styles.separator}>|</Text>
                <div className={styles.segment}>
                  <div className={styles.dotQueued} />
                  <Text size={200} style={{ color: tokens.colorPaletteBlueForeground2 }}>
                    {queued} Queued
                  </Text>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Tooltip>
  );
};
