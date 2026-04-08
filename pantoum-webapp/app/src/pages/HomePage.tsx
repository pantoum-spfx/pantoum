import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Text,
  Button,
  Badge,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Tooltip,
  Input,
  Checkbox,
} from '@fluentui/react-components';
import {
  SettingsRegular,
  ArrowUploadRegular,
  DocumentTextRegular,
  HeartPulseRegular,
  DismissCircleRegular,
  CheckmarkCircleRegular,
  DeleteRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  BotSparkleRegular,
  WarningRegular,
  HistoryRegular,
  ArrowSyncRegular,
  SearchRegular,
  ArrowSortDownRegular,
  ArrowSortUpRegular,
} from '@fluentui/react-icons';
import { useHistoryStore } from '../stores/historyStore';
import type { SortField } from '../stores/historyStore';
import type { HistoryEntry } from '@shared/types/History';

// Each letter of PANTOUM as individual figlet "big" font blocks
const PANTOUM_LETTERS = [
  { char: 'P', color: '#0078d4', lines: [
    '██████╗ ',
    '██╔══██╗',
    '██████╔╝',
    '██╔═══╝ ',
    '██║     ',
    '╚═╝     ',
  ]},
  { char: 'A', color: '#f7630c', lines: [
    ' █████╗ ',
    '██╔══██╗',
    '███████║',
    '██╔══██║',
    '██║  ██║',
    '╚═╝  ╚═╝',
  ]},
  { char: 'N', color: '#0078d4', lines: [
    '███╗   ██╗',
    '████╗  ██║',
    '██╔██╗ ██║',
    '██║╚██╗██║',
    '██║ ╚████║',
    '╚═╝  ╚═══╝',
  ]},
  { char: 'T', color: '#f7630c', lines: [
    '████████╗',
    '╚══██╔══╝',
    '   ██║   ',
    '   ██║   ',
    '   ██║   ',
    '   ╚═╝   ',
  ]},
  { char: 'O', color: '#0078d4', lines: [
    ' ██████╗ ',
    '██╔═══██╗',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ]},
  { char: 'U', color: '#f7630c', lines: [
    '██╗   ██╗',
    '██║   ██║',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ]},
  { char: 'M', color: '#0078d4', lines: [
    '███╗   ███╗',
    '████╗ ████║',
    '██╔████╔██║',
    '██║╚██╔╝██║',
    '██║ ╚═╝ ██║',
    '╚═╝     ╚═╝',
  ]},
];

