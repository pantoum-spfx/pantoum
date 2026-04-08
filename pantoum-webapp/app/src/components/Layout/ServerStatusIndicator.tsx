import React, { useEffect } from 'react';
import { makeStyles, tokens, Text, Tooltip } from '@fluentui/react-components';
import { useConnectionStore } from '../../stores/connectionStore';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    padding: '0 8px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  dotConnected: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: tokens.colorPaletteGreenForeground1,
    boxShadow: `0 0 4px ${tokens.colorPaletteGreenForeground1}`,
  },
  dotDisconnected: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: tokens.colorPaletteRedForeground1,
  },
});

export const ServerStatusIndicator: React.FC = () => {
  const styles = useStyles();
  const { wsConnected, serverUptime, setWsConnected, setServerUptime } = useConnectionStore();

  // Periodically poll server health
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setWsConnected(true);
            setServerUptime(data.uptime ?? null);
          }
        } else if (mounted) {
          setWsConnected(false);
          setServerUptime(null);
        }
      } catch {
        if (mounted) {
          setWsConnected(false);
          setServerUptime(null);
        }
      }
    };

    check();
    const id = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, [setWsConnected, setServerUptime]);

  const tooltipContent = wsConnected
    ? `Server connected${serverUptime != null ? ` — Uptime: ${formatUptime(serverUptime)}` : ''}`
    : 'Server disconnected';

  return (
    <Tooltip content={tooltipContent} relationship="label">
      <div className={styles.root}>
        <div className={wsConnected ? styles.dotConnected : styles.dotDisconnected} />
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {wsConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </div>
    </Tooltip>
  );
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
