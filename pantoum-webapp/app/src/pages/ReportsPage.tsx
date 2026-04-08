import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  CardHeader,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  Button,
  Input,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Divider,
  Tooltip,
} from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
  CalendarRegular,
  ArrowLeftRegular,
  ArrowDownloadRegular,
  DocumentTextRegular,
  BotSparkleRegular,
  FolderSearchRegular,
  SearchRegular,
  SkipForward10Regular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReportSummary, ReportDetail, ReportPatch, ClaudeMetrics } from '@shared/types/Report';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  searchRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'end',
  },
  pathInput: {
    flex: 1,
  },
  reports: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  reportCard: {
    cursor: 'pointer',
    ':hover': { boxShadow: tokens.shadow4 },
  },
  cardMeta: {
    display: 'flex',
    gap: '8px',
    padding: '0 16px 12px',
    flexWrap: 'wrap',
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  detailHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  detailActions: {
    display: 'flex',
    gap: '8px',
  },
  patchList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  patchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: '13px',
    fontFamily: 'monospace',
  },
  patchId: {
    fontWeight: 'bold',
    minWidth: '80px',
  },
  patchDesc: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  codeBox: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
    fontSize: '12px',
    lineHeight: '18px',
    whiteSpace: 'pre-wrap',
    color: tokens.colorNeutralForeground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  markdownBox: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    padding: '16px 20px',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: '14px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    color: tokens.colorNeutralForeground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  thirdPartyTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  thirdPartyTh: {
    padding: '6px 10px',
    textAlign: 'left',
    fontWeight: 600,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  thirdPartyTd: {
    padding: '6px 10px',
    textAlign: 'left',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '16px',
  },
  summaryCard: {
    padding: '16px',
    textAlign: 'center' as const,
  },
});

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}


function getStageBadge(stage?: string): string {
  const labels: Record<string, string> = {
    upgrade: 'Upgrade',
    'pre-upgrade': 'Pre-upgrade',
    'post-upgrade': 'Post-upgrade',
    'build-fix': 'Build Fix',
  };
  return labels[stage || ''] || stage || 'Other';
}

/** Aggregate Claude metrics from all patches in a report */
function aggregateClaudeMetrics(patches: ReportPatch[]): ClaudeMetrics | null {
  const claudePatches = patches.filter((p) => p.claudeMetrics);
  if (claudePatches.length === 0) return null;

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
  let totalCost = 0, totalDuration = 0, totalTurns = 0;
  const toolCounts = new Map<string, number>();

  for (const p of claudePatches) {
    const m = p.claudeMetrics!;
    totalInput += m.tokens.input;
    totalOutput += m.tokens.output;
    totalCacheRead += m.tokens.cacheRead || 0;
    totalCacheCreation += m.tokens.cacheCreation || 0;
    totalCost += m.cost;
    totalDuration += m.performance.durationMs;
    totalTurns += m.performance.turns;

    if (m.toolUsage) {
      for (const t of m.toolUsage) {
        toolCounts.set(t.name, (toolCounts.get(t.name) || 0) + 1);
      }
    }
  }

  return {
    tokens: {
      input: totalInput,
      output: totalOutput,
      total: totalInput + totalOutput + totalCacheRead + totalCacheCreation,
      cacheRead: totalCacheRead,
      cacheCreation: totalCacheCreation,
    },
    cost: totalCost,
    performance: { durationMs: totalDuration, turns: totalTurns },
    toolUsage: Array.from(toolCounts.entries()).map(([name, count]) => ({ name, count })),
  };
}

// ─── Main Component ───────────────────────────────────────────────────

