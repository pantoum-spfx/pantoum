import React from 'react';
import { makeStyles, tokens, Text, Slider } from '@fluentui/react-components';

interface ParallelismSliderProps {
  value: number;
  onChange: (value: number) => void;
  maxParallel: number;
  selectedCount: number;
  disabled?: boolean;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  label: {
    flexShrink: 0,
    minWidth: '90px',
  },
  slider: {
    flex: 1,
    minWidth: '120px',
    maxWidth: '200px',
  },
  value: {
    flexShrink: 0,
    minWidth: '20px',
    textAlign: 'center',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
});

export const ParallelismSlider: React.FC<ParallelismSliderProps> = ({
  value,
  onChange,
  maxParallel,
  selectedCount,
  disabled,
}) => {
  const styles = useStyles();

  // Only show when more than 1 solution selected
  if (selectedCount <= 1) return null;

  const max = Math.min(4, maxParallel || 4, selectedCount);

  return (
    <div className={styles.root}>
      <Text size={300} className={styles.label}>Parallelism</Text>
      <Slider
        className={styles.slider}
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(_, data) => onChange(data.value)}
        disabled={disabled}
      />
      <Text size={400} className={styles.value}>{value}</Text>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        concurrent
      </Text>
    </div>
  );
};
