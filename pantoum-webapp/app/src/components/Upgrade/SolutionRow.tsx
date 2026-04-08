import React from 'react';
import { makeStyles, tokens, Text, Checkbox, Badge, Tooltip } from '@fluentui/react-components';
import type { SolutionInfo, SolutionComplexity } from '@shared/types/Solution';

interface SolutionRowProps {
  solution: SolutionInfo;
  selected: boolean;
  onToggle: (path: string) => void;
  targetVersion: string;
  complexity?: SolutionComplexity;
  disabled?: boolean;
}

const useStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    minHeight: '36px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  rowSelected: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    minHeight: '36px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  rowAtTarget: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '6px 12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    minHeight: '36px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    opacity: 0.6,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      opacity: 0.8,
    },
  },
  name: {
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '13px',
    fontWeight: 600,
    minWidth: '160px',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  path: {
    flex: 1,
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  badges: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
    alignItems: 'center',
  },
});

export const SolutionRow: React.FC<SolutionRowProps> = ({
  solution,
  selected,
  onToggle,
  targetVersion,
  complexity,
  disabled,
}) => {
  const styles = useStyles();
  const isAtTarget = solution.currentVersion === targetVersion;

  const rowClass = isAtTarget
    ? styles.rowAtTarget
    : selected
      ? styles.rowSelected
      : styles.row;

  return (
    <div
      className={rowClass}
      onClick={() => !disabled && !isAtTarget && onToggle(solution.path)}
    >
      <Checkbox
        checked={selected}
        onChange={() => onToggle(solution.path)}
        disabled={disabled || isAtTarget}
      />
      <Text className={styles.name}>{solution.name}</Text>
      <Text className={styles.path}>{solution.path}</Text>
      <div className={styles.badges}>
        {isAtTarget ? (
          <Badge appearance="filled" color="informative" size="small">
            Already at {targetVersion}
          </Badge>
        ) : (
          <Badge appearance="outline" size="small">
            SPFx {solution.currentVersion}
          </Badge>
        )}
        {complexity && (
          <Tooltip
            content={complexity.factors.join(' | ') || `Score: ${complexity.score}/100`}
            relationship="description"
          >
            <Badge
              appearance="filled"
              size="small"
              color={
                complexity.label === 'Low' ? 'success' :
                complexity.label === 'Medium' ? 'warning' :
                'danger'
              }
            >
              {complexity.label} ({complexity.score})
            </Badge>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
