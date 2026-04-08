import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Card,
  Badge,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import {
  PlayRegular,
  StopRegular,
  DeleteRegular,
  ArrowDownloadRegular,
  BotSparkleRegular,
  ClockRegular,
  MoneyRegular,
} from '@fluentui/react-icons';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useUpgradeStore } from '../../stores/upgradeStore';
import { EventLine, ProcessingIndicator } from './EventLine';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  controls: {
    display: 'flex',
    gap: '8px',
  },
  outputArea: {
    backgroundColor: '#1e1e1e',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '13px',
    lineHeight: '20px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    color: '#d4d4d4',
  },
  metricsCard: {
    padding: '16px 20px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '16px',
    marginTop: '8px',
  },
  metricStat: {
    textAlign: 'center',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
});

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export interface AiAnalyzePanelProps {
  solutionPaths?: string[];
  reportPath?: string;
  rootPath?: string;
  compact?: boolean;
}

export const AiAnalyzePanel: React.FC<AiAnalyzePanelProps> = ({
  solutionPaths, reportPath, rootPath, compact,
}) => {
  const styles = useStyles();
  const outputRef = useRef<HTMLDivElement>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed' | 'stopped'>('idle');
  const [starting, setStarting] = useState(false);

  const ws = useWebSocket(sessionId);
  const consoleEvents = useUpgradeStore((s) => s.aiConsoleEvents);

  // Detect done from events (use .some — done may not be the last event)
  useEffect(() => {
    if (consoleEvents.length === 0 || status !== 'running') return;
    const hasDone = consoleEvents.some((e) => e.data.eventType === 'done');
    if (hasDone) {
      const hasError = consoleEvents.some((e) => e.data.eventType === 'error');
      setStatus(hasError ? 'failed' : 'completed');
    }
  }, [consoleEvents, status]);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [consoleEvents]);

  // Extract metrics
  const metrics = useMemo(() => {
    const metricsEvent = consoleEvents.find((e) => e.data.eventType === 'metrics' && e.data.metrics);
    return metricsEvent?.data.metrics || null;
  }, [consoleEvents]);

  // Elapsed timer
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === 'running') {
      setStartTime(Date.now());
      setElapsed(0);
    } else if (status !== 'idle') {
      setStartTime(null);
    }
  }, [status]);

  useEffect(() => {
    if (startTime == null) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  // Count tool_use events
  const toolCount = useMemo(
    () => consoleEvents.filter((e) => e.data.eventType === 'tool_use').length,
    [consoleEvents],
  );

  const isRunning = status === 'running' || starting;
  const isFinished = status === 'completed' || status === 'failed' || status === 'stopped';

  const handleRun = async () => {
    setStarting(true);
    setStatus('idle');
    useUpgradeStore.setState({ aiConsoleEvents: [] });

    try {
      const context: Record<string, unknown> = {};
      if (solutionPaths?.length) context.solutionPaths = solutionPaths;
      if (reportPath) context.reportPath = reportPath;
      if (rootPath) context.rootPath = rootPath;

      const res = await fetch('/api/ai-console/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: 'analyze',
          context: Object.keys(context).length > 0 ? context : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setStatus('running');
    } catch (err) {
      setStatus('failed');
      console.error('Failed to start AI analysis:', err);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/ai-console/${sessionId}/stop`, { method: 'POST' });
      setStatus('stopped');
    } catch {
      // Best-effort
    }
  };

  const handleClear = () => {
    setSessionId(null);
    setStatus('idle');
    useUpgradeStore.setState({ aiConsoleEvents: [] });
  };

  const downloadAnalysis = () => {
    const raw = consoleEvents
      .filter((e) => e.data.eventType === 'text')
      .map((e) => e.data.content)
      .join('\n');
    // Strip AI preamble — keep from first markdown heading onward
    const headingIndex = raw.search(/^#{1,6}\s/m);
    const md = headingIndex > 0 ? raw.slice(headingIndex) : raw;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PANTOUM_Analysis_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const outputHeight = compact ? '300px' : '400px';
  const maxHeight = compact ? '40vh' : '65vh';

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BotSparkleRegular style={{ fontSize: '20px', color: tokens.colorPalettePurpleForeground2 }} />
          <Text weight="semibold" size={400}>AI Analysis</Text>
          {status !== 'idle' && (
            <Badge
              appearance="filled"
              size="small"
              color={
                status === 'running' ? 'warning' :
                status === 'completed' ? 'success' :
                status === 'failed' ? 'danger' :
                'important'
              }
            >
              {status === 'running' ? `Running ${elapsed}s` : status === 'completed' ? 'Complete' : status === 'failed' ? 'Failed' : 'Stopped'}
            </Badge>
          )}
          {ws.connected && isRunning && (
            <Tooltip content="WebSocket connected — streaming live" relationship="description">
              <Badge appearance="filled" color="success" size="small" shape="circular" />
            </Tooltip>
          )}
        </div>
        <div className={styles.controls}>
          {!isRunning && !isFinished && (
            <Button
              appearance="primary"
              icon={starting ? undefined : <PlayRegular />}
              onClick={handleRun}
              disabled={starting}
              size={compact ? 'small' : 'medium'}
            >
              {starting ? <Spinner size="tiny" /> : solutionPaths?.length
                ? `Run Analysis for ${solutionPaths.length} solution${solutionPaths.length === 1 ? '' : 's'}`
                : 'Run Analysis for all solutions'}
            </Button>
          )}
          {status === 'running' && (
            <Button appearance="secondary" icon={<StopRegular />} onClick={handleStop} size={compact ? 'small' : 'medium'}>
              Stop
            </Button>
          )}
          {isFinished && consoleEvents.some((e) => e.data.eventType === 'text') && (
            <Button appearance="secondary" icon={<ArrowDownloadRegular />} onClick={downloadAnalysis} size={compact ? 'small' : 'medium'}>
              Download
            </Button>
          )}
          {isFinished && (
            <Button appearance="secondary" icon={<DeleteRegular />} onClick={handleClear} size={compact ? 'small' : 'medium'}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Output */}
      {(consoleEvents.length > 0 || isRunning) && (
        <div className={styles.outputArea} ref={outputRef} style={{ minHeight: outputHeight, maxHeight }}>
          {consoleEvents.map((event, i) => (
            <EventLine key={i} event={event} />
          ))}
          {isRunning && <ProcessingIndicator hasEvents={consoleEvents.length > 0} elapsed={elapsed} toolCount={toolCount} />}
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <Card className={styles.metricsCard}>
          <Text weight="semibold" size={compact ? 300 : 400}>Session Metrics</Text>
          <div className={styles.metricsGrid}>
            <div className={styles.metricStat}>
              <div className={styles.metricValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: compact ? '20px' : '24px' }}>
                <ClockRegular style={{ fontSize: compact ? '16px' : '20px' }} />
                {(metrics.durationMs / 1000).toFixed(1)}s
              </div>
              <Text size={200}>Duration</Text>
            </div>
            <div className={styles.metricStat}>
              <div className={styles.metricValue} style={{ fontSize: compact ? '20px' : '24px' }}>
                {formatTokens(metrics.totalTokens)}
              </div>
              <Text size={200}>Tokens</Text>
            </div>
            <div className={styles.metricStat}>
              <div className={styles.metricValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: compact ? '20px' : '24px' }}>
                <MoneyRegular style={{ fontSize: compact ? '16px' : '20px' }} />
                ${metrics.costUSD.toFixed(3)}
              </div>
              <Text size={200}>Cost</Text>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
