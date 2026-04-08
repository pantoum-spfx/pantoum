import React, { useEffect, useRef, useMemo } from 'react';
import { makeStyles, tokens, Text, Badge, Button, Spinner } from '@fluentui/react-components';
import { StopRegular, BotSparkleRegular } from '@fluentui/react-icons';
import type { SolutionState } from '../../stores/upgradeStore';
import { SolutionStatsRibbon } from './SolutionStatsRibbon';
import { PipelineExecutionView } from './PipelineExecutionView';

interface ActiveSolutionPanelProps {
  solution: SolutionState;
  onAbort: (solutionPath: string) => void;
  exiting?: boolean;
  disableAnimations?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  queued: 'Queued',
  initializing: 'Initializing...',
  upgrading: 'Upgrading',
  'running-m365-cli': 'Running M365 CLI',
  'generating-patches': 'Generating patches',
  'applying-patches': 'Applying patches',
  building: 'Building & testing',
  'updating-dependencies': 'Updating dependencies',
  fixing: 'AI Fixing',
  complete: 'Complete',
};

const VISIBLE_LOG_LIMIT = 200;

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    minHeight: '200px',
  },
  panelEnter: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    minHeight: '200px',
    animationName: {
      from: { opacity: 0, transform: 'translateY(-12px) scale(0.95)' },
      to: { opacity: 1, transform: 'translateY(0) scale(1)' },
    },
    animationDuration: '400ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
  },
  panelExit: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    minHeight: '200px',
    animationName: {
      from: { opacity: 1, transform: 'translateY(0) scale(1)' },
      to: { opacity: 0, transform: 'translateY(12px) scale(0.95)' },
    },
    animationDuration: '300ms',
    animationTimingFunction: 'ease-in',
    animationFillMode: 'forwards',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
  },
  solutionName: {
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '13px',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  aiIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    color: tokens.colorPalettePurpleForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  logArea: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '12px',
    lineHeight: '18px',
    padding: '8px 12px',
    overflowY: 'auto',
    overflowX: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    color: '#d4d4d4',
    minHeight: '100px',
    maxHeight: '250px',
  },
  logError: { color: '#f44747' },
  logWarn: { color: '#cca700' },
  logInfo: { color: '#d4d4d4' },
  truncatedIndicator: {
    color: '#858585',
    fontStyle: 'italic',
    paddingBottom: '4px',
  },
});

function getBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `+${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `+${minutes}m${String(secs).padStart(2, '0')}s`;
}

export const ActiveSolutionPanel: React.FC<ActiveSolutionPanelProps> = React.memo(({
  solution,
  onAbort,
  exiting,
  disableAnimations,
}) => {
  const styles = useStyles();
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [solution.logs.length]);

  const phaseLabel = PHASE_LABELS[solution.phase] || solution.phase;
  const isActive = solution.status === 'active';

  // Window logs to last VISIBLE_LOG_LIMIT entries
  const { visibleLogs, truncatedCount } = useMemo(() => {
    const total = solution.logs.length;
    if (total > VISIBLE_LOG_LIMIT) {
      return {
        visibleLogs: solution.logs.slice(-VISIBLE_LOG_LIMIT),
        truncatedCount: total - VISIBLE_LOG_LIMIT,
      };
    }
    return { visibleLogs: solution.logs, truncatedCount: 0 };
  }, [solution.logs]);

  // Compute base time for elapsed timestamps
  const baseTime = useMemo(() => {
    if (solution.startedAt) return solution.startedAt;
    if (solution.logs.length > 0) return new Date(solution.logs[0].timestamp).getTime();
    return Date.now();
  }, [solution.startedAt, solution.logs.length > 0 ? solution.logs[0].timestamp : null]);

  const panelClass = disableAnimations
    ? styles.panel
    : exiting
      ? styles.panelExit
      : styles.panelEnter;

  return (
    <div className={panelClass}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {isActive && <Spinner size="tiny" />}
          <Text className={styles.solutionName}>{getBaseName(solution.solutionPath)}</Text>
          <Badge appearance="filled" color="warning" size="small">{phaseLabel}</Badge>
        </div>
        {isActive && (
          <Button
            appearance="subtle"
            size="small"
            icon={<StopRegular />}
            onClick={() => onAbort(solution.solutionPath)}
          >
            Abort
          </Button>
        )}
      </div>

      <SolutionStatsRibbon
        logs={solution.logs}
        aiMetrics={solution.aiMetrics}
        isRunning={isActive}
        startedAt={solution.startedAt}
      />

      <PipelineExecutionView
        pipelinePhases={solution.pipelinePhases}
        currentPhase={solution.phase}
        disableAnimations={disableAnimations}
      />

      {solution.aiAction && (
        <div className={styles.aiIndicator}>
          <BotSparkleRegular style={{ fontSize: '14px' }} />
          <Text size={200}>{solution.aiAction.data.description}</Text>
          {solution.aiAction.data.action !== 'complete' && <Spinner size="tiny" />}
        </div>
      )}

      <div className={styles.logArea} ref={logRef}>
        {solution.logs.length === 0 ? (
          <span style={{ color: '#858585' }}>Waiting for logs...</span>
        ) : (
          <>
            {truncatedCount > 0 && (
              <div className={styles.truncatedIndicator}>
                ... {truncatedCount} earlier lines hidden
              </div>
            )}
            {visibleLogs.map((log, i) => {
              const levelClass =
                log.data.level === 'error' ? styles.logError :
                log.data.level === 'warn' ? styles.logWarn :
                styles.logInfo;
              const elapsed = new Date(log.timestamp).getTime() - baseTime;
              const elapsedStr = formatElapsed(Math.max(0, elapsed));
              const levelTag = `[${log.data.level.toUpperCase().padEnd(5)}]`;
              return (
                <div key={i} className={levelClass}>
                  <span style={{ color: '#858585' }}>{elapsedStr.padStart(7)}</span> <span>{levelTag}</span> {log.data.message}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
});

ActiveSolutionPanel.displayName = 'ActiveSolutionPanel';
