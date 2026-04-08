import React, { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronUpRegular,
} from '@fluentui/react-icons';
import type { PipelinePhaseDetail } from '@shared/types/WebSocketProtocol';
import { PIPELINE_PHASES } from '@shared/types/ManualConfig';

interface PipelineExecutionViewProps {
  pipelinePhases: Record<number, PipelinePhaseDetail>;
  currentPhase?: string;
  compact?: boolean;
  disableAnimations?: boolean;
}

type PhaseStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

const STATUS_ICONS: Record<PhaseStatus, string> = {
  pending: '\u2500',   // ─
  running: '\u23F3',   // hourglass
  success: '\u2705',   // checkmark
  failed: '\u274C',    // cross
  skipped: '\u2298',   // circled dash
};

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
  },
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '3px',
    padding: '6px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  node: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: '128px',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color, box-shadow, opacity',
    transitionDuration: '400ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  nodeRunning: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    minWidth: '128px',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color, box-shadow, opacity',
    transitionDuration: '400ms',
    transitionTimingFunction: 'ease',
    animationName: {
      '0%, 100%': { boxShadow: '0 0 0 0px rgba(0, 120, 212, 0.0)' },
      '50%': { boxShadow: '0 0 6px 1px rgba(0, 120, 212, 0.35)' },
    },
    animationDuration: '2s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  nodeSuccess: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: '128px',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color, box-shadow, opacity',
    transitionDuration: '400ms',
    transitionTimingFunction: 'ease',
    animationName: {
      '0%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)', backgroundColor: 'rgba(16, 185, 129, 0.15)' },
      '40%': { boxShadow: '0 0 12px 4px rgba(16, 185, 129, 0.6)', backgroundColor: 'rgba(16, 185, 129, 0.15)' },
      '100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
    },
    animationDuration: '800ms',
    animationTimingFunction: 'ease-out',
    animationIterationCount: '1',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  nodeFailed: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: '128px',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color, box-shadow, opacity',
    transitionDuration: '400ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  nodeSkipped: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    padding: '4px 8px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: '128px',
    cursor: 'pointer',
    opacity: 0.6,
    transitionProperty: 'border-color, background-color, box-shadow, opacity',
    transitionDuration: '400ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      opacity: 1,
    },
  },
  nodeNoTransition: {
    transitionProperty: 'none',
    animationName: 'none',
  },
  nodeIcon: {
    display: 'inline-flex',
    justifyContent: 'center',
    width: '20px',
    flexShrink: 0,
  },
  nodeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap',
  },
  nodeSummary: {
    display: 'none',
  },
  arrow: {
    color: tokens.colorNeutralForeground4,
    fontSize: '12px',
    flexShrink: 0,
  },
  detailBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    animationName: {
      from: { opacity: 0, maxHeight: '0px' },
      to: { opacity: 1, maxHeight: '200px' },
    },
    animationDuration: '200ms',
    animationTimingFunction: 'ease-out',
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
});

/** Map current log phase to pipeline phase number */
function currentPhaseToNumber(phase: string): number {
  const mapping: Record<string, number> = {
    'running-m365-cli': 1,
    'generating-patches': 2,
    'applying-patches': 2,
    'building': 5,
    'updating-dependencies': 6,
  };
  return mapping[phase] || 0;
}

function getPhaseStatus(
  phaseNum: number,
  detail: PipelinePhaseDetail | undefined,
  activePhaseNum: number,
): PhaseStatus {
  if (!detail) {
    if (activePhaseNum >= phaseNum) return 'running';
    return 'pending';
  }

  // Phase-specific completion checks
  // When activePhaseNum has moved past this phase but no explicit result
  // arrived yet, infer success (the pipeline wouldn't advance if it failed).
  switch (phaseNum) {
    case 1:
      if (detail.m365CliSuccess === true) return 'success';
      if (detail.m365CliSuccess === false) return 'failed';
      if (activePhaseNum > 1) return 'success';
      return activePhaseNum === 1 ? 'running' : 'pending';
    case 2:
      if (detail.fnPatchCount !== undefined) return 'success';
      if (activePhaseNum > 2) return 'success';
      return activePhaseNum === 2 ? 'running' : 'pending';
    case 3:
      if (detail.templatesRendered !== undefined) return 'success';
      if (activePhaseNum > 3) return 'success';
      return activePhaseNum === 3 ? 'running' : 'pending';
    case 4:
      if (detail.manualStepsRan !== undefined) return 'success';
      if (activePhaseNum > 4) return 'success';
      return activePhaseNum === 4 ? 'running' : 'pending';
    case 5:
      if (detail.buildSuccess === true) return 'success';
      if (detail.buildSuccess === false) return 'failed';
      if (activePhaseNum > 5) return 'success';
      return activePhaseNum === 5 ? 'running' : 'pending';
    case 6:
      if (detail.thirdPartyTemplateUsed !== undefined) return 'success';
      if (detail.packagesUpdated === 0 && detail.thirdPartyTemplateUsed === false) return 'skipped';
      if (activePhaseNum > 6) return 'success';
      return activePhaseNum === 6 ? 'running' : 'pending';
    case 7:
      if (detail.checksRun !== undefined) {
        return detail.checksPassed === detail.checksRun ? 'success' : 'failed';
      }
      if (activePhaseNum > 7) return 'success';
      return activePhaseNum === 7 ? 'running' : 'pending';
    default:
      return 'pending';
  }
}

