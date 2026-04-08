import React, { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { FolderSearchRegular, FolderOpenRegular, SearchRegular } from '@fluentui/react-icons';

interface SolutionScannerProps {
  rootPath: string;
  onRootPathChange: (path: string) => void;
  onScan: () => Promise<void>;
  onBrowse: () => Promise<void>;
  disabled?: boolean;
  scanning: boolean;
  scanError: string | null;
  scanned: boolean;
  solutionCount: number;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  searchRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'end',
  },
  pathInput: {
    flex: 1,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
});

export const SolutionScanner: React.FC<SolutionScannerProps> = ({
  rootPath,
  onRootPathChange,
  onScan,
  onBrowse,
  disabled,
  scanning,
  scanError,
  scanned,
  solutionCount,
}) => {
  const styles = useStyles();
  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      await onBrowse();
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className={styles.root}>
      <Text size={300} className={styles.subtitle}>
        Enter the root path to scan for SPFx solutions
      </Text>

      <div className={styles.searchRow}>
        <Input
          className={styles.pathInput}
          value={rootPath}
          onChange={(_, data) => onRootPathChange(data.value)}
          placeholder="/path/to/your/spfx/projects"
          contentBefore={<FolderSearchRegular />}
          onKeyDown={(e) => e.key === 'Enter' && onScan()}
          disabled={disabled}
        />
        <Button
          appearance="secondary"
          icon={browsing ? undefined : <FolderOpenRegular />}
          onClick={handleBrowse}
          disabled={browsing || scanning || disabled}
        >
          {browsing ? <Spinner size="tiny" /> : 'Browse'}
        </Button>
        <Button
          appearance="primary"
          icon={scanning ? undefined : <SearchRegular />}
          onClick={onScan}
          disabled={scanning || !rootPath.trim() || disabled}
        >
          {scanning ? <Spinner size="tiny" /> : 'Scan'}
        </Button>
      </div>

      {scanError && (
        <MessageBar intent="error">
          <MessageBarBody>{scanError}</MessageBarBody>
        </MessageBar>
      )}

      {scanned && solutionCount === 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>No SPFx solutions found in this directory</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
};
