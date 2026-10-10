import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Execution, Results, ConfirmRequest } from '../types';
import TablerIcon from './TablerIcon';
import OutcomeIcon from './OutcomeIcon';
import ResultsPane from './editor/ResultsPane';
import { useHeadfulStatus } from '../hooks/useHeadfulStatus';
import { normalizeTaskOutcome } from '../utils/taskOutcome';
import { ExecutionDetailSkeleton } from './common/Skeleton';

interface ExecutionDetailScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const toResults = (exec: Execution): Results | null => {
    if (!exec.result) return null;
    const result = exec.result || {};
    return {
        url: exec.url || result.url || '',
        finalUrl: result.final_url || result.finalUrl,
        html: result.html,
        data: typeof result.data === 'string' && result.data.startsWith('[Truncated from execution history')
            ? ''
            : (result.data ?? result.html ?? ''),
        screenshotUrl: result.screenshot_url || result.screenshotUrl,
        logs: result.logs || [],
        timestamp: new Date(exec.timestamp).toLocaleTimeString(),
        outcome: normalizeTaskOutcome(exec.outcome || result.outcome, exec.status)
    };
};

const ExecutionDetailScreen: React.FC<ExecutionDetailScreenProps> = ({ onConfirm, onNotify }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [execution, setExecution] = useState<Execution | null>(null);
    const [loading, setLoading] = useState(false);
    const [fullResultLoading, setFullResultLoading] = useState(false);
    const [fullResultLoaded, setFullResultLoaded] = useState(false);
    const useNovnc = useHeadfulStatus();

    useEffect(() => {
        const loadExecution = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const res = await fetch(`/api/executions/${id}`);
                if (!res.ok) throw new Error('Failed to load execution');
                const data = await res.json();
                setExecution(data.execution || null);
                setFullResultLoaded(false);
            } catch {
                setExecution(null);
            } finally {
                setLoading(false);
            }
        };
        loadExecution();
    }, [id]);

    useEffect(() => {
        if (!id) return;
        const source = new EventSource('/api/executions/live', { withCredentials: true });
        source.onmessage = async () => {
            try {
                const res = await fetch(`/api/executions/${id}`);
                if (!res.ok) return;
                const data = await res.json();
                setExecution((current) => {
                    const next = data.execution || null;
                    if (fullResultLoaded && current?.result && next?.result?.hasFullResult) {
                        return { ...next, result: current.result };
                    }
                    return next;
                });
            } catch {
                // Keep the last known execution visible if a live refresh fails.
            }
        };
        return () => source.close();
    }, [fullResultLoaded, id]);

    useEffect(() => {
        const name = execution?.taskName?.trim();
        document.title = `${name ? `${name} Execution` : 'Execution Detail'} | Figranium`;
    }, [execution?.taskName]);

    const loadFullResult = async () => {
        if (!id || !execution?.result?.hasFullResult || fullResultLoading) return;
        setFullResultLoading(true);
        try {
            const res = await fetch(`/api/executions/${id}/result`);
            if (!res.ok) throw new Error('Full result is unavailable.');
            const data = await res.json();
            setExecution((current) => current ? { ...current, result: data.result } : current);
            setFullResultLoaded(true);
        } catch (error) {
            onNotify(error instanceof Error ? error.message : 'Could not load the full result.', 'error');
        } finally {
            setFullResultLoading(false);
        }
    };

    if (loading) {
        return (
            <ExecutionDetailSkeleton />
        );
    }

    if (!execution) {
        return (
            <main className="app-page custom-scrollbar animate-in fade-in duration-500">
                <div className="app-page-inner">
                    <button
                        onClick={() => navigate('/executions')}
                        className="app-button-secondary"
                        title="Back to Executions (Alt + 3)"
                        aria-label="Back to Executions (Alt + 3)"
                    >
                        <TablerIcon name="arrow_back" className="text-[16px]" />
                        Back
                    </button>
                    <div className="app-panel app-empty-state mt-6"><div className="app-empty-icon"><TablerIcon name="search_off" className="text-2xl" /></div><h2 className="text-sm font-bold theme-text">Execution not found</h2><p className="text-xs theme-text-faint">This run may have been deleted.</p></div>
                </div>
            </main>
        );
    }

    const results = toResults(execution);
    const phase = execution.phase || 'finished';
    const outcome = phase === 'finished' ? normalizeTaskOutcome(execution.outcome, execution.status) : null;
    const metrics = [
        { label: 'Outcome', value: phase, mono: false },
        { label: 'Started', value: new Date(execution.timestamp).toLocaleString(), mono: false },
        { label: 'Source', value: execution.source, mono: false },
        { label: 'Mode', value: execution.mode, mono: false },
        { label: 'Runtime', value: execution.durationMs === undefined ? '—' : `${execution.durationMs}ms`, mono: false },
    ];

    return (
        <main className="app-page custom-scrollbar animate-in fade-in duration-500">
            <div className="app-page-inner">
                <header className="app-page-header">
                    <div className="space-y-2">
                        <div className="app-page-kicker">Execution detail</div>
                        {execution.taskName ? (
                            <h1 className="app-page-title">{execution.taskName}</h1>
                        ) : (
                            <h1 className="app-page-title">{execution.mode}</h1>
                        )}
                        <p className="text-xs theme-text-faint truncate max-w-3xl">{execution.url || execution.path}</p>
                    </div>
                    <button
                        onClick={() => navigate('/executions')}
                        className="app-button-secondary"
                        title="Back to Executions (Alt + 3)"
                        aria-label="Back to Executions (Alt + 3)"
                    >
                        <TablerIcon name="arrow_back" className="text-[16px]" />
                        Back
                    </button>
                </header>

                <section className="app-panel grid grid-cols-5 mb-6 max-lg:grid-cols-2 overflow-hidden">
                    {metrics.map(({ label, value, mono }, index) => (
                        <div key={label} className="app-metric !py-4">
                            <div className="app-metric-label">{label}</div>
                            {index === 0 ? (
                                <div className="mt-3">
                                    {phase === 'queued' ? <span role="status" aria-label="Queued" title="Queued"><TablerIcon name="hourglass_empty" className="text-xl text-amber-400" /><span className="sr-only">Queued</span></span>
                                        : phase === 'running' ? <span role="status" aria-label="Running" title="Running"><TablerIcon name="progress_activity" className="text-xl text-blue-400 animate-spin" /><span className="sr-only">Running</span></span>
                                            : outcome ? <OutcomeIcon outcome={outcome} /> : null}
                                </div>
                            ) : (
                                <div className={`mt-3 text-xs font-bold theme-text break-words ${mono ? 'font-mono' : ''}`}>{value}</div>
                            )}
                        </div>
                    ))}
                </section>

                <section className="app-panel p-6 flex flex-col min-h-[420px]">
                        <div className="flex items-center justify-between border-b theme-border pb-4 mb-6">
                            <span className="text-xs font-bold theme-text-muted tracking-widest">Output</span>
                            {execution.result?.hasFullResult && !fullResultLoaded && (
                                <button type="button" onClick={loadFullResult} disabled={fullResultLoading} className="app-button-secondary text-xs disabled:opacity-50">
                                    <TablerIcon name={fullResultLoading ? 'sync' : 'visibility'} className={`text-base ${fullResultLoading ? 'animate-spin' : ''}`} />
                                    {fullResultLoading ? 'Loading…' : 'Load full data'}
                                </button>
                            )}
                        </div>
                        <ResultsPane
                            results={results || {
                                url: execution.url || '',
                                logs: [],
                                timestamp: new Date(execution.timestamp).toLocaleTimeString(),
                                outcome: outcome || undefined,
                            }}
                            isExecuting={phase === 'queued' || phase === 'running'}
                            mode={execution.mode}
                            runId={id}
                            onConfirm={onConfirm}
                            onNotify={onNotify}
                            fullWidth
                            useNovnc={useNovnc}
                        />
                </section>
            </div>
        </main>
    );
};

export default ExecutionDetailScreen;