function getNodeClass(
  styles: ReturnType<typeof useStyles>,
  status: PhaseStatus,
  disableAnimations?: boolean,
): string {
  const base = (() => {
    switch (status) {
      case 'running': return styles.nodeRunning;
      case 'success': return styles.nodeSuccess;
      case 'failed': return styles.nodeFailed;
      case 'skipped': return styles.nodeSkipped;
      default: return styles.node;
    }
  })();
  return disableAnimations ? `${base} ${styles.nodeNoTransition}` : base;
}

function getPhaseSummary(phaseNum: number, detail: PipelinePhaseDetail | undefined): string {
  if (!detail) return '';

  switch (phaseNum) {
    case 1:
      if (detail.m365ErrorTemplateUsed) return 'AI fixed';
      return detail.m365CliSuccess ? 'OK' : '';
    case 2: {
      const parts: string[] = [];
      if (detail.fnPatchCount) parts.push(`${detail.fnPatchCount} FN`);
      if (detail.deterministicPatches?.length) {
        parts.push(detail.deterministicPatches.join(', '));
      }
      return parts.join(' + ');
    }
    case 3: {
      const triggered = detail.aiContextsTriggered?.length ?? 0;
      const skipped = detail.aiContextsSkipped?.length ?? 0;
      if (triggered + skipped === 0 && detail.templatesRendered) {
        return detail.templatesRendered.length > 0
          ? `${detail.templatesRendered.length} templates`
          : 'none';
      }
      return `${triggered}/${triggered + skipped} AI ctx`;
    }
    case 4: {
      const ran = detail.manualStepsRan ?? 0;
      const skipped = detail.manualStepsSkipped ?? 0;
      if (ran + skipped === 0) return 'none';
      return `${ran} steps`;
    }
    case 5: {
      if (detail.buildSuccess) return 'OK';
      if (detail.buildFixAttempts) return `${detail.buildFixAttempts} fixes`;
      return '';
    }
    case 6: {
      if (detail.packagesUpdated) return `${detail.packagesUpdated} pkgs`;
      return 'skipped';
    }
    case 7: {
      if (detail.checksRun !== undefined) {
        return `${detail.checksPassed}/${detail.checksRun}`;
      }
      return '';
    }
    default:
      return '';
  }
}

function renderPhaseDetail(phaseNum: number, detail: PipelinePhaseDetail | undefined): React.ReactNode {
  if (!detail) return <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No data yet</Text>;

  const rows: React.ReactNode[] = [];

  switch (phaseNum) {
    case 1:
      rows.push(
        <Text key="cli" size={200}>
          M365 CLI: {detail.m365CliSuccess ? 'Success' : 'Failed'}
          {detail.m365ErrorTemplateUsed && ' (AI error fix applied)'}
        </Text>
      );
      break;

    case 2:
      if (detail.fnPatchCount !== undefined) {
        rows.push(<Text key="fn" size={200}>{detail.fnPatchCount} FN patches from CLI report</Text>);
      }
      if (detail.deterministicPatches?.length) {
        rows.push(
          <Text key="det" size={200}>
            Deterministic: {detail.deterministicPatches.join(', ')}
          </Text>
        );
      }
      break;

    case 3:
      if (detail.aiContextsTriggered?.length) {
        for (const ctx of detail.aiContextsTriggered) {
          rows.push(
            <Text key={`t-${ctx.key}`} size={200}>
              {STATUS_ICONS.success} {ctx.key} ({ctx.template})
            </Text>
          );
        }
      }
      if (detail.aiContextsSkipped?.length) {
        for (const ctx of detail.aiContextsSkipped) {
          rows.push(
            <Text key={`s-${ctx.key}`} size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {STATUS_ICONS.skipped} {ctx.key}: {ctx.reason}
            </Text>
          );
        }
      }
      if (detail.templatesRendered?.length) {
        rows.push(
          <Text key="tpl" size={200}>
            Templates: {detail.templatesRendered.join(', ')}
          </Text>
        );
      }
      break;

    case 4:
      rows.push(
        <Text key="steps" size={200}>
          {detail.manualStepsRan ?? 0} step(s) ran, {detail.manualStepsSkipped ?? 0} skipped
        </Text>
      );
      break;

    case 5:
      rows.push(
        <Text key="build" size={200}>
          Build: {detail.buildSuccess ? 'Success' : 'Failed'}
          {detail.buildErrorTemplateUsed && ' (build-error-fix template used)'}
          {detail.eslintTemplateUsed && ' + eslint-optimization'}
        </Text>
      );
      if (detail.buildFixAttempts) {
        rows.push(<Text key="fix" size={200}>{detail.buildFixAttempts} fix attempt(s)</Text>);
      }
      break;

    case 6:
      if (detail.thirdPartyTemplateUsed) {
        rows.push(<Text key="tp" size={200}>Third-party template used, {detail.packagesUpdated} package(s) updated</Text>);
      } else {
        rows.push(<Text key="tp" size={200}>Skipped (no third-party updates needed)</Text>);
      }
      break;

    case 7:
      if (detail.checksRun !== undefined) {
        rows.push(
          <Text key="checks" size={200}>
            {detail.checksPassed}/{detail.checksRun} checks passed
          </Text>
        );
      }
      break;
  }

  return rows.length > 0 ? rows : <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Completed</Text>;
}

