import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Card,
  Badge,
  Divider,
  Dropdown,
  Option,
  Spinner,
  MessageBar,
  MessageBarBody,
  Tooltip,
} from '@fluentui/react-components';
import {
  PlayRegular,
  StopRegular,
  BotSparkleRegular,
  ClockRegular,
  MoneyRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useUpgradeStore } from '../stores/upgradeStore';
import { useHistoryStore } from '../stores/historyStore';
import { AiAnalyzePanel } from '../components/AiAnalyzePanel';
import { EventLine, ProcessingIndicator } from '../components/AiAnalyzePanel/EventLine';
import type { AiConsoleSkill } from '@shared/types/AiConsole';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'end',
    flexWrap: 'wrap',
  },
  controlGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  controlLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'end',
  },
  outputArea: {
    backgroundColor: '#1e1e1e',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '13px',
    lineHeight: '20px',
    minHeight: '400px',
    maxHeight: '65vh',
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
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: '12px',
    color: tokens.colorNeutralForeground3,
  },
});

const SKILL_OPTIONS: { id: AiConsoleSkill; label: string; description: string }[] = [
  { id: 'doctor', label: 'Doctor', description: 'Check system requirements and health' },
  { id: 'analyze', label: 'Analyze', description: 'Analyze SPFx solutions for upgrade readiness' },
];

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export const AiConsolePage: React.FC = () => {
  const styles = useStyles();
  const outputRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  // Read initial skill from URL params (e.g. /ai-console?skill=analyze)
  const initialSkill = (searchParams.get('skill') as AiConsoleSkill) || 'doctor';
  const validSkill = SKILL_OPTIONS.some((s) => s.id === initialSkill) ? initialSkill : 'doctor';

  // Per-solution context from URL params (e.g. /ai-console?skill=analyze&solution=...&report=...)
  const solutionParam = searchParams.get('solution');
  const reportParam = searchParams.get('report');

  // Form state
  const [skill, setSkill] = useState<AiConsoleSkill>(validSkill);

  // Upgrade context from shared store
  const { rootPath, upgradeSolutions, selected, batchCompletionData } = useUpgradeStore();

  // History re-entry context
  // Snapshot the active entries on mount so React StrictMode's unmount/remount cycle
  // doesn't lose them (the cleanup sets them to [], which would be re-read on remount)
  const { activeEntries: historyEntriesLive, setActiveEntries } = useHistoryStore();
  const historyEntriesRef = useRef(historyEntriesLive);
  if (historyEntriesLive.length > 0 && historyEntriesRef.current.length === 0) {
    historyEntriesRef.current = historyEntriesLive;
  }
  const historyEntries = historyEntriesRef.current;

  // Determine context source for the info bar
  // History entries take priority when the user explicitly clicked "Analyze" from history
  const contextSource = useMemo(() => {
    if (solutionParam) return 'upgrade' as const;
    if (historyEntries.length > 0) return 'history' as const;
    const hasUpgradeContext = upgradeSolutions.length > 0 || selected.length > 0 || batchCompletionData?.reportPath || rootPath;
    if (hasUpgradeContext) return 'upgrade' as const;
    return null;
  }, [upgradeSolutions, selected, batchCompletionData, rootPath, historyEntries, solutionParam]);

  const analyzeContext = useMemo(() => {
    // Priority 0: Per-solution context from URL params (clicked "Analyze" on a completed card)
    if (solutionParam) {
      return {
        solutionPaths: [solutionParam],
        reportPath: reportParam || undefined,
        rootPath: rootPath || undefined,
      };
    }
    // Priority 1: History entries (user clicked "Analyze" from history page)
    if (historyEntries.length > 0) {
      return {
        solutionPaths: historyEntries.flatMap((e) => e.solutions.map((s) => s.path)),
        reportPath: historyEntries.length === 1 ? historyEntries[0].reportPath : undefined,
        rootPath: historyEntries[0].rootPath,
      };
    }
    // Priority 2: Active upgrade session
    const solutionPaths = upgradeSolutions.length > 0 ? upgradeSolutions : (selected.length > 0 ? selected : undefined);
    const reportPath = batchCompletionData?.reportPath;
    if (solutionPaths || reportPath || rootPath) {
      return {
        solutionPaths,
        reportPath,
        rootPath: rootPath || undefined,
      };
    }
    return undefined;
  }, [upgradeSolutions, selected, batchCompletionData, rootPath, historyEntries, solutionParam, reportParam]);

  // Clear active history entries on unmount (navigating away from AI Console)
  useEffect(() => {
    return () => { setActiveEntries([]); };
  }, [setActiveEntries]);

  // Doctor skill: inline session state
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

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [consoleEvents]);

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
      const res = await fetch('/api/ai-console/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill }),
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
      console.error('Failed to start AI Console:', err);
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

  const statusBadge = useMemo(() => {
    switch (status) {
      case 'idle': return { color: 'informative' as const, label: 'Ready' };
      case 'running': return { color: 'warning' as const, label: `Running ${elapsed}s` };
      case 'completed': return { color: 'success' as const, label: 'Complete' };
      case 'failed': return { color: 'danger' as const, label: 'Failed' };
      case 'stopped': return { color: 'important' as const, label: 'Stopped' };
      default: return { color: 'informative' as const, label: status };
    }
  }, [status, elapsed]);

  // For the analyze skill, delegate to AiAnalyzePanel
  const showAnalyzePanel = skill === 'analyze';

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BotSparkleRegular style={{ fontSize: '24px', color: tokens.colorPalettePurpleForeground2 }} />
          <Text as="h1" size={700} weight="bold">AI Console</Text>
          {!showAnalyzePanel && (
            <>
              <Badge appearance="filled" color={statusBadge.color} size="small">
                {statusBadge.label}
              </Badge>
              {ws.connected && isRunning && (
                <Tooltip content="WebSocket connected — streaming live" relationship="description">
                  <Badge appearance="filled" color="success" size="small" shape="circular" />
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
        Run Claude Code skills interactively with real-time streaming output
      </Text>

      {/* Skill selector */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Skill</span>
          <Dropdown
            value={SKILL_OPTIONS.find((s) => s.id === skill)?.label || skill}
            selectedOptions={[skill]}
            onOptionSelect={(_, data) => {
              setSkill(data.optionValue as AiConsoleSkill);
              // Reset doctor session when switching
              if (data.optionValue !== 'doctor') {
                handleClear();
              }
            }}
            disabled={isRunning}
            style={{ minWidth: '180px' }}
          >
            {SKILL_OPTIONS.map((s) => (
              <Option key={s.id} value={s.id} text={s.label}>
                <div>
                  <Text weight="semibold">{s.label}</Text>
                  <br />
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {s.description}
                  </Text>
                </div>
              </Option>
            ))}
          </Dropdown>
        </div>

        {/* Doctor controls (analyze controls are in AiAnalyzePanel) */}
        {!showAnalyzePanel && (
          <div className={styles.actions}>
            {!isRunning && (
              <Button
                appearance="primary"
                icon={starting ? undefined : <PlayRegular />}
                onClick={handleRun}
                disabled={starting}
              >
                {starting ? <Spinner size="tiny" /> : 'Run'}
              </Button>
            )}
            {status === 'running' && (
              <Button appearance="secondary" icon={<StopRegular />} onClick={handleStop}>
                Stop
              </Button>
            )}
            {isFinished && (
              <Button appearance="secondary" icon={<DeleteRegular />} onClick={handleClear}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Analyze skill: delegate to AiAnalyzePanel */}
      {showAnalyzePanel && (
        <>
          {contextSource === 'upgrade' && analyzeContext ? (
            <MessageBar intent="info">
              <MessageBarBody>
                {(() => {
                  const paths = analyzeContext.solutionPaths || [];
                  const names = paths.map((p) => p.split('/').pop() || p);
                  if (names.length === 0) return 'Context from upgrade session';
                  return `Context from upgrade session: ${names.join(', ')}`;
                })()}
              </MessageBarBody>
            </MessageBar>
          ) : contextSource === 'history' && historyEntries.length > 0 ? (
            <Card style={{ padding: '12px 16px' }}>
              <Text weight="semibold" size={300} style={{ marginBottom: '8px', display: 'block' }}>
                {historyEntries.length === 1
                  ? `Context from history: ${historyEntries[0].runId.split('_').slice(2).join(' ')}`
                  : `Context from history (${historyEntries.length} runs, ${historyEntries.reduce((sum, e) => sum + e.solutions.length, 0)} solutions)`}
              </Text>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {historyEntries.map((entry) => (
                  <div key={entry.runId} style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
                    {historyEntries.length > 1 && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3, minWidth: '100px' }}>
                        {entry.runId.split('_').slice(2).join(' ')}:
                      </Text>
                    )}
                    <Text size={200}>
                      {entry.solutions.map((s) => s.name).join(', ')}
                    </Text>
                    <Badge size="small" appearance="outline" color="informative">
                      v{entry.targetVersion}
                    </Badge>
                    <Badge
                      size="small"
                      color={entry.status === 'success' ? 'success' : entry.status === 'partial' ? 'warning' : 'danger'}
                    >
                      {entry.status}
                    </Badge>
                    {historyEntries.length === 1 && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {Math.floor(entry.durationMs / 60000)}m {Math.floor((entry.durationMs % 60000) / 1000)}s
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <MessageBar intent="warning">
              <MessageBarBody>
                No upgrade context available. Run an upgrade first, or the analysis will search the current directory.
              </MessageBarBody>
            </MessageBar>
          )}
          <AiAnalyzePanel
            solutionPaths={analyzeContext?.solutionPaths}
            reportPath={analyzeContext?.reportPath}
            rootPath={analyzeContext?.rootPath}
          />
        </>
      )}

      {/* Doctor skill: inline output */}
      {!showAnalyzePanel && (
        <>
          {consoleEvents.length === 0 && !isRunning ? (
            <div className={styles.emptyState}>
              <BotSparkleRegular style={{ fontSize: '48px' }} />
              <Text size={400}>Select a skill and click Run to start</Text>
              <Text size={200}>
                Available skills: /pantoum-doctor, /pantoum-analyze
              </Text>
            </div>
          ) : (
            <>
              <Text weight="semibold" size={400}>Output</Text>
              <div className={styles.outputArea} ref={outputRef}>
                {consoleEvents.map((event, i) => (
                  <EventLine key={i} event={event} />
                ))}
                {isRunning && <ProcessingIndicator hasEvents={consoleEvents.length > 0} elapsed={elapsed} toolCount={toolCount} />}
              </div>
            </>
          )}

          {metrics && (
            <Card className={styles.metricsCard}>
              <Text weight="semibold" size={400}>Session Metrics</Text>
              <div className={styles.metricsGrid}>
                <div className={styles.metricStat}>
                  <div className={styles.metricValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <ClockRegular style={{ fontSize: '20px' }} />
                    {(metrics.durationMs / 1000).toFixed(1)}s
                  </div>
                  <Text size={200}>Duration</Text>
                </div>
                <div className={styles.metricStat}>
                  <div className={styles.metricValue}>
                    {formatTokens(metrics.totalTokens)}
                  </div>
                  <Text size={200}>Tokens</Text>
                </div>
                <div className={styles.metricStat}>
                  <div className={styles.metricValue} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <MoneyRegular style={{ fontSize: '20px' }} />
                    ${metrics.costUSD.toFixed(3)}
                  </div>
                  <Text size={200}>Cost</Text>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