const HISTORY_PAGE_SIZE = 13;

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px 0 8px',
  },
  heroArt: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  logoImage: {
    width: '100px',
    height: '100px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15))',
  },
  asciiContainer: {
    display: 'flex',
    gap: '0px',
  },
  asciiLetter: {
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    fontSize: '11px',
    lineHeight: '13px',
    whiteSpace: 'pre',
    letterSpacing: '-0.5px',
    userSelect: 'none',
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: '12px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: {
    cursor: 'pointer',
    transition: 'box-shadow 0.2s, transform 0.2s',
    ':hover': {
      boxShadow: tokens.shadow8,
      transform: 'translateY(-2px)',
    },
  },
  historySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  historyTh: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontWeight: 600,
    fontSize: '12px',
  },
  historyThSortable: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground3,
    fontWeight: 600,
    fontSize: '12px',
    cursor: 'pointer',
    userSelect: 'none',
    ':hover': {
      color: tokens.colorNeutralForeground1,
    },
  },
  historyTd: {
    padding: '8px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: 'middle',
  },
  historyActions: {
    display: 'flex',
    gap: '4px',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
  },
  solutionList: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  emptyHistory: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    gap: '8px',
    color: tokens.colorNeutralForeground3,
  },
  selectionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorBrandStroke1}`,
  },
});

function extractFancyName(runId: string): string {
  // runId format: "20250214_192530_mystical_narwhal"
  const parts = runId.split('_');
  if (parts.length >= 4) {
    return parts.slice(2).join(' ');
  }
  return runId;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_CONFIG: Record<HistoryEntry['status'], { color: 'success' | 'warning' | 'danger'; icon: React.ReactNode }> = {
  success: {
    color: 'success',
    icon: <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1, fontSize: '16px' }} />,
  },
  partial: {
    color: 'warning',
    icon: <WarningRegular style={{ color: tokens.colorPaletteYellowForeground1, fontSize: '16px' }} />,
  },
  failed: {
    color: 'danger',
    icon: <DismissCircleRegular style={{ color: tokens.colorPaletteRedForeground1, fontSize: '16px' }} />,
  },
};

export const HomePage: React.FC = () => {
  const styles = useStyles();
  const navigate = useNavigate();
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

  const {
    entries, total, page, loading: historyLoading,
    search, sortBy, sortOrder,
    fetchHistory, setSearch, setSort, setActiveEntries, deleteEntry, clearAll,
  } = useHistoryStore();

  useEffect(() => {
    fetchHistory(1, HISTORY_PAGE_SIZE);
  }, [fetchHistory]);

  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);

  const handlePrev = useCallback(() => {
    if (page > 1) fetchHistory(page - 1, HISTORY_PAGE_SIZE);
  }, [page, fetchHistory]);

  const handleNext = useCallback(() => {
    if (page < totalPages) fetchHistory(page + 1, HISTORY_PAGE_SIZE);
  }, [page, totalPages, fetchHistory]);

  // Reset selection when page changes
  useEffect(() => {
    setSelectedRunIds(new Set());
  }, [page]);

  const allPageSelected = useMemo(
    () => entries.length > 0 && entries.every((e) => selectedRunIds.has(e.runId)),
    [entries, selectedRunIds],
  );

  const toggleSelectAll = useCallback(() => {
    if (allPageSelected) {
      setSelectedRunIds(new Set());
    } else {
      setSelectedRunIds(new Set(entries.map((e) => e.runId)));
    }
  }, [allPageSelected, entries]);

  const toggleSelect = useCallback((runId: string) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const handleAnalyze = useCallback((entry: HistoryEntry) => {
    setActiveEntries([entry]);
    navigate('/ai-console?skill=analyze');
  }, [setActiveEntries, navigate]);

  const handleBatchAnalyze = useCallback(() => {
    const selected = entries.filter((e) => selectedRunIds.has(e.runId));
    if (selected.length === 0) return;
    setActiveEntries(selected);
    navigate('/ai-console?skill=analyze');
  }, [entries, selectedRunIds, setActiveEntries, navigate]);

  const handleReport = useCallback((entry: HistoryEntry) => {
    const params = new URLSearchParams();
    if (entry.rootPath) params.set('rootPath', entry.rootPath);
    params.set('runId', entry.runId);
    navigate(`/reports?${params.toString()}`);
  }, [navigate]);

  const handleDelete = useCallback(async () => {
    if (deleteRunId) {
      await deleteEntry(deleteRunId);
      setDeleteRunId(null);
    }
  }, [deleteRunId, deleteEntry]);

  const handleClearAll = useCallback(async () => {
    await clearAll();
    setClearAllOpen(false);
  }, [clearAll]);

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc'
      ? <ArrowSortUpRegular style={{ fontSize: '12px', marginLeft: '2px' }} />
      : <ArrowSortDownRegular style={{ fontSize: '12px', marginLeft: '2px' }} />;
  };

  return (
    <div className={styles.page}>
      {/* Hero with colored PANTOUM ASCII art + squirrel logo */}
      <div className={styles.hero}>
        <div className={styles.heroArt}>
          <img src="/logo.png" alt="PANTOUM Squirrel" className={styles.logoImage} />
          <div className={styles.asciiContainer}>
            {PANTOUM_LETTERS.map((letter) => (
              <span
                key={letter.char}
                className={styles.asciiLetter}
                style={{ color: letter.color }}
              >
                {letter.lines.join('\n')}
              </span>
            ))}
          </div>
        </div>
        <Text as="p" size={400} className={styles.subtitle}>
          AI Assisted SPFx Upgrades
        </Text>
      </div>

      {/* Quick-action cards */}
      <div className={styles.cards}>
        <Card className={styles.card} onClick={() => navigate('/settings')}>
          <CardHeader
            image={<SettingsRegular style={{ fontSize: '24px', color: tokens.colorBrandForeground1 }} />}
            header={<Text weight="semibold">Settings</Text>}
            description="Start with the main upgrade controls, then open Advanced when you need more"
          />
        </Card>

        <Card className={styles.card} onClick={() => navigate('/upgrade')}>
          <CardHeader
            image={<ArrowUploadRegular style={{ fontSize: '24px', color: tokens.colorBrandForeground1 }} />}
            header={<Text weight="semibold">Upgrade</Text>}
            description="Scan, select, and upgrade SPFx solutions"
          />
        </Card>

        <Card className={styles.card} onClick={() => navigate('/reports')}>
          <CardHeader
            image={<DocumentTextRegular style={{ fontSize: '24px', color: tokens.colorBrandForeground1 }} />}
            header={<Text weight="semibold">Reports</Text>}
            description="Review what changed, what AI fixed, and what still needs attention"
          />
        </Card>

        <Card className={styles.card} onClick={() => navigate('/ai-console?skill=doctor')}>
          <CardHeader
            image={<HeartPulseRegular style={{ fontSize: '24px', color: tokens.colorBrandForeground1 }} />}
            header={<Text weight="semibold">Doctor</Text>}
            description="Check system requirements and environment health"
          />
        </Card>
      </div>

      {/* Upgrade History */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <Text as="h2" size={500} weight="semibold">Upgrade History</Text>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Button
              appearance="subtle"
              icon={<ArrowSyncRegular />}
              size="small"
              onClick={() => fetchHistory(page, HISTORY_PAGE_SIZE)}
              title="Refresh"
            />
          {entries.length > 0 && (
            <Dialog open={clearAllOpen} onOpenChange={(_, d) => setClearAllOpen(d.open)}>
              <DialogTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  size="small"
                >
                  Clear All
                </Button>
              </DialogTrigger>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>Clear All History</DialogTitle>
                  <DialogContent>
                    This will permanently delete all {total} history entries. This cannot be undone.
                  </DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement>
                      <Button appearance="primary">Cancel</Button>
                    </DialogTrigger>
                    <Button
                      appearance="outline"
                      onClick={handleClearAll}
                      style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedBorder1 }}
                    >
                      Clear All
                    </Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
          )}
          </div>
        </div>

        <Input
          size="large"
          placeholder="Filter by solution, run, or version..."
          contentBefore={<SearchRegular />}
          value={search}
          onChange={(_, d) => setSearch(d.value)}
          style={{ width: '100%', fontSize: '16px' }}
        />

        {selectedRunIds.size > 0 && (
          <div className={styles.selectionBar}>
            <Text size={200} weight="semibold">{selectedRunIds.size} selected</Text>
            <Button
              appearance="primary"
              size="small"
              icon={<BotSparkleRegular />}
              onClick={handleBatchAnalyze}
            >
              Analyze Selected
            </Button>
            <Button
              appearance="subtle"
              size="small"
              onClick={() => setSelectedRunIds(new Set())}
            >
              Deselect All
            </Button>
          </div>
        )}

        {historyLoading ? (
          <Spinner size="small" label="Loading history..." />
        ) : entries.length === 0 ? (
          <Card>
            <div className={styles.emptyHistory}>
              <HistoryRegular style={{ fontSize: '32px' }} />
              <Text size={300}>{search ? 'No matching entries' : 'No upgrade history yet'}</Text>
              <Text size={200}>{search ? 'Try a different search term' : 'Completed upgrades will appear here'}</Text>
            </div>
          </Card>
        ) : (
            <>
              <Card>
                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th className={styles.historyTh} style={{ width: '32px' }}>
                        <Checkbox
                          checked={allPageSelected ? true : selectedRunIds.size > 0 ? 'mixed' : false}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className={styles.historyTh}>Status</th>
                      <th className={styles.historyThSortable} onClick={() => setSort('solutions')}>Solutions<SortIcon field="solutions" /></th>
                      <th className={styles.historyThSortable} onClick={() => setSort('run')}>Run<SortIcon field="run" /></th>
                      <th className={styles.historyThSortable} onClick={() => setSort('version')}>Version<SortIcon field="version" /></th>
                      <th className={styles.historyThSortable} onClick={() => setSort('duration')}>Duration<SortIcon field="duration" /></th>
                      <th className={styles.historyThSortable} onClick={() => setSort('timestamp')}>When<SortIcon field="timestamp" /></th>
                      <th className={styles.historyTh}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const cfg = STATUS_CONFIG[entry.status];
                      const solNames = entry.solutions.map((s) => s.name);
                      const displaySols = solNames.slice(0, 2);
                      const extraCount = solNames.length - 2;
                      return (
                        <tr key={entry.runId}>
                          <td className={styles.historyTd}>
                            <Checkbox
                              checked={selectedRunIds.has(entry.runId)}
                              onChange={() => toggleSelect(entry.runId)}
                            />
                          </td>
                          <td className={styles.historyTd}>
                            {cfg.icon}
                          </td>
                          <td className={styles.historyTd}>
                            <Tooltip
                              content={entry.solutions.map((s) => s.path).join('\n')}
                              relationship="description"
                              positioning="below"
                            >
                              <Text size={200}>
                                {displaySols.join(', ')}
                                {extraCount > 0 && (
                                  <span style={{ color: tokens.colorNeutralForeground3 }}>
                                    {' '}+{extraCount} more
                                  </span>
                                )}
                              </Text>
                            </Tooltip>
                          </td>
                          <td className={styles.historyTd}>
                            <Text weight="semibold" size={200}>
                              {extractFancyName(entry.runId)}
                            </Text>
                          </td>
                          <td className={styles.historyTd}>
                            <Text size={200}>v{entry.targetVersion}</Text>
                          </td>
                          <td className={styles.historyTd}>
                            <Text size={200}>{formatDuration(entry.durationMs)}</Text>
                          </td>
                          <td className={styles.historyTd}>
                            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                              {formatRelativeTime(entry.timestamp)}
                            </Text>
                          </td>
                          <td className={styles.historyTd}>
                            <div className={styles.historyActions}>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<DocumentTextRegular />}
                                onClick={() => handleReport(entry)}
                                title="View Report"
                              />
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<BotSparkleRegular />}
                                onClick={() => handleAnalyze(entry)}
                                title="AI Analyze"
                              />
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<DeleteRegular />}
                                onClick={() => setDeleteRunId(entry.runId)}
                                title="Delete"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <Button
                    appearance="subtle"
                    icon={<ChevronLeftRegular />}
                    disabled={page <= 1}
                    onClick={handlePrev}
                    size="small"
                  />
                  <Text size={200}>
                    Page {page} of {totalPages}
                  </Text>
                  <Button
                    appearance="subtle"
                    icon={<ChevronRightRegular />}
                    disabled={page >= totalPages}
                    onClick={handleNext}
                    size="small"
                  />
                </div>
              )}
            </>
          )}
        </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteRunId !== null} onOpenChange={(_, d) => { if (!d.open) setDeleteRunId(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete History Entry</DialogTitle>
            <DialogContent>
              Delete the history entry for "{deleteRunId ? extractFancyName(deleteRunId) : ''}"? This cannot be undone.
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setDeleteRunId(null)}>Cancel</Button>
              <Button
                appearance="outline"
                onClick={handleDelete}
                style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedBorder1 }}
              >
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};
