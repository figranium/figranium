import { useEffect, useRef, useState, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import TablerIcon from '../TablerIcon';
import { ConfirmRequest, Results, CaptureEntry } from '../../types';
import CaptureCard from '../CaptureCard';
import CodeEditor from '../CodeEditor';
import JSZip from 'jszip';
import GithubStarPrompt from '../GithubStarPrompt';
import FileTypeIcon from '../FileTypeIcon';
import { normalizeTaskOutcome, taskOutcomeIcon, taskOutcomeLabel } from '../../utils/taskOutcome';
import { formatLabel } from '../../utils/taskUtils';

interface ResultsPaneProps {
    results: Results | null;
    pinnedResults?: Results | null;
    isExecuting: boolean;
    isHeadful?: boolean;
    runId?: string | null;
    mode?: string;
    onConfirm: (request: ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
    onPin?: (results: Results) => void;
    onUnpin?: () => void;
    fullWidth?: boolean;
    useNovnc?: boolean | null;
}

import { MAX_COPY_CHARS, ResultsSkeleton, formatSize, normalizeBoolean, getResultsCopyPayload, getTruncatedCopyText, getFullCopyText, getResultsPreview, getTableData, getExportPayload, downloadText } from './resultsUtils';

const ResultsPane: React.FC<ResultsPaneProps> = ({ results, pinnedResults, isExecuting, isHeadful, runId, onConfirm, onNotify, onPin, onUnpin, fullWidth, useNovnc }) => {
    const [copied, setCopied] = useState<string | null>(null);
    const [dataView, setDataView] = useState<'raw' | 'table'>('raw');
    const [mainView, setMainView] = useState<'data' | 'downloads'>('data');
    const [resultView, setResultView] = useState<'latest' | 'pinned'>(() => (pinnedResults && !results ? 'pinned' : 'latest'));

    const headfulViewer = useMemo(() => {
        if (useNovnc === null) return 'checking';
        return useNovnc ? 'novnc' : 'native';
    }, [useNovnc]);

    const [capturesOpen, setCapturesOpen] = useState(false);
    const [capturesLoading, setCapturesLoading] = useState(false);
    const [captures, setCaptures] = useState<CaptureEntry[]>([]);
    const [screenshotState, setScreenshotState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
    const [fallbackScreenshotUrl, setFallbackScreenshotUrl] = useState<string | null>(null);
    const [failedPrimaryScreenshotUrl, setFailedPrimaryScreenshotUrl] = useState<string | null>(null);
    const wasExecutingRef = useRef(isExecuting);
    const headfulFrameRef = useRef<HTMLDivElement | null>(null);
    const activeResults = resultView === 'pinned' && pinnedResults ? pinnedResults : results;
    const tableData = useMemo(() => getTableData(activeResults?.data), [activeResults?.data]);
    const preview = useMemo(() => activeResults && activeResults.data !== undefined && activeResults.data !== null && activeResults.data !== ''
        ? getResultsPreview(activeResults)
        : null, [activeResults?.data]);
    const primaryScreenshotUrl = activeResults?.screenshotUrl || null;
    const screenshotSrc = primaryScreenshotUrl && primaryScreenshotUrl !== failedPrimaryScreenshotUrl
        ? primaryScreenshotUrl
        : fallbackScreenshotUrl;
    const hasUsableResults = Boolean(activeResults && (
        screenshotSrc
        || activeResults.logs?.length
        || (activeResults.downloads && activeResults.downloads.length > 0)
        || (activeResults.data !== undefined && activeResults.data !== null && activeResults.data !== '')
    ));
    const renderCellValue = (value: any) => {
        const boolValue = normalizeBoolean(value);
        if (boolValue !== null) {
            if (!boolValue) return '';
            return <TablerIcon name="check" className="text-xs text-blue-400" />;
        }
        if (value !== null && typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return value ?? '';
    };

    const loadCaptures = async () => {
        setCapturesLoading(true);
        try {
            const query = runId ? `?runId=${encodeURIComponent(runId)}` : '';
            const res = await fetch(`/api/data/captures${query}`);
            const data = res.ok ? await res.json() : { captures: [] };
            setCaptures(Array.isArray(data.captures) ? data.captures : []);
        } catch {
            setCaptures([]);
        } finally {
            setCapturesLoading(false);
        }
    };

    useEffect(() => {
        let active = true;
        setFallbackScreenshotUrl(null);
        setFailedPrimaryScreenshotUrl(null);
        if (activeResults?.screenshotUrl || !runId) return () => { active = false; };

        void (async () => {
            try {
                const res = await fetch(`/api/data/captures?runId=${encodeURIComponent(runId)}`);
                const data = res.ok ? await res.json() : { captures: [] };
                const capture = Array.isArray(data.captures)
                    ? data.captures.find((entry: CaptureEntry) => entry.type === 'screenshot')
                    : null;
                if (active && capture?.url) setFallbackScreenshotUrl(capture.url);
            } catch {
                // A missing capture is an expected result for some execution modes.
            }
        })();

        return () => { active = false; };
    }, [activeResults?.screenshotUrl, runId]);

    useEffect(() => {
        setScreenshotState(screenshotSrc ? 'loading' : 'idle');
    }, [screenshotSrc]);

    useEffect(() => {
        if (tableData) {
            setDataView('table');
        } else {
            setDataView('raw');
        }
        if (!activeResults?.downloads || activeResults.downloads.length === 0) {
            setMainView('data');
        } else if (!activeResults?.data) {
            setMainView('downloads');
        }
    }, [activeResults]);

    useEffect(() => {
        if (results) {
            setResultView('latest');
        }
    }, [results]);

    useEffect(() => {
        if (!pinnedResults && resultView === 'pinned') {
            setResultView('latest');
        }
    }, [pinnedResults, resultView]);

    useEffect(() => {
        if (wasExecutingRef.current && !isExecuting) {
            setCapturesOpen(false);
        }
        wasExecutingRef.current = isExecuting;
    }, [isExecuting]);

    useEffect(() => {
        if (!capturesOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setCapturesOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [capturesOpen]);


    const handleCopy = async (text: string, id: string, options?: { skipSizeConfirm?: boolean; truncatedNotice?: boolean }) => {
        if (!text) {
            onNotify('Nothing to copy.', 'error');
            return;
        }
        let copyText = text;
        if (!options?.skipSizeConfirm && text.length > MAX_COPY_CHARS) {
            const confirmed = await onConfirm({
                message: `Copying ${formatSize(text.length)} may freeze your browser.`,
                confirmLabel: 'Copy full',
                cancelLabel: 'Copy segment'
            });
            if (!confirmed) {
                copyText = text.slice(0, MAX_COPY_CHARS);
            }
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(copyText);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = copyText;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
            if (options?.truncatedNotice) {
                onNotify('Copied truncated data.', 'success');
            } else if (copyText.length !== text.length) {
                onNotify('Copied a truncated preview.', 'success');
            }
        } catch (err) {
            console.error('Copy failed:', err);
            onNotify('Copy failed.', 'error');
        }
    };

    if (isHeadful && resultView === 'latest') {
        const { origin, hostname } = window.location;
        const theme = document.documentElement.dataset.theme || 'dark';
        const headfulUrl = `${origin}/novnc.html?host=${hostname}&path=websockify&theme=${encodeURIComponent(theme)}`;
        const requestFullscreen = () => {
            const target = headfulFrameRef.current;
            if (!target) return;
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {
                    // ignore
                });
                return;
            }
            target.requestFullscreen?.().catch(() => {
                // ignore
            });
        };
        if (headfulViewer === 'native') {
            return (
                <div className="glass-card rounded-[32px] overflow-hidden h-[80vh] w-full relative flex flex-col items-center justify-center p-8 text-center gap-4">
                    <div className="text-[12px] font-bold tracking-widest text-white">
                        Headful Session Active
                    </div>
                    <div className="text-xs font-bold tracking-widest text-amber-500/80 max-w-lg leading-relaxed">
                        Figranium is not optimized for native browser windows. Please install the proper tools for stability (Xvfb, x11vnc, websockify) or simply use the Docker version.
                    </div>
                </div>
            );
        }
        if (headfulViewer === 'checking') {
            return (
                <div className="glass-card rounded-[32px] overflow-hidden h-[80vh] w-full relative flex items-center justify-center">
                    <div className="text-xs font-bold tracking-widest text-gray-500">
                        Checking headful viewer...
                    </div>
                </div>
            );
        }
        return (
            <div ref={headfulFrameRef} className="glass-card rounded-[32px] overflow-hidden h-[80vh] w-full relative">
                <button
                    type="button"
                    onClick={requestFullscreen}
                    className="absolute top-4 right-4 z-10 px-3 py-2 rounded-xl border border-white/20 bg-black/40 text-xs font-bold tracking-widest text-white/80 hover:bg-black/60 transition-all"
                    title="Toggle fullscreen"
                >
                    Fullscreen
                </button>
                <iframe
                    src={headfulUrl}
                    className="absolute inset-0 w-full h-full"
                    title="Headful Browser"
                />
            </div>
        );
    }

    if (!hasUsableResults) {
        return <ResultsSkeleton animated={isExecuting && resultView === 'latest'} />;
    }

    const containerClassName = fullWidth ? 'space-y-8 relative z-10 w-full' : 'space-y-12 relative z-10 max-w-5xl mx-auto';
    const normalizedOutcome = normalizeTaskOutcome(activeResults?.outcome);
    const statusIndicator = resultView === 'pinned'
        ? { name: 'star', className: 'text-amber-400', label: 'Pinned' }
        : isExecuting
            ? { name: 'progress_activity', className: 'text-blue-400 animate-spin', label: 'Running' }
            : { ...taskOutcomeIcon(normalizedOutcome), label: taskOutcomeLabel(normalizedOutcome) };
    const showCapture = Boolean(screenshotSrc && screenshotState !== 'error');

    return (
        <div className={containerClassName}>
            {!isExecuting && activeResults && normalizeTaskOutcome(activeResults.outcome) === 'success' && (activeResults.data !== undefined || activeResults.screenshotUrl || activeResults.downloads) && (
                <GithubStarPrompt runId={runId} />
            )}
            <div className="flex items-end justify-between border-b border-white/5 pb-4">
                <div className="space-y-2 min-w-0 mr-3">
                    <p className="text-xs font-bold text-gray-500 tracking-[0.3em]">Results</p>
                    <h2 className="text-sm text-white truncate tracking-tight">
                        {activeResults?.finalUrl || activeResults?.url || ''}
                    </h2>
                </div>
                <div role="status" aria-label={statusIndicator.label} title={statusIndicator.label} className="shrink-0 pb-0.5">
                    <TablerIcon name={statusIndicator.name} className={`text-2xl ${statusIndicator.className}`} />
                    <span className="sr-only">{statusIndicator.label}</span>
                </div>
            </div>

            <div className={`grid grid-cols-1 ${fullWidth ? 'gap-6' : `${showCapture ? 'xl:grid-cols-2' : ''} gap-8`}`}>
                {showCapture && <div className={`glass-card overflow-hidden flex flex-col ${fullWidth ? 'rounded-2xl min-h-[260px]' : 'rounded-[32px] min-h-[400px]'}`}>
                    <div className={`border-b border-white/5 flex items-center justify-between text-xs font-bold text-gray-500 tracking-widest ${fullWidth ? 'p-4' : 'p-6'}`}>
                        <span>Screenshot</span>
                        <div className="flex items-center gap-2">
                            <span className="text-white/20">{activeResults?.timestamp || '--:--:--'}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setCapturesOpen(true);
                                    loadCaptures();
                                }}
                                className="px-3 py-2 rounded-xl border border-white/10 text-xs font-bold tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-all"
                            >
                                View All Captures
                            </button>
                        </div>
                    </div>
                    <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden">
                        {screenshotSrc ? (
                            <>
                                {screenshotState === 'loading' && <div className="absolute inset-4 results-skeleton-line results-skeleton-shine" />}
                                <img
                                    key={screenshotSrc}
                                    src={screenshotSrc}
                                    alt="Task result screenshot"
                                    onLoad={() => setScreenshotState('loaded')}
                                    onError={() => {
                                        if (screenshotSrc === primaryScreenshotUrl && primaryScreenshotUrl) {
                                            setFailedPrimaryScreenshotUrl(primaryScreenshotUrl);
                                            if (runId) {
                                                void fetch(`/api/data/captures?runId=${encodeURIComponent(runId)}`)
                                                    .then((res) => res.ok ? res.json() : { captures: [] })
                                                    .then((data) => {
                                                        const capture = Array.isArray(data.captures)
                                                            ? data.captures.find((entry: CaptureEntry) => entry.type === 'screenshot' && entry.url !== primaryScreenshotUrl)
                                                            : null;
                                                        setFallbackScreenshotUrl(capture?.url || null);
                                                    })
                                                    .catch(() => setFallbackScreenshotUrl(null));
                                            }
                                        } else {
                                            setFallbackScreenshotUrl(null);
                                        }
                                        setScreenshotState('error');
                                    }}
                                    className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${screenshotState === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
                                />
                            </>
                        ) : null}
                    </div>
                </div>}
                <div className={`glass-card flex flex-col ${fullWidth ? 'rounded-2xl p-4 h-[240px]' : 'rounded-[32px] p-8 h-[400px]'}`}>
                    <div className={`flex items-center justify-between border-b border-white/5 ${fullWidth ? 'mb-4 pb-3' : 'mb-6 pb-4'}`}>
                        <span className="text-xs font-bold text-gray-500 tracking-widest">Activity Log</span>
                        <button
                            onClick={() => handleCopy((activeResults?.logs || []).join('\n'), 'logs')}
                            className={`px-3 py-1.5 border text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${copied === 'logs' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}
                            title="Copy activity log"
                            aria-label="Copy activity log"
                        >
                            <TablerIcon name={copied === 'logs' ? "check" : "content_copy"} className="text-[12px]" />
                            {copied === 'logs' ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <div className="flex-1 font-mono text-xs text-gray-400 space-y-2 overflow-y-auto custom-scrollbar pr-2">
                        {activeResults?.logs?.map((log: string, i: number) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-white/10 shrink-0">›</span> <span>{log}</span>
                            </div>
                        ))}
                        {isExecuting && resultView === 'latest' && (!activeResults?.logs || activeResults?.logs.length === 0) && <div className="animate-pulse">Waiting for activity…</div>}
                    </div>
                </div>
            </div>

            {capturesOpen && createPortal(
                <div className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setCapturesOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-labelledby="captures-dialog-title" className="glass-card theme-modal-elevation border theme-border-strong rounded-[32px] w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-surface)' }} onClick={(event) => event.stopPropagation()}>
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <div>
                                <div className="text-xs font-bold text-gray-500 tracking-widest">Captures</div>
                                <div id="captures-dialog-title" className="text-sm font-bold text-white">Recordings and Screenshots</div>
                            </div>
                            <button
                                onClick={() => setCapturesOpen(false)}
                                className="px-3 py-2 border text-xs font-bold rounded-xl transition-all bg-white/5 border-white/10 text-white hover:bg-white/10"
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            {capturesLoading && (
                                <div className="text-xs text-gray-500 tracking-widest">Loading captures...</div>
                            )}
                            {!capturesLoading && captures.length === 0 && (
                                <div className="text-xs text-gray-600 tracking-widest">No captures found.</div>
                            )}
                            {!capturesLoading && captures.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{captures.map((capture) => <CaptureCard key={capture.name} capture={capture} />)}</div>}
                        </div>
                    </div>
                </div>, document.body
            )}

            <div className={`glass-card flex flex-col relative ${fullWidth ? 'rounded-2xl p-4' : 'rounded-[32px] p-8'}`}>
                <div className={`flex items-center justify-between border-b border-white/5 ${fullWidth ? 'flex-wrap gap-2 pb-4 mb-4' : 'pb-4 mb-6'}`}>
                    <span className="text-xs font-bold text-gray-500 tracking-widest">
                        {mainView === 'downloads' ? 'Downloads' : 'Data'}
                    </span>
                    <div className="flex items-center gap-2">
                        {activeResults?.downloads && activeResults.downloads.length > 0 && (
                            <div role="tablist" className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                                {(['data', 'downloads'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        role="tab"
                                        aria-selected={mainView === mode}
                                        onClick={() => setMainView(mode)}
                                        className={`px-3 py-1 rounded text-xs font-bold tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${mainView === mode ? 'bg-white text-black focus-visible:ring-blue-500' : 'text-gray-500 hover:text-white focus-visible:ring-white/50'}`}
                                    >
                                        {formatLabel(mode)}
                                    </button>
                                ))}
                            </div>
                        )}
                        {pinnedResults && (
                            <div role="tablist" className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                                {(['latest', 'pinned'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        role="tab"
                                        aria-selected={resultView === mode}
                                        onClick={() => setResultView(mode)}
                                        className={`px-3 py-1 rounded text-xs font-bold tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${resultView === mode ? 'bg-white text-black focus-visible:ring-blue-500' : 'text-gray-500 hover:text-white focus-visible:ring-white/50'}`}
                                    >
                                        {formatLabel(mode)}
                                    </button>
                                ))}
                            </div>
                        )}
                        {tableData && mainView === 'data' && (
                            <div role="tablist" className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                                {(['table', 'raw'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        role="tab"
                                        aria-selected={dataView === mode}
                                        onClick={() => setDataView(mode)}
                                        className={`px-3 py-1 rounded text-xs font-bold tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${dataView === mode ? 'bg-white text-black focus-visible:ring-blue-500' : 'text-gray-500 hover:text-white focus-visible:ring-white/50'}`}
                                    >
                                        {mode === 'table' ? 'Table' : 'Raw'}
                                    </button>
                                ))}
                            </div>
                        )}
                        {resultView === 'pinned' ? (
                            <button
                                onClick={() => {
                                    onUnpin?.();
                                    setResultView('latest');
                                }}
                                className="px-3 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-white/5 border-white/10 text-amber-200 hover:bg-white/10"
                                title="Unpin data"
                            >
                                Unpin
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    if (!activeResults) {
                                        onNotify('No data to pin.', 'error');
                                        return;
                                    }
                                    onPin?.(activeResults);
                                    setResultView('pinned');
                                }}
                                className="px-3 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                title="Pin data"
                            >
                                {pinnedResults ? 'Update Pin' : 'Pin'}
                            </button>
                        )}
                        {mainView === 'data' && (
                            <button
                                onClick={() => {
                                    const payload = getExportPayload(activeResults?.data, tableData);
                                    if (!payload) {
                                        onNotify('No data to export.', 'error');
                                        return;
                                    }
                                    const name = `results-data-${new Date().toISOString().replace(/[:.]/g, '-')}.${payload.ext}`;
                                    downloadText(name, payload.content, payload.mime);
                                    onNotify(`Exported ${payload.ext.toUpperCase()}.`, 'success');
                                }}
                                className="px-3 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                title="Export extracted data"
                            >
                                Export
                            </button>
                        )}
                        {mainView === 'downloads' && (
                            <button
                                onClick={async () => {
                                    if (!activeResults?.downloads || activeResults.downloads.length === 0) return;
                                    if (activeResults.downloads.length === 1) {
                                        const file = activeResults.downloads[0];
                                        const link = document.createElement('a');
                                        link.href = file.path;
                                        link.download = file.name;
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                        onNotify(`Downloading ${file.name}`, 'success');
                                        return;
                                    }
                                    onNotify('Generating ZIP...', 'success');
                                    try {
                                        const zip = new JSZip();
                                        for (const file of activeResults.downloads) {
                                            const res = await fetch(file.path);
                                            const blob = await res.blob();
                                            zip.file(file.name, blob);
                                        }
                                        const content = await zip.generateAsync({ type: 'blob' });
                                        const url = URL.createObjectURL(content);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `results-downloads-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                        URL.revokeObjectURL(url);
                                    } catch (err) {
                                        console.error('Failed to zip files:', err);
                                        onNotify('Failed to zip files.', 'error');
                                    }
                                }}
                                className="px-3 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                title={activeResults?.downloads?.length === 1 ? 'Download File' : 'Download ZIP'}
                            >
                                <TablerIcon name="folder_zip" className="text-[14px]" />
                                {activeResults?.downloads?.length === 1 ? 'Download' : 'Download ZIP'}
                            </button>
                        )}
                        {mainView === 'data' && (
                            <button
                                onClick={async () => {
                                    const payload = getResultsCopyPayload(activeResults);
                                    if (payload.reason) {
                                        onNotify(payload.reason || 'Data too large to copy safely.', 'error');
                                        return;
                                    }
                                    const preview = getResultsPreview(activeResults);
                                    const fullText = getFullCopyText(payload.raw);
                                    let copyText = fullText;
                                    let usedTruncated = false;

                                    if (preview.truncated) {
                                        const confirmed = await onConfirm({
                                            message: 'Preview is truncated for performance.',
                                            confirmLabel: 'Copy full',
                                            cancelLabel: 'Copy preview'
                                        });
                                        if (!confirmed) {
                                            copyText = preview.text || '';
                                            usedTruncated = true;
                                        }
                                    }

                                    if (copyText.length > MAX_COPY_CHARS) {
                                        const proceed = await onConfirm({
                                            message: `Copying ${formatSize(copyText.length)} may freeze your browser.`,
                                            confirmLabel: 'Copy full',
                                            cancelLabel: usedTruncated ? 'Copy preview' : 'Copy truncated'
                                        });
                                        if (!proceed) {
                                            const truncated = getTruncatedCopyText(payload.raw);
                                            copyText = truncated.text;
                                            usedTruncated = true;
                                        }
                                    }

                                    void handleCopy(copyText, 'data', { skipSizeConfirm: true, truncatedNotice: usedTruncated });
                                }}
                                className={`relative overflow-visible px-3 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${copied === 'data' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                title="Copy extracted data"
                            >
                                {copied === 'data' ? <TablerIcon name="check" className="text-sm" /> : <TablerIcon name="content_copy" className="text-sm" />}
                                {copied === 'data' ? 'Copied' : 'Copy'}
{preview?.truncated && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400" title="Preview truncated" aria-label="Preview truncated" />}
                            </button>
                        )}
                    </div>
                </div>
                <div className="max-h-[70vh] overflow-y-auto custom-scrollbar pr-2 relative">
                    {(() => {
                        const hasData = activeResults && activeResults.data !== undefined && activeResults.data !== null && activeResults.data !== '';
                        const hasDownloads = activeResults && activeResults.downloads && activeResults.downloads.length > 0;
                        if (isExecuting && resultView === 'latest' && (!activeResults || (!hasData && !hasDownloads))) {
                            return <p className="text-xs text-blue-300/60 leading-relaxed">Buffering data stream…</p>;
                        }
                        if (!activeResults || (!hasData && !hasDownloads)) {
                            return null;
                        }
                        return (
                            <div className="h-full">
                                {mainView === 'downloads' ? (
                                    <div className="space-y-2">
                                        {activeResults.downloads!.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
                                                <div className="flex items-center gap-4 overflow-hidden pr-4">
                                                    <div className="p-3 bg-white/5 rounded-lg border border-white/10 shrink-0">
                                                        <FileTypeIcon name={file.name} className="text-2xl" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-white truncate">{file.name}</h4>
                                                        <p className="text-xs text-gray-500 truncate mt-1">{file.url}</p>
                                                    </div>
                                                </div>
                                                <a
                                                    href={file.path}
                                                    download={file.name}
                                                    className="shrink-0 p-3 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center"
                                                    title="Download file"
                                                    aria-label="Download file"
                                                >
                                                    <TablerIcon name="download" className="text-[18px]" />
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : tableData && dataView === 'table' ? (
                                    <div className="overflow-auto custom-scrollbar rounded-2xl border border-white/10">
                                        <table className="min-w-full table-auto text-xs text-left text-white/80 font-mono">
                                            <thead className="bg-white/5 text-xs tracking-widest text-white/50">
                                                <tr>
                                                    {tableData.headers.map((header) => (
                                                        <th key={header} className="px-3 py-2 border-b border-white/10 whitespace-nowrap">
                                                            {header}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tableData.rows.map((row, rowIndex) => (
                                                    <tr key={rowIndex} className="odd:bg-white/[0.02]">
                                                        {tableData.headers.map((_, colIndex) => (
                                                            <td key={`${rowIndex}-${colIndex}`} className="px-3 py-2 border-b border-white/5 align-top whitespace-normal break-words">
                                                                {renderCellValue(row[colIndex])}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <CodeEditor readOnly value={preview?.text || ''} language={preview?.language || 'plain'} />
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default memo(ResultsPane);
