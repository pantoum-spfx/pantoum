import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Button,
  Divider,
  Tooltip,
} from '@fluentui/react-components';
import {
  PlayRegular,
  StopRegular,
  ArrowSyncRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { useUpgradeStore } from '../stores/upgradeStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSettingsStore } from '../stores/settingsStore';
import { AiAnalyzePanel } from '../components/AiAnalyzePanel';
import {
  SolutionScanner,
  SolutionSelector,
  ParallelismSlider,
  UpgradeProgress,
  CompletionSummary,
  CompletedSolutionCard,
} from '../components/Upgrade';
import type { SolutionComplexity } from '@shared/types/Solution';

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
  headerRight: {
    display: 'flex',
    gap: '8px',
  },
  startRow: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px 0',
  },
  postUpgradeActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  completedSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
});

/** Extract the parent directory from a report path */
function getReportRootPath(reportPath: string): string {
  const parts = reportPath.replace(/\\/g, '/').split('/');
  const runIdx = parts.findIndex((p) => p.startsWith('pantoum_run_'));
  if (runIdx > 0) return parts.slice(0, runIdx).join('/');
  return parts.slice(0, -2).join('/');
}

export const UpgradePage: React.FC = () => {
  const styles = useStyles();
  const navigate = useNavigate();

  // Store state — individual selectors to avoid full re-render on every WS message
  const sessionId = useUpgradeStore((s) => s.sessionId);
  const batchStatus = useUpgradeStore((s) => s.batchStatus);
  const rootPath = useUpgradeStore((s) => s.rootPath);
  const scannedSolutions = useUpgradeStore((s) => s.scannedSolutions);
  const selected = useUpgradeStore((s) => s.selected);
  const upgradeSolutions = useUpgradeStore((s) => s.upgradeSolutions);
  const batchCompletionData = useUpgradeStore((s) => s.batchCompletionData);
  const batchError = useUpgradeStore((s) => s.batchError);

  // Functions are stable references — won't trigger re-renders
  const startUpgrade = useUpgradeStore((s) => s.startUpgrade);
  const stopUpgrade = useUpgradeStore((s) => s.stopUpgrade);
  const stopSolution = useUpgradeStore((s) => s.stopSolution);
  const reset = useUpgradeStore((s) => s.reset);
  const setRootPath = useUpgradeStore((s) => s.setRootPath);
  const setScannedSolutions = useUpgradeStore((s) => s.setScannedSolutions);
  const setSelected = useUpgradeStore((s) => s.setSelected);
  const setUpgradeSolutions = useUpgradeStore((s) => s.setUpgradeSolutions);

  // Only subscribe to solutions when finished (avoids per-message re-renders during run)
  const finishedSolutions = useUpgradeStore((s) =>
    ['complete', 'failed', 'aborted'].includes(s.batchStatus) ? s.solutions : null,
  );

  const reconnectSession = useUpgradeStore((s) => s.reconnectSession);

  const ws = useWebSocket(sessionId);
  const targetVersion = useSettingsStore((s) => s.settings.target_version);
  const maxParallelSetting = useSettingsStore((s) => s.settings.max_parallel_upgrades);
  const analyzeComplexity = useSettingsStore((s) => s.settings.analyze_complexity);
  const includeDevDeps = useSettingsStore((s) => s.settings.include_dev_deps_complexity);
  const disableAnimations = useSettingsStore((s) => s.settings.disable_animations);

  // Local UI state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(scannedSolutions.length > 0);
  const [complexityMap, setComplexityMap] = useState<Record<string, SolutionComplexity>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [parallelism, setParallelism] = useState(1);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Reconnect to an active server session on mount (e.g. after tab close/refresh)
  useEffect(() => {
    if (batchStatus === 'idle' && !sessionId) {
      reconnectSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Track start time
  useEffect(() => {
    if ((batchStatus === 'running' || batchStatus === 'starting') && !startTime) {
      setStartTime(Date.now());
    }
    if (batchStatus === 'idle') setStartTime(null);
  }, [batchStatus, startTime]);

  // Derive state
  const isRunning = batchStatus === 'running' || batchStatus === 'starting';
  const isFinished = batchStatus === 'complete' || batchStatus === 'failed' || batchStatus === 'aborted';
  const isIdle = batchStatus === 'idle';

  // Status badge
  const statusBadge = useMemo(() => {
    switch (batchStatus) {
      case 'idle': return { color: 'informative' as const, label: 'Ready' };
      case 'starting': return { color: 'warning' as const, label: 'Starting...' };
      case 'running': return { color: 'warning' as const, label: 'Running' };
      case 'complete': return { color: 'success' as const, label: 'Complete' };
      case 'failed': return { color: 'danger' as const, label: 'Failed' };
      case 'aborted': return { color: 'important' as const, label: 'Aborted' };
      default: return { color: 'informative' as const, label: batchStatus };
    }
  }, [batchStatus]);

  // --- Scan handlers ---
  const handleBrowse = useCallback(async () => {
    try {
      const res = await fetch('/api/solutions/browse', { method: 'POST' });
      const data = await res.json();
      if (data.path) {
        setRootPath(data.path);
        setScannedSolutions([]);
        setSelected([]);
        setComplexityMap({});
        setScanned(false);
        setScanError(null);
      }
    } catch {
      // User cancelled or API unavailable
    }
  }, [setRootPath, setScannedSolutions, setSelected]);

  const handleScan = useCallback(async () => {
    if (!rootPath.trim()) return;
    setScanning(true);
    setScanError(null);
    setComplexityMap({});
    setScannedSolutions([]);
    setSelected([]);
    try {
      const res = await fetch('/api/solutions/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: rootPath.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setScannedSolutions(data.solutions);
      // Select all that aren't already at target
      const eligible = data.solutions
        .filter((s: { currentVersion: string }) => s.currentVersion !== targetVersion)
        .map((s: { path: string }) => s.path);
      setSelected(eligible);
      setScanned(true);
      if (analyzeComplexity && data.solutions.length > 0) {
        const eligible = data.solutions.filter(
          (s: { currentVersion: string }) => s.currentVersion !== targetVersion,
        );
        if (eligible.length > 0) runComplexityAnalysis(eligible);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [rootPath, targetVersion, analyzeComplexity, setScannedSolutions, setSelected]);

  const handleRootPathChange = useCallback((value: string) => {
    setRootPath(value);
    if (scannedSolutions.length > 0) {
      setScannedSolutions([]);
      setSelected([]);
      setComplexityMap({});
      setScanned(false);
      setScanError(null);
    }
  }, [scannedSolutions.length, setRootPath, setScannedSolutions, setSelected]);

  const runComplexityAnalysis = async (sols: { path: string; currentVersion: string }[]) => {
    if (sols.length === 0) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/solutions/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutions: sols.map((s) => ({ path: s.path, currentVersion: s.currentVersion })),
          targetVersion,
          includeDevDeps,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setComplexityMap(data.results);
      }
    } catch {
      // Non-critical
    } finally {
      setAnalyzing(false);
    }
  };

  // --- Upgrade handlers ---
  const handleStart = useCallback(async () => {
    const sols = [...selected];
    setUpgradeSolutions(sols);
    try {
      await startUpgrade(sols, parallelism);
    } catch {
      // Error is stored in the store
    }
  }, [selected, parallelism, setUpgradeSolutions, startUpgrade]);

  const handleStop = useCallback(async () => {
    await stopUpgrade();
  }, [stopUpgrade]);

  const handleAbortSolution = useCallback(async (solutionPath: string) => {
    await stopSolution(solutionPath);
  }, [stopSolution]);

  const handleReset = useCallback(() => {
    reset();
    setStartTime(null);
    setComplexityMap({});
    setScanned(false);
    setScanError(null);
    setParallelism(1);
  }, [reset, maxParallelSetting]);

  const navigateToReports = useCallback(() => {
    if (batchCompletionData?.reportPath) {
      const root = getReportRootPath(batchCompletionData.reportPath);
      navigate(`/reports?rootPath=${encodeURIComponent(root)}`);
    } else {
      navigate('/reports');
    }
  }, [batchCompletionData, navigate]);

  const handleViewReport = useCallback((reportPath: string) => {
    const root = getReportRootPath(reportPath);
    window.open(`/reports?rootPath=${encodeURIComponent(root)}`, '_blank');
  }, []);

  const getReportHref = useCallback((reportPath: string) => {
    const root = getReportRootPath(reportPath);
    return `/reports?rootPath=${encodeURIComponent(root)}`;
  }, []);

  const handleAnalyzeSolution = useCallback((solutionPath: string, reportPath?: string) => {
    const params = new URLSearchParams({ skill: 'analyze', solution: solutionPath });
    if (reportPath) params.set('report', reportPath);
    window.open(`/ai-console?${params.toString()}`, '_blank');
  }, []);

  const getAnalyzeHref = useCallback((solutionPath: string, reportPath?: string) => {
    const params = new URLSearchParams({ skill: 'analyze', solution: solutionPath });
    if (reportPath) params.set('report', reportPath);
    return `/ai-console?${params.toString()}`;
  }, []);

  // Get completed solutions for the completion state (only computed when finished)
  const completedSolutions = useMemo(() => {
    if (!finishedSolutions) return [];
    return Array.from(finishedSolutions.values())
      .filter((s) => s.status === 'completed' || s.status === 'failed')
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }, [finishedSolutions]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Text as="h1" size={700} weight="bold">Upgrade</Text>
          <Badge appearance="filled" color={statusBadge.color} size="small">
            {statusBadge.label}
          </Badge>
        </div>
        <div className={styles.headerRight}>
          {batchStatus === 'starting' && (
            <Button appearance="primary" disabled>Starting...</Button>
          )}
          {batchStatus === 'running' && (
            <Tooltip content="Stops running upgrades and clears the queue" relationship="description">
              <Button appearance="secondary" icon={<StopRegular />} onClick={handleStop}>
                Stop All
              </Button>
            </Tooltip>
          )}
          {isFinished && (
            <Button appearance="secondary" icon={<ArrowSyncRegular />} onClick={handleReset}>
              New Upgrade
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {batchError && (
        <div style={{ color: tokens.colorPaletteRedForeground1 }}>
          {batchError.data.message}
        </div>
      )}

      {/* --- IDLE STATE --- */}
      {isIdle && (
        <>
          <SolutionScanner
            rootPath={rootPath}
            onRootPathChange={handleRootPathChange}
            onScan={handleScan}
            onBrowse={handleBrowse}
            scanning={scanning}
            scanError={scanError}
            scanned={scanned}
            solutionCount={scannedSolutions.length}
          />

          {scannedSolutions.length > 0 && (
            <>
              <div className={styles.startRow}>
                <Button
                  appearance="primary"
                  size="large"
                  icon={<PlayRegular />}
                  disabled={selected.length === 0}
                  onClick={handleStart}
                >
                  Start Upgrade ({selected.length} selected{parallelism > 1 ? `, ${parallelism}x parallel` : ''})
                </Button>
              </div>

              <ParallelismSlider
                value={parallelism}
                onChange={setParallelism}
                maxParallel={maxParallelSetting}
                selectedCount={selected.length}
              />

              <SolutionSelector
                solutions={scannedSolutions}
                selected={selected}
                onSelectedChange={setSelected}
                targetVersion={targetVersion}
                complexityMap={complexityMap}
                analyzing={analyzing}
                onAnalyzeComplexity={() => runComplexityAnalysis(
                  scannedSolutions.filter((s) => s.currentVersion !== targetVersion),
                )}
              />
            </>
          )}
        </>
      )}

      {/* --- RUNNING STATE --- */}
      {/* Keep progress view visible during running→finished transition until
          batchCompletionData is ready, preventing brief unmount/remount flash */}
      {(isRunning || (isFinished && !batchCompletionData)) && upgradeSolutions.length > 0 && (
        <UpgradeProgress
          startTime={startTime}
          onAbortSolution={handleAbortSolution}
          onViewReport={handleViewReport}
          onAnalyze={handleAnalyzeSolution}
          getAnalyzeHref={getAnalyzeHref}
          getReportHref={getReportHref}
        />
      )}

      {/* --- COMPLETION STATE --- */}
      {isFinished && (
        <>
          {batchCompletionData && (
            <>
              <CompletionSummary
                data={batchCompletionData}
                onViewReports={navigateToReports}
              />

              {/* Completed solutions cards */}
              {completedSolutions.length > 0 && (
                <div className={styles.completedSection}>
                  {completedSolutions.map((sol) => (
                    <CompletedSolutionCard
                      key={sol.solutionPath}
                      solution={sol}
                      onViewReport={handleViewReport}
                      onAnalyze={handleAnalyzeSolution}
                      getAnalyzeHref={getAnalyzeHref}
                      getReportHref={getReportHref}
                      disableAnimations={disableAnimations}
                    />
                  ))}
                </div>
              )}

              <Divider />
              <AiAnalyzePanel
                solutionPaths={upgradeSolutions}
                reportPath={batchCompletionData.reportPath}
                rootPath={rootPath}
                compact
              />
            </>
          )}
        </>
      )}
    </div>
  );
};
