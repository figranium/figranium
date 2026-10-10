import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import TablerIcon from './TablerIcon';
import OutcomeIcon from './OutcomeIcon';
import { Execution, ConfirmRequest } from '../types';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { normalizeTaskOutcome } from '../utils/taskOutcome';
import { formatLabel } from '../utils/taskUtils';
import { ListSkeleton } from './common/Skeleton';

const EXECUTION_ITEM_SIZE = 94;
const EXECUTION_LIST_MAX_VISIBLE = 7;
const EXECUTION_OVERSCAN = 4;
const FILTER_LABELS = {
    all: 'All',
    editor: 'Editor',
    api: 'API',
} as const;

interface ExecutionListItemData {
    items: Execution[];
    deleteExecution: (id: string) => void;
    navigate: NavigateFunction;
}

const renderExecutionRow = ({ index, style, data }: ListChildComponentProps<ExecutionListItemData>) => {
    const execution = data.items[index];
    if (!execution) return null;
    const phase = execution.phase || 'finished';
    const outcome = phase === 'finished' ? normalizeTaskOutcome(execution.outcome, execution.status) : null;
    const sourceLabel = execution.source === 'api' ? 'API' : formatLabel(execution.source || 'editor');
    const modeLabel = formatLabel(execution.mode || 'agent');

    return (
        <div style={style}>
            <div
                onClick={() => data.navigate(`/executions/${execution.id}`)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        data.navigate(`/executions/${execution.id}`);
                    }
                }}
                role="button"
                tabIndex={0}
                className="app-list-row h-full grid grid-cols-[minmax(240px,1.5fr)_110px_120px_120px_44px] items-center gap-4 px-5 max-lg:grid-cols-[minmax(220px,1fr)_110px_44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <TablerIcon name={execution.source === 'api' ? 'cloud' : 'monitor'} className="text-xl theme-text-faint shrink-0" />
                    <div className="min-w-0">
                        {execution.taskName ? (
                            <div className="text-xs font-bold theme-text truncate">{execution.taskName}</div>
                        ) : (
                            <div className="text-xs font-bold theme-text truncate">{modeLabel}</div>
                        )}
                        <div className="mt-1 text-[10px] theme-text-faint truncate">{execution.url || new Date(execution.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div>
                    {phase === 'queued' ? (
                        <span role="status" aria-label="Queued" title="Queued"><TablerIcon name="hourglass_empty" className="text-xl text-amber-400" /><span className="sr-only">Queued</span></span>
                    ) : phase === 'running' ? (
                        <span role="status" aria-label="Running" title="Running"><TablerIcon name="progress_activity" className="text-xl text-blue-400 animate-spin" /><span className="sr-only">Running</span></span>
                    ) : outcome ? <OutcomeIcon outcome={outcome} /> : null}
                </div>
                <div className="text-[11px] theme-text-muted max-lg:hidden">{sourceLabel} · {modeLabel}</div>
                <div className="max-lg:hidden">
                    <div className="text-[11px] theme-text-muted">{execution.durationMs === undefined ? '—' : `${execution.durationMs}ms`}</div>
                    <div className="mt-1 text-[10px] theme-text-faint">{new Date(execution.timestamp).toLocaleString()}</div>
                </div>
                <button
                    onClick={(event) => { event.stopPropagation(); data.deleteExecution(execution.id); }}
                    className="p-2 theme-text-faint hover:text-red-400 transition-colors"
                    aria-label={`Delete execution ${execution.id}`}
                    title="Delete execution"
                >
                    <TablerIcon name="delete" className="text-base" />
                </button>
            </div>
        </div>
    );
};

interface ExecutionsScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const ExecutionsScreen: React.FC<ExecutionsScreenProps> = ({ onConfirm, onNotify }) => {
    const navigate = useNavigate();
    const [executions, setExecutions] = useState<Execution[]>([]);
    const [filter, setFilter] = useState<'all' | 'editor' | 'api'>('all');
    const [loading, setLoading] = useState(false);

