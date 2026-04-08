import React, { useMemo } from 'react';
import { makeStyles, Text, Button, Spinner, Tooltip } from '@fluentui/react-components';
import { BeakerRegular } from '@fluentui/react-icons';
import type { SolutionInfo, SolutionComplexity } from '@shared/types/Solution';
import { SolutionRow } from './SolutionRow';

interface SolutionSelectorProps {
  solutions: SolutionInfo[];
  selected: string[];
  onSelectedChange: (paths: string[]) => void;
  targetVersion: string;
  complexityMap: Record<string, SolutionComplexity>;
  analyzing: boolean;
  onAnalyzeComplexity: () => void;
  disabled?: boolean;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
});

export const SolutionSelector: React.FC<SolutionSelectorProps> = ({
  solutions,
  selected,
  onSelectedChange,
  targetVersion,
  complexityMap,
  analyzing,
  onAnalyzeComplexity,
  disabled,
}) => {
  const styles = useStyles();
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Sort: upgradeable solutions first, already-at-target last
  const sortedSolutions = useMemo(() => {
    return [...solutions].sort((a, b) => {
      const aAtTarget = a.currentVersion === targetVersion ? 1 : 0;
      const bAtTarget = b.currentVersion === targetVersion ? 1 : 0;
      if (aAtTarget !== bAtTarget) return aAtTarget - bAtTarget;
      return a.name.localeCompare(b.name);
    });
  }, [solutions, targetVersion]);

  // Count solutions at target
  const atTargetCount = useMemo(
    () => solutions.filter((s) => s.currentVersion === targetVersion).length,
    [solutions, targetVersion],
  );

  const toggleSelect = (path: string) => {
    // Prevent selecting already-at-target solutions
    const sol = solutions.find((s) => s.path === path);
    if (sol && sol.currentVersion === targetVersion) return;

    if (selectedSet.has(path)) {
      onSelectedChange(selected.filter((p) => p !== path));
    } else {
      onSelectedChange([...selected, path]);
    }
  };

  const selectAll = () => {
    // Skip already-at-target solutions by default
    const eligible = solutions
      .filter((s) => s.currentVersion !== targetVersion)
      .map((s) => s.path);
    onSelectedChange(eligible);
  };

  const clearAll = () => onSelectedChange([]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size={300}>
          {solutions.length} solution{solutions.length !== 1 ? 's' : ''} found
          {selected.length > 0 && ` (${selected.length} selected)`}
          {atTargetCount > 0 && ` — ${atTargetCount} already at target`}
        </Text>
        <div className={styles.headerActions}>
          {analyzing && <Spinner size="tiny" label="Analyzing..." />}
          {!analyzing && Object.keys(complexityMap).length === 0 && (
            <Tooltip
              content="Analyze upgrade complexity for each solution (~150 npm calls per solution, may take 20-30s)"
              relationship="description"
            >
              <Button
                size="small"
                icon={<BeakerRegular />}
                onClick={onAnalyzeComplexity}
                disabled={disabled}
              >
                Check Complexity
              </Button>
            </Tooltip>
          )}
          <Button size="small" onClick={selectAll} disabled={disabled}>Select All</Button>
          <Button size="small" onClick={clearAll} disabled={disabled}>Clear</Button>
        </div>
      </div>

      <div className={styles.list}>
        {sortedSolutions.map((solution) => (
          <SolutionRow
            key={solution.path}
            solution={solution}
            selected={selectedSet.has(solution.path)}
            onToggle={toggleSelect}
            targetVersion={targetVersion}
            complexity={complexityMap[solution.path]}
            disabled={disabled}
          />
        ))}
      </div>

    </div>
  );
};
