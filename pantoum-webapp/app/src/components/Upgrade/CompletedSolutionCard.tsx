import React, { useEffect, useRef } from 'react';
import { makeStyles, tokens, Text, Badge, Button } from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
  DocumentTextRegular,
  BotSparkleRegular,
} from '@fluentui/react-icons';
import type { SolutionState } from '../../stores/upgradeStore';
import { SolutionStatsRibbon } from './SolutionStatsRibbon';
import { PipelineExecutionView } from './PipelineExecutionView';

interface CompletedSolutionCardProps {
  solution: SolutionState;
  onViewReport?: (reportPath: string) => void;
  onAnalyze?: (solutionPath: string, reportPath?: string) => void;
  getAnalyzeHref?: (solutionPath: string, reportPath?: string) => string;
  getReportHref?: (reportPath: string) => string;
  disableAnimations?: boolean;
}

const useStyles = makeStyles({
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  cardSuccess: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder1}`,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  cardFailed: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeft: `3px solid ${tokens.colorPaletteRedBorder1}`,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  cardEnterSuccess: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder1}`,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    animationName: {
      from: { opacity: 0, transform: 'translateY(-20px) scale(0.97)' },
      to: { opacity: 1, transform: 'translateY(0) scale(1)' },
    },
    animationDuration: '450ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
  },
  cardEnterFailed: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeft: `3px solid ${tokens.colorPaletteRedBorder1}`,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    animationName: {
      from: { opacity: 0, transform: 'translateY(-20px) scale(0.97)' },
      to: { opacity: 1, transform: 'translateY(0) scale(1)' },
    },
    animationDuration: '450ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
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
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
});

function getBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export const CompletedSolutionCard: React.FC<CompletedSolutionCardProps> = React.memo(({
  solution,
  onViewReport,
  onAnalyze,
  getAnalyzeHref,
  getReportHref,
  disableAnimations,
}) => {
  const styles = useStyles();
  const justMountedRef = useRef(true);

  const isSuccess = solution.status === 'completed';
  const duration = (solution.completedAt && solution.startedAt)
    ? solution.completedAt - solution.startedAt
    : 0;

  const reportPath = solution.completionData?.reportPath;

  // Animated enter on first mount, static afterwards
  const cardClass = (() => {
    if (disableAnimations) {
      return isSuccess ? styles.cardSuccess : styles.cardFailed;
    }
    if (justMountedRef.current) {
      return isSuccess ? styles.cardEnterSuccess : styles.cardEnterFailed;
    }
    return isSuccess ? styles.cardSuccess : styles.cardFailed;
  })();

  // Clear just-mounted flag after first render
  useEffect(() => {
    justMountedRef.current = false;
  }, []);

  const hasPipelinePhases = Object.keys(solution.pipelinePhases).length > 0;

  return (
    <div className={cardClass}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {isSuccess ? (
            <CheckmarkCircleRegular style={{ fontSize: '16px', color: tokens.colorPaletteGreenForeground1 }} />
          ) : (
            <DismissCircleRegular style={{ fontSize: '16px', color: tokens.colorPaletteRedForeground1 }} />
          )}
          <Text className={styles.solutionName}>{getBaseName(solution.solutionPath)}</Text>
          <Badge appearance="filled" color={isSuccess ? 'success' : 'danger'} size="small">
            {isSuccess ? 'Success' : 'Failed'}
          </Badge>
          {duration > 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {formatDuration(duration)}
            </Text>
          )}
        </div>
        <div className={styles.headerActions}>
          {(onAnalyze || getAnalyzeHref) && (
            <Button
              as="a"
              appearance="subtle"
              size="small"
              icon={<BotSparkleRegular />}
              href={getAnalyzeHref?.(solution.solutionPath, reportPath)}
              target="_blank"
              onClick={(e: React.MouseEvent) => {
                if (!getAnalyzeHref && onAnalyze) {
                  e.preventDefault();
                  onAnalyze(solution.solutionPath, reportPath);
                }
              }}
            >
              Analyze
            </Button>
          )}
          {reportPath && (onViewReport || getReportHref) && (
            <Button
              as="a"
              appearance="subtle"
              size="small"
              icon={<DocumentTextRegular />}
              href={getReportHref?.(reportPath)}
              target="_blank"
              onClick={(e: React.MouseEvent) => {
                if (!getReportHref && onViewReport) {
                  e.preventDefault();
                  onViewReport(reportPath);
                }
              }}
            >
              Report
            </Button>
          )}
        </div>
      </div>

      {hasPipelinePhases && (
        <PipelineExecutionView
          pipelinePhases={solution.pipelinePhases}
          compact
          disableAnimations={disableAnimations}
        />
      )}

      {!hasPipelinePhases && (
        <SolutionStatsRibbon
          logs={solution.logs}
          aiMetrics={solution.aiMetrics}
          isRunning={false}
          startedAt={solution.startedAt}
        />
      )}
    </div>
  );
});

CompletedSolutionCard.displayName = 'CompletedSolutionCard';