    const loadExecutions = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/executions');
            if (!response.ok) throw new Error('Failed to load');
            const data = await response.json();
            setExecutions(Array.isArray(data.executions) ? data.executions : []);
        } catch {
            setExecutions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearExecutions = useCallback(async () => {
        if (!await onConfirm('Clear all executions?')) return;
        const response = await fetch('/api/executions/clear', { method: 'POST' });
        if (response.ok) {
            onNotify('Executions cleared.', 'success');
            loadExecutions();
        } else onNotify('Clear failed.', 'error');
    }, [loadExecutions, onConfirm, onNotify]);

    const deleteExecution = useCallback(async (id: string) => {
        if (!await onConfirm('Delete this execution?')) return;
        const response = await fetch(`/api/executions/${id}`, { method: 'DELETE' });
        if (response.ok) {
            onNotify('Execution deleted.', 'success');
            setExecutions((previous) => previous.filter((execution) => execution.id !== id));
        } else onNotify('Delete failed.', 'error');
    }, [onConfirm, onNotify]);

    useEffect(() => { loadExecutions(); }, [loadExecutions]);

    useEffect(() => {
        const source = new EventSource('/api/executions/live', { withCredentials: true });
        source.onmessage = () => { loadExecutions(); };
        return () => source.close();
    }, [loadExecutions]);

    const filtered = useMemo(() => executions.filter((execution) => filter === 'all' || execution.source === filter), [executions, filter]);
    const metrics = useMemo(() => {
        let successful = 0;
        let failed = 0;
        let duration = 0;
        let api = 0;
        for (const execution of executions) {
            if ((execution.phase || 'finished') !== 'finished') {
                if (execution.source === 'api') api += 1;
                continue;
            }
            const outcome = normalizeTaskOutcome(execution.outcome, execution.status);
            if (outcome === 'success') successful += 1;
            if (outcome === 'error' || outcome === 'crashed' || outcome === 'anti_bot') failed += 1;
            if (execution.source === 'api') api += 1;
            duration += Number(execution.durationMs) || 0;
        }
        const finished = executions.filter((execution) => (execution.phase || 'finished') === 'finished');
        return [
            { label: 'Total runs', value: executions.length },
            { label: 'Successful', value: successful },
            { label: 'Failed', value: failed },
            { label: 'Average runtime', value: finished.length ? `${Math.round(duration / finished.length)}ms` : '0ms' },
            { label: 'API runs', value: api },
        ];
    }, [executions]);
    const itemData = useMemo(() => ({ items: filtered, deleteExecution, navigate }), [filtered, deleteExecution, navigate]);

    return (
        <main className="app-page custom-scrollbar animate-in fade-in duration-500">
            <div className="app-page-inner">
                <header className="app-page-header">
                    <div><h1 className="app-page-title">Executions</h1><p className="app-page-subtitle">Run history and task outcomes</p></div>
                    <div className="app-toolbar">
                        <button onClick={loadExecutions} disabled={loading} className="app-button-secondary" aria-busy={loading}>
                            <TablerIcon name="sync" className={`text-base ${loading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button onClick={clearExecutions} className="app-button-danger"><TablerIcon name="delete" className="text-base" /> Clear all</button>
                    </div>
                </header>

                <section className="app-panel app-metrics" aria-label="Execution summary">
                    {metrics.map((metric) => <div className="app-metric" key={metric.label}><div className="app-metric-label">{metric.label}</div><div className="app-metric-value">{metric.value}</div></div>)}
                </section>

                <section className="app-panel overflow-hidden">
                    <div className="app-panel-header">
                        <div><h2 className="text-sm font-bold theme-text">Run history</h2><p className="mt-1 text-[10px] tracking-[0.14em] theme-text-faint">{filtered.length} executions</p></div>
                        <div role="tablist" className="app-toolbar rounded-xl border theme-border p-1 theme-input">
                            {(['all', 'editor', 'api'] as const).map((mode) => (
                                <button key={mode} role="tab" aria-selected={filter === mode} onClick={() => setFilter(mode)} className={`min-h-8 px-3 rounded-lg text-[10px] font-bold tracking-widest transition-all ${filter === mode ? 'theme-accent-bg' : 'theme-text-faint hover:theme-text'}`}>{FILTER_LABELS[mode]}</button>
                            ))}
                        </div>
                    </div>
                    {loading ? (
                        <div className="p-5"><ListSkeleton rows={4} /></div>
                    ) : filtered.length ? (
                        <FixedSizeList height={Math.min(Math.max(EXECUTION_ITEM_SIZE, filtered.length * EXECUTION_ITEM_SIZE), EXECUTION_ITEM_SIZE * EXECUTION_LIST_MAX_VISIBLE)} itemCount={filtered.length} itemSize={EXECUTION_ITEM_SIZE} width="100%" overscanCount={EXECUTION_OVERSCAN} itemData={itemData} className="custom-scrollbar">
                            {renderExecutionRow}
                        </FixedSizeList>
                    ) : (
                        <div className="app-empty-state">
                            <div className="app-empty-icon"><TablerIcon name="history" className="text-2xl" /></div>
                            <div><h3 className="text-sm font-bold theme-text">No executions found</h3><p className="mt-2 text-xs theme-text-faint">Run a Task from the dashboard or editor to see it here.</p></div>
                            <button onClick={() => navigate('/dashboard')} className="app-button-primary">Go to Tasks</button>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
};

export default ExecutionsScreen;