export const PipelineExecutionView: React.FC<PipelineExecutionViewProps> = ({
  pipelinePhases,
  currentPhase,
  compact = false,
  disableAnimations,
}) => {
  const styles = useStyles();
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  const activePhaseNum = currentPhase ? currentPhaseToNumber(currentPhase) : 0;
  const hasAnyData = Object.keys(pipelinePhases).length > 0;

  if (!hasAnyData && !currentPhase) return null;

  return (
    <div className={styles.root}>
      <div className={styles.strip}>
        {PIPELINE_PHASES.map((phase, idx) => {
          const detail = pipelinePhases[phase.phase];
          const status = getPhaseStatus(phase.phase, detail, activePhaseNum);
          const summary = getPhaseSummary(phase.phase, detail);
          const nodeClass = getNodeClass(styles, status, disableAnimations);
          const isExpanded = expandedPhase === phase.phase;

          return (
            <React.Fragment key={phase.phase}>
              {idx > 0 && <span className={styles.arrow}>{'\u2192'}</span>}
              <div
                className={nodeClass}
                onClick={() => setExpandedPhase(isExpanded ? null : phase.phase)}
                role="button"
                tabIndex={0}
              >
                <div className={styles.nodeLabel}>
                  <span className={styles.nodeIcon}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {STATUS_ICONS[status]}
                    </Text>
                  </span>
                  <Text size={compact ? 200 : 300} weight="semibold">
                    {phase.shortLabel}
                  </Text>
                </div>
                {summary && (
                  <div className={styles.nodeSummary}>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                      {summary}
                    </Text>
                  </div>
                )}
                {!compact && (
                  isExpanded
                    ? <ChevronUpRegular style={{ fontSize: '10px', color: tokens.colorNeutralForeground4 }} />
                    : <ChevronDownRegular style={{ fontSize: '10px', color: tokens.colorNeutralForeground4 }} />
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Reports phase node */}
        <span className={styles.arrow}>{'\u2192'}</span>
        {(() => {
          const reportsStatus: PhaseStatus = !currentPhase
            ? 'success'                                   // in completed card → done
            : (currentPhase === 'success' || currentPhase === 'failed')
              ? 'running'                                 // pipeline done, generating reports
              : 'pending';                                // still in pipeline
          const reportsNodeClass = getNodeClass(styles, reportsStatus, disableAnimations);
          return (
            <div
              className={reportsNodeClass}
              onClick={() => setExpandedPhase(expandedPhase === 8 ? null : 8)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.nodeLabel}>
                <span className={styles.nodeIcon}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {STATUS_ICONS[reportsStatus]}
                  </Text>
                </span>
                <Text size={compact ? 200 : 300} weight="semibold">
                  Reports
                </Text>
              </div>
              {!compact && (
                expandedPhase === 8
                  ? <ChevronUpRegular style={{ fontSize: '10px', color: tokens.colorNeutralForeground4 }} />
                  : <ChevronDownRegular style={{ fontSize: '10px', color: tokens.colorNeutralForeground4 }} />
              )}
            </div>
          );
        })()}
      </div>

      {expandedPhase !== null && !compact && (
        <div className={styles.detailBar}>
          <div className={styles.detailRow}>
            <Badge appearance="outline" size="small" color="informative">
              {expandedPhase === 8 ? 'Reports' : `Phase ${expandedPhase}`}
            </Badge>
            <Text size={300} weight="semibold">
              {expandedPhase === 8 ? 'Report Generation' : PIPELINE_PHASES.find(p => p.phase === expandedPhase)?.label}
            </Text>
          </div>
          {expandedPhase === 8 ? (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Generates JSON and Markdown upgrade reports with patch details, AI metrics, and execution summary.
            </Text>
          ) : renderPhaseDetail(expandedPhase, pipelinePhases[expandedPhase])}
        </div>
      )}
    </div>
  );
};
