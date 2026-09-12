import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Execution, Results, ConfirmRequest } from '../types';
import TablerIcon from './TablerIcon';
import ResultsPane from './editor/ResultsPane';
import { useHeadfulStatus } from '../hooks/useHeadfulStatus';
import { normalizeTaskOutcome, taskOutcomeBadgeClass, taskOutcomeLabel } from '../utils/taskOutcome';

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
        data: result.data ?? result.html ?? '',
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
            } catch {
                setExecution(null);
            } finally {
                setLoading(false);
            }
        };
        loadExecution();
    }, [id]);

    useEffect(() => {
        const name = execution?.taskName?.trim();
        document.title = `${name ? `${name} Execution` : 'Execution Detail'} | Figranium`;
    }, [execution?.taskName]);

    if (loading) {
        return (
            <main className="app-page custom-scrollbar animate-in fade-in duration-500">
                <div className="app-page-inner"><div className="app-panel app-empty-state min-h-[260px]"><TablerIcon name="sync" className="text-2xl theme-text-faint animate-spin" /><p className="text-xs theme-text-faint">Loading execution…</p></div></div>
            </main>
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
    const outcome = normalizeTaskOutcome(execution.outcome, execution.status);
    const outcomeClass = taskOutcomeBadgeClass(outcome);
    const metrics = [
        { label: 'Outcome', value: taskOutcomeLabel(outcome), mono: false },
        { label: 'Started', value: new Date(execution.timestamp).toLocaleString(), mono: false },
        { label: 'Source', value: execution.source, mono: true },
        { label: 'Mode', value: execution.mode, mono: true },
        { label: 'Runtime', value: `${execution.durationMs}ms`, mono: true },
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
                            <h1 className="app-page-title font-mono">{execution.mode}</h1>
                        )}
                        <p className="text-xs theme-text-faint font-mono truncate max-w-3xl">{execution.url || execution.path}</p>
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
                                <span className={`app-badge mt-3 ${outcomeClass}`}>{value}</span>
                            ) : (
                                <div className={`mt-3 text-xs font-bold theme-text break-words ${mono ? 'font-mono' : ''}`}>{value}</div>
                            )}
                        </div>
                    ))}
                </section>

                <section className="app-panel p-6 flex flex-col min-h-[420px]">
                        <div className="flex items-center justify-between border-b theme-border pb-4 mb-6">
                            <span className="text-xs font-bold theme-text-muted tracking-widest">Output</span>
                        </div>
                        {results ? (
                            <ResultsPane
                                results={results}
                                isExecuting={false}
                                mode={execution.mode}
                                onConfirm={onConfirm}
                                onNotify={onNotify}
                                fullWidth
                                useNovnc={useNovnc}
                            />
                        ) : (
                            <div className="text-xs theme-text-faint tracking-widest">No output captured.</div>
                        )}
                </section>
            </div>
        </main>
    );
};

export default ExecutionDetailScreen;