export const ReportsPage: React.FC = () => {
  const styles = useStyles();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Track if we arrived via a direct runId link (e.g. from home page)
  const [directLink] = useState(() => !!searchParams.get('runId'));

  // List state
  const [rootPath, setRootPath] = useState(() => searchParams.get('rootPath') || '');
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Detail state
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchReports = useCallback(async (pathOverride?: string) => {
    const searchPath = pathOverride ?? rootPath;
    setLoading(true);
    setError(null);
    try {
      const params = searchPath.trim() ? `?rootPath=${encodeURIComponent(searchPath.trim())}` : '';
      const res = await fetch(`/api/reports${params}`);
      const data = await res.json();
      setReports(data.reports || []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  // Auto-load reports when navigated with rootPath query param
  // If runId is also provided, auto-open that specific report
  useEffect(() => {
    const qp = searchParams.get('rootPath');
    const qRunId = searchParams.get('runId');
    if (qp && !searched) {
      setRootPath(qp);
      fetchReports(qp);
    }
    if (qRunId && !selectedRunId) {
      fetchDetail(qRunId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDetail = async (runId: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const params = rootPath.trim() ? `?rootPath=${encodeURIComponent(rootPath.trim())}` : '';
      const res = await fetch(`/api/reports/${runId}${params}`);
      if (!res.ok) throw new Error('Report not found');
      const data = await res.json();
      setDetail(data);
      setSelectedRunId(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleBack = () => {
    if (directLink) {
      navigate(-1);
    } else {
      setSelectedRunId(null);
      setDetail(null);
    }
  };

  const downloadMarkdown = async (runId: string) => {
    const params = rootPath.trim() ? `?rootPath=${encodeURIComponent(rootPath.trim())}` : '';
    const res = await fetch(`/api/reports/${runId}/markdown${params}`);
    if (!res.ok) return;
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PANTOUM_Report_${runId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    if (!detail || !selectedRunId) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PANTOUM_Report_${selectedRunId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Detail View ────────────────────────────────────────────────────
  if (selectedRunId && detail) {
    return (
      <ReportDetailView
        detail={detail}
        runId={selectedRunId}
        rootPath={rootPath}
        styles={styles}
        onBack={handleBack}
        onDownloadMarkdown={() => downloadMarkdown(selectedRunId)}
        onDownloadJson={downloadJson}
      />
    );
  }

  if (loadingDetail) {
    return <Spinner label="Loading report..." />;
  }

  // ─── List View ──────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <Text as="h1" size={700} weight="bold">Reports</Text>
      <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
        Browse upgrade reports — enter the root path where solutions are located
      </Text>

      <div className={styles.searchRow}>
        <Input
          className={styles.pathInput}
          value={rootPath}
          onChange={(_, data) => setRootPath(data.value)}
          placeholder="/path/to/your/spfx/projects"
          contentBefore={<FolderSearchRegular />}
          onKeyDown={(e) => e.key === 'Enter' && fetchReports()}
        />
        <Button
          appearance="primary"
          icon={loading ? undefined : <SearchRegular />}
          onClick={() => fetchReports()}
          disabled={loading}
        >
          {loading ? <Spinner size="tiny" /> : 'Search'}
        </Button>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {searched && reports.length === 0 && !error && (
        <MessageBar intent="info">
          <MessageBarBody>
            No upgrade reports found. Run an upgrade to generate reports.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.reports}>
        {reports.map((report) => {
          const isSuccess = report.status.includes('Success');
          const isSkipped = report.status.includes('Skipped');
          return (
            <Card
              key={`${report.runId}-${report.solutionName}`}
              className={styles.reportCard}
              onClick={() => fetchDetail(report.runId)}
            >
              <CardHeader
                header={<Text weight="semibold">{report.solutionName}</Text>}
                description={
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CalendarRegular style={{ fontSize: '14px' }} />
                    {new Date(report.timestamp).toLocaleString()} — Run {report.runId}
                  </span>
                }
                action={<ChevronRightRegular style={{ fontSize: '20px', color: tokens.colorNeutralForeground3 }} />}
              />
              <div className={styles.cardMeta}>
                <Badge appearance="outline" size="small">
                  Target: SPFx {report.targetVersion}
                </Badge>
                {isSuccess && (
                  <Badge appearance="filled" color="success" icon={<CheckmarkCircleRegular />} size="small">
                    Success
                  </Badge>
                )}
                {isSkipped && (
                  <Badge appearance="filled" color="informative" icon={<SkipForward10Regular />} size="small">
                    Skipped
                  </Badge>
                )}
                {!isSuccess && !isSkipped && (
                  <Badge appearance="filled" color="danger" icon={<DismissCircleRegular />} size="small">
                    Failed
                  </Badge>
                )}
                <Badge appearance="outline" size="small">
                  {report.patchesApplied}/{report.totalPatches} patches
                </Badge>
                {report.claudeActionsCount > 0 && (
                  <Badge appearance="outline" color="important" icon={<BotSparkleRegular />} size="small">
                    {report.claudeActionsCount} AI actions
                  </Badge>
                )}
                {report.hasMarkdown && (
                  <Badge appearance="outline" color="informative" icon={<DocumentTextRegular />} size="small">
                    Markdown
                  </Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ─── Detail View Component ────────────────────────────────────────────

interface ReportDetailViewProps {
  detail: ReportDetail;
  runId: string;
  rootPath: string;
  styles: ReturnType<typeof useStyles>;
  onBack: () => void;
  onDownloadMarkdown: () => void;
  onDownloadJson: () => void;
}

const ReportDetailView: React.FC<ReportDetailViewProps> = ({
  detail,
  runId,
  rootPath,
  styles,
  onBack,
  onDownloadMarkdown,
  onDownloadJson,
}) => {
  const [expandedActions, setExpandedActions] = useState<Record<string, boolean>>({});
  const { summary, report } = detail;
  const isSuccess = summary.status.includes('Success');
  const isSkipped = report.skipped;

  const allPatches = useMemo(
    () => [...(report.patches || []), ...(report.buildFixPatches || [])],
    [report.patches, report.buildFixPatches],
  );

  const aiMetrics = useMemo(() => aggregateClaudeMetrics(allPatches), [allPatches]);

  const claudePatches = useMemo(
    () => allPatches.filter((p) => p.type === 'claudeActions' || (p.claudeActions && p.claudeActions.length > 0)),
    [allPatches],
  );

  const patchesByStage = useMemo(() => {
    const map = new Map<string, ReportPatch[]>();
    for (const p of allPatches) {
      const stage = p.stage || 'other';
      if (!map.has(stage)) map.set(stage, []);
      map.get(stage)!.push(p);
    }
    return map;
  }, [allPatches]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderLeft}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack} size="small">Back</Button>
        </div>
        <div className={styles.detailActions}>
          {detail.markdown && (
            <Button size="small" icon={<ArrowDownloadRegular />} onClick={onDownloadMarkdown}>
              Markdown
            </Button>
          )}
          <Button size="small" icon={<ArrowDownloadRegular />} onClick={onDownloadJson}>
            JSON
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Text as="h1" size={700} weight="bold">{detail.solutionName}</Text>
        {isSkipped ? (
          <Badge appearance="filled" color="informative" size="small">Skipped</Badge>
        ) : isSuccess ? (
          <Badge appearance="filled" color="success" size="small">Success</Badge>
        ) : (
          <Badge appearance="filled" color="danger" size="small">Failed</Badge>
        )}
      </div>

      <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
        {new Date(detail.timestamp).toLocaleString()} — Target SPFx {detail.targetVersion} — PANTOUM {detail.pantoumVersion}
      </Text>
      {(detail as any).reportPath && (
        <Text size={200} font="monospace" style={{ color: tokens.colorNeutralForeground3 }}>
          {(detail as any).reportPath}
        </Text>
      )}

      {isSkipped && (
        <MessageBar intent="info">
          <MessageBarBody>{report.skipReason || 'Solution was skipped'}</MessageBarBody>
        </MessageBar>
      )}

      {/* Summary stats */}
      {!isSkipped && (
        <div className={styles.summaryGrid}>
          <Card className={styles.summaryCard}>
            <Text size={600} weight="bold">{summary.totalPatches}</Text>
            <Text size={300}>Total Patches</Text>
          </Card>
          <Card className={styles.summaryCard}>
            <Text size={600} weight="bold" style={{ color: tokens.colorPaletteGreenForeground1 }}>
              {summary.patchesApplied}
            </Text>
            <Text size={300}>Applied</Text>
          </Card>
          <Card className={styles.summaryCard}>
            <Text size={600} weight="bold">{summary.claudeActionsCount}</Text>
            <Text size={300}>AI Actions</Text>
          </Card>
          <Card className={styles.summaryCard}>
            <Text size={600} weight="bold">{summary.buildFixAttempts}</Text>
            <Text size={300}>Build Fixes</Text>
          </Card>
        </div>
      )}

      {/* AI Metrics */}
      {aiMetrics && (
        <>
          <Divider />
          <Text weight="semibold" size={500}>AI Metrics</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
            {formatDuration(aiMetrics.performance.durationMs)} duration
            {' \u00b7 '}{formatTokens(aiMetrics.tokens.total)} tokens
            {' \u00b7 '}${aiMetrics.cost.toFixed(3)} cost
            {' \u00b7 '}{aiMetrics.performance.turns} turns
            {aiMetrics.tokens.cacheRead ? ` \u00b7 ${formatTokens(aiMetrics.tokens.cacheRead)} cache read` : ''}
          </Text>
          {aiMetrics.toolUsage && aiMetrics.toolUsage.length > 0 && (
            <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
              Tools: {aiMetrics.toolUsage.map((t) => `${t.name} (${t.count})`).join(', ')}
            </Text>
          )}
        </>
      )}

      {/* Patches by stage */}
      {!isSkipped && allPatches.length > 0 && (
        <>
          <Divider />
          <Text weight="semibold" size={500}>Patches ({allPatches.length})</Text>
          <Accordion multiple collapsible>
            {Array.from(patchesByStage.entries()).map(([stage, patches]) => (
              <AccordionItem key={stage} value={stage}>
                <AccordionHeader>
                  {getStageBadge(stage)} ({patches.length} patches)
                </AccordionHeader>
                <AccordionPanel>
                  <div className={styles.patchList}>
                    {patches.map((patch, i) => {
                      const isApplied = detail.patchStatus?.applied?.includes(patch.id);
                      const isFailed = detail.patchStatus?.failed?.includes(patch.id);
                      return (
                        <div key={`${patch.id}-${i}`} className={styles.patchRow}>
                          <span className={styles.patchId}>{patch.id}</span>
                          <Tooltip content={patch.description} relationship="description">
                            <span className={styles.patchDesc}>{patch.title || patch.description}</span>
                          </Tooltip>
                          {isApplied && <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1, fontSize: '16px' }} />}
                          {isFailed && <DismissCircleRegular style={{ color: tokens.colorPaletteRedForeground1, fontSize: '16px' }} />}
                        </div>
                      );
                    })}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}

      {/* AI Fix Details */}
      {claudePatches.length > 0 && (
        <>
          <Divider />
          <Text weight="semibold" size={500}>AI Fix Details ({claudePatches.length})</Text>
          <Accordion multiple collapsible>
            {claudePatches.map((patch, i) => (
              <AccordionItem key={`${patch.id}-${i}`} value={`${patch.id}-${i}`}>
                <AccordionHeader>
                  {patch.id} — {patch.title || 'AI Fix'}
                  {patch.claudeMetrics && ` — $${patch.claudeMetrics.cost.toFixed(3)} / ${formatDuration(patch.claudeMetrics.performance.durationMs)}`}
                </AccordionHeader>
                <AccordionPanel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {patch.claudeSummary && (
                      <>
                        <Text size={200} weight="semibold">Summary:</Text>
                        <div className={styles.codeBox}>{patch.claudeSummary}</div>
                      </>
                    )}

                    {patch.migrationDetails?.verification && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                        Verification: {patch.migrationDetails.verification.status === 'PASSED' ? (
                          <span style={{ color: tokens.colorPaletteGreenForeground1 }}>PASSED</span>
                        ) : (
                          <span style={{ color: tokens.colorPaletteRedForeground1 }}>FAILED</span>
                        )}
                        {patch.migrationDetails.verification.passedChecks != null && (
                          <> — {patch.migrationDetails.verification.passedChecks}/{patch.migrationDetails.verification.totalChecks} checks</>
                        )}
                      </Text>
                    )}

                    {patch.migrationDetails?.filesModified && patch.migrationDetails.filesModified.length > 0 && (
                      <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                        Files modified: {patch.migrationDetails.filesModified.map((f) => f.split('/').pop()).join(', ')}
                      </Text>
                    )}

                    {patch.claudeActions && patch.claudeActions.length > 0 && (() => {
                      const visibleActions = patch.claudeActions.filter(
                        (a: any) => a.tool && a.tool !== 'unknown' && (a.target || a.action || a.details)
                      );
                      return visibleActions.length > 0 ? (
                      <>
                        <Text size={200} weight="semibold">Actions ({visibleActions.length}):</Text>
                        <div className={styles.patchList}>
                          {visibleActions
                            .slice(0, expandedActions[patch.id] ? undefined : 20)
                            .map((action: any, i: number) => (
                              <div key={i} className={styles.patchRow}>
                                <span style={{ fontWeight: 600, minWidth: '40px' }}>{action.tool}</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: (action.target || action.action) ? undefined : tokens.colorNeutralForeground3 }}>
                                  {action.target || action.action || action.details || '(no description)'}
                                </span>
                              </div>
                            ))}
                          {visibleActions.length > 20 && (
                            <Button
                              appearance="subtle"
                              size="small"
                              onClick={() => setExpandedActions(prev => ({ ...prev, [patch.id]: !prev[patch.id] }))}
                              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                            >
                              {expandedActions[patch.id]
                                ? 'Show less'
                                : `Show all ${visibleActions.length} actions`}
                            </Button>
                          )}
                        </div>
                      </>
                    ) : null;
                    })()}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}

      {/* Third-party dependency updates */}
      {report.thirdPartyUpdates && report.thirdPartyUpdates.updates.length > 0 && (
        <>
          <Divider />
          <Text weight="semibold" size={500}>
            Third-Party Dependency Updates ({report.thirdPartyUpdates.updates.length})
          </Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
            {report.thirdPartyUpdates.totalPackages} total, {report.thirdPartyUpdates.eligiblePackages} eligible
            {report.thirdPartyUpdates.finalBuildSuccess != null && (
              <> — Build: {report.thirdPartyUpdates.finalBuildSuccess ? (
                <span style={{ color: tokens.colorPaletteGreenForeground1 }}>Passed</span>
              ) : (
                <span style={{ color: tokens.colorPaletteRedForeground1 }}>Failed</span>
              )}</>
            )}
          </Text>
          <table className={styles.thirdPartyTable}>
            <thead>
              <tr>
                <th className={styles.thirdPartyTh}>Package</th>
                <th className={styles.thirdPartyTh}>Type</th>
                <th className={styles.thirdPartyTh}>From</th>
                <th className={styles.thirdPartyTh}>To</th>
              </tr>
            </thead>
            <tbody>
              {report.thirdPartyUpdates.updates.map((u) => (
                <tr key={u.name}>
                  <td className={styles.thirdPartyTd} style={{ fontFamily: 'monospace' }}>{u.name}</td>
                  <td className={styles.thirdPartyTd}>{u.isDevDependency ? 'dev' : 'prod'}</td>
                  <td className={styles.thirdPartyTd}>{u.currentVersion}</td>
                  <td className={styles.thirdPartyTd}>{u.latestVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Show message when no third-party updates */}
      {(!report.thirdPartyUpdates || report.thirdPartyUpdates.updates.length === 0) && !isSkipped && (
        <>
          <Divider />
          <Text weight="semibold" size={500}>Third-Party Dependency Updates</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            {report.thirdPartyUpdates
              ? 'No third-party dependency updates were applied'
              : 'Third-party analysis was not run'}
          </Text>
        </>
      )}

      {/* Build errors */}
      {report.buildErrors && report.buildErrors.length > 0 && (
        <>
          <Divider />
          <Text weight="semibold" size={500}>Build Errors</Text>
          <div className={styles.codeBox}>{report.buildErrors.join('\n')}</div>
        </>
      )}

      {/* Markdown report preview */}
      {detail.markdown && (
        <>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text weight="semibold" size={500}>Markdown Report</Text>
            <Button size="small" icon={<ArrowDownloadRegular />} onClick={onDownloadMarkdown}>Download</Button>
          </div>
          <div className={styles.markdownBox}>
            <Markdown remarkPlugins={[remarkGfm]}>{detail.markdown}</Markdown>
          </div>
        </>
      )}
    </div>
  );
};
