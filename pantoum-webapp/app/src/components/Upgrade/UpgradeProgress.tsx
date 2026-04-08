import React, { useMemo, useRef, useState, useEffect } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { useUpgradeStore, type SolutionState } from '../../stores/upgradeStore';
import { TotalStatsBar } from './TotalStatsBar';
import { ActiveSolutionPanel } from './ActiveSolutionPanel';
import { UpgradeQueue } from './UpgradeQueue';
import { CompletedSolutionCard } from './CompletedSolutionCard';
import { SquirrelAnimation } from '../SquirrelAnimation/SquirrelAnimation';
import { useSettingsStore } from '../../stores/settingsStore';

interface UpgradeProgressProps {
  startTime: number | null;
  onAbortSolution: (solutionPath: string) => void;
  onViewReport?: (reportPath: string) => void;
  onAnalyze?: (solutionPath: string, reportPath?: string) => void;
  getAnalyzeHref?: (solutionPath: string, reportPath?: string) => string;
  getReportHref?: (reportPath: string) => string;
}

const ACTIVE_EXIT_DURATION = 300;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
    gap: '12px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
});

interface ActivePanelEntry {
  solution: SolutionState;
  exiting: boolean;
}

export const UpgradeProgress: React.FC<UpgradeProgressProps> = ({
  startTime,
  onAbortSolution,
  onViewReport,
  onAnalyze,
  getAnalyzeHref,
  getReportHref,
}) => {
  const styles = useStyles();
  const disableAnimations = useSettingsStore((s) => s.settings.disable_animations);

  const solutions = useUpgradeStore((s) => s.solutions);
  const queue = useUpgradeStore((s) => s.queue);
  const batchStatus = useUpgradeStore((s) => s.batchStatus);
  const getAggregatedMetrics = useUpgradeStore((s) => s.getAggregatedMetrics);

  const isRunning = batchStatus === 'running' || batchStatus === 'starting';

  // Partition solutions
  const { activeSolutions, completedSolutions } = useMemo(() => {
    const active: SolutionState[] = [];
    const completed: SolutionState[] = [];

    for (const sol of solutions.values()) {
      if (sol.status === 'active') {
        active.push(sol);
      } else if (sol.status === 'completed' || sol.status === 'failed' || sol.status === 'aborted') {
        completed.push(sol);
      }
    }

    // Sort completed by completedAt
    completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    return { activeSolutions: active, completedSolutions: completed };
  }, [solutions]);

  // --- Exit tracking for active panels ---
  const prevActivePathsRef = useRef<Set<string>>(new Set(activeSolutions.map((s) => s.solutionPath)));
  const [exitingPanels, setExitingPanels] = useState<Map<string, SolutionState>>(new Map());

  useEffect(() => {
    const currentPaths = new Set(activeSolutions.map((s) => s.solutionPath));
    const prevPaths = prevActivePathsRef.current;

    // Detect solutions that left the active set
    const removed: SolutionState[] = [];
    for (const path of prevPaths) {
      if (!currentPaths.has(path)) {
        const sol = solutions.get(path);
        if (sol) removed.push(sol);
      }
    }

    prevActivePathsRef.current = currentPaths;

    if (removed.length > 0 && !disableAnimations) {
      setExitingPanels((prev) => {
        const next = new Map(prev);
        for (const sol of removed) next.set(sol.solutionPath, sol);
        return next;
      });

      const timer = setTimeout(() => {
        setExitingPanels((prev) => {
          const next = new Map(prev);
          for (const sol of removed) next.delete(sol.solutionPath);
          return next;
        });
      }, ACTIVE_EXIT_DURATION);

      return () => clearTimeout(timer);
    }
  }, [activeSolutions, solutions, disableAnimations]);

  // Merge active + exiting panels for rendering
  const activePanelEntries: ActivePanelEntry[] = useMemo(() => {
    const entries: ActivePanelEntry[] = activeSolutions.map((solution) => ({
      solution,
      exiting: false,
    }));
    for (const [, solution] of exitingPanels) {
      entries.push({ solution, exiting: true });
    }
    return entries;
  }, [activeSolutions, exitingPanels]);

  const metrics = getAggregatedMetrics();

  return (
    <div className={styles.root}>
      {/* Total stats bar */}
      <TotalStatsBar
        metrics={metrics}
        queue={queue}
        totalSolutions={solutions.size}
        isRunning={isRunning}
        startTime={startTime}
      />

      {/* Queue */}
      <UpgradeQueue queued={queue.queued} disableAnimations={disableAnimations} onRemove={onAbortSolution} />

      {/* Active solution panels */}
      {activePanelEntries.length > 0 && (
        <div className={styles.activeGrid}>
          {activePanelEntries.map((entry) => (
            <ActiveSolutionPanel
              key={entry.solution.solutionPath}
              solution={entry.solution}
              onAbort={onAbortSolution}
              exiting={entry.exiting}
              disableAnimations={disableAnimations}
            />
          ))}
        </div>
      )}

      {/* Completed solutions */}
      {completedSolutions.length > 0 && (
        <div className={styles.section}>
          {completedSolutions.map((sol) => (
            <CompletedSolutionCard
              key={sol.solutionPath}
              solution={sol}
              onViewReport={onViewReport}
              onAnalyze={onAnalyze}
              getAnalyzeHref={getAnalyzeHref}
              getReportHref={getReportHref}
              disableAnimations={disableAnimations}
            />
          ))}
        </div>
      )}

      {/* Squirrel animation — at the bottom as decoration */}
      {isRunning && !disableAnimations && (
        <SquirrelAnimation isActive={isRunning} />
      )}
    </div>
  );
};
