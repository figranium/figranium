import React, { useEffect, useRef, useState } from 'react';
import TablerIcon from '../TablerIcon';

interface HeadfulModalProps {
    isHeadfulOpen: boolean;
    isInspectMode: boolean;
    isInspectLoading: boolean;
    isExecuting: boolean;
    useNovnc?: boolean | null;
    onToggleInspect: () => void;
    onStopHeadful: () => void;
}

const HeadfulModal: React.FC<HeadfulModalProps> = ({
    isHeadfulOpen,
    isInspectMode,
    isInspectLoading,
    isExecuting,
    useNovnc,
    onToggleInspect,
    onStopHeadful,
}) => {
    const headfulFrameRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<HTMLIFrameElement | null>(null);
    const [viewerError, setViewerError] = useState<string | null>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const [viewerAttempt, setViewerAttempt] = useState(0);
    const [passwordCandidate, setPasswordCandidate] = useState<{ id: string; domain: string; username: string } | null>(null);
    const [passwordSaveError, setPasswordSaveError] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);

    useEffect(() => { setViewerError(null); setViewerReady(false); setPasswordCandidate(null); if (isHeadfulOpen) setViewerAttempt(v => v + 1); }, [isHeadfulOpen]);
    useEffect(() => {
        if (!isHeadfulOpen) return;
        let cancelled = false;
        const check = async () => {
            try {
                const response = await fetch('/api/passwords/capture', { cache: 'no-store' });
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled && data.candidate) setPasswordCandidate(data.candidate);
            } catch { /* The browser viewer remains usable if password capture is unavailable. */ }
        };
        check();
        const timer = window.setInterval(check, 1500);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [isHeadfulOpen]);
    const answerPasswordPrompt = async (decision: 'save' | 'dismiss') => {
        if (!passwordCandidate || passwordSaving) return;
        setPasswordSaving(true);
        setPasswordSaveError('');
        try {
            const response = await fetch('/api/passwords/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: passwordCandidate.id, decision }) });
            if (!response.ok) throw new Error('Could not save this Login in 1Password.');
            setPasswordCandidate(null);
        } catch (error) { setPasswordSaveError(error instanceof Error ? error.message : 'Could not save this Login.'); }
        finally { setPasswordSaving(false); }
    };
    useEffect(() => {
        if (!isHeadfulOpen || !useNovnc || viewerReady || viewerError) return;
        const timeout = window.setTimeout(() => setViewerError('Browser viewer timed out. Retry the connection.'), 25000);
        return () => window.clearTimeout(timeout);
    }, [isHeadfulOpen, useNovnc, viewerReady, viewerError, viewerAttempt]);

    useEffect(() => {
        const handleViewerFailure = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== viewerRef.current?.contentWindow) return;
            if (event.data?.type === 'figranium-headful-viewer-failed') {
                setViewerError(typeof event.data.message === 'string' ? event.data.message : 'Browser viewer unavailable');
            } else if (event.data?.type === 'figranium-headful-viewer-ready') {
                setViewerReady(true);
                setViewerError(null);
            }
        };
        window.addEventListener('message', handleViewerFailure);
        return () => window.removeEventListener('message', handleViewerFailure);
    }, []);

    if (!isHeadfulOpen) return null;

    const { origin, hostname } = window.location;
    const theme = document.documentElement.dataset.theme || 'dark';
    const headfulUrl = `${origin}/novnc.html?host=${hostname}&path=websockify&theme=${encodeURIComponent(theme)}&attempt=${viewerAttempt}`;

    const requestFullscreen = () => {
        const target = headfulFrameRef.current;
        if (!target) return;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
            return;
        }
        target.requestFullscreen?.().catch(() => { });
    };

    return (
        <div className="theme-modal-backdrop fixed inset-0 z-[100] backdrop-blur-md flex items-center justify-center p-8 pointer-events-auto">
            <div className="w-full max-w-6xl theme-surface backdrop-blur-3xl border theme-border-strong theme-modal-elevation rounded-[32px] overflow-hidden flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b theme-border bg-[var(--app-glass-card)] gap-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold tracking-widest theme-text">Active Browser Session</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onToggleInspect}
                            disabled={isExecuting}
                            aria-busy={isInspectLoading}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold tracking-widest transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${isInspectMode
                                ? 'border-green-500/30 bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'theme-border theme-text-muted hover:theme-text theme-hover'}`}
                            title={isInspectMode ? 'Stop inspecting elements' : 'Highlight elements on hover'}
                            aria-label={isInspectMode ? 'Stop inspecting elements' : 'Highlight elements on hover'}
                        >
                            {isInspectLoading ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <TablerIcon name={isInspectMode ? 'visibility_off' : 'center_focus_strong'} className="text-[14px]" />
                            )}
                            {isInspectMode ? 'Stop Inspect' : 'Inspect UI'}
                        </button>
                        <button
                            type="button"
                            onClick={requestFullscreen}
                            className="p-2 theme-text-muted hover:theme-text theme-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
                            title="Toggle fullscreen"
                            aria-label="Toggle fullscreen"
                        >
                            <TablerIcon name="fullscreen" className="text-[16px]" />
                        </button>
                        <button
                            type="button"
                            onClick={onStopHeadful}
                            className="p-2 theme-text-muted hover:theme-text theme-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
                            title="Close Browser"
                            aria-label="Close Browser"
                        >
                            <TablerIcon name="close" className="text-[16px]" />
                        </button>
                    </div>
                </div>
                <div ref={headfulFrameRef} className="w-full aspect-video relative theme-surface-3 flex items-center justify-center">
                    {useNovnc === null ? (
                        <div className="text-center p-8 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-2 theme-border border-t-[var(--app-text)] rounded-full animate-spin" />
                            <p className="theme-text-muted text-xs tracking-wider ">Checking browser status...</p>
                        </div>
                    ) : useNovnc === false ? (
                        <div className="text-center p-8 animate-in fade-in duration-300">
                            <TablerIcon name="open_in_new" className="text-6xl theme-text-faint mb-4 block" />
                            <h3 className="theme-text text-lg font-bold mb-2">Browser Opened Natively</h3>
                            <p className="theme-text-muted text-sm max-w-md mx-auto leading-relaxed mb-6">
                                The headful browser has been launched in a separate window on your desktop.
                                Use that window to pick selectors. It will automatically sync back here.
                            </p>
                        </div>
                    ) : (
                        <iframe
                            key={viewerAttempt}
                            ref={viewerRef}
                            src={headfulUrl}
                            className="absolute inset-0 w-full h-full border-0 animate-in fade-in duration-300"
                            title="Headful Browser"
                        />
                    )}
                    {viewerError && (
                        <div role="alert" className="absolute inset-0 theme-surface flex items-center justify-center p-8 text-center theme-text">
                            <div><p>{viewerError}</p><button type="button" className="app-button-primary mt-4" onClick={() => { setViewerError(null); setViewerReady(false); setViewerAttempt(v => v + 1); }}>Retry viewer</button></div>
                        </div>
                    )}
                    {useNovnc && !viewerReady && !viewerError && <div className="absolute inset-0 pointer-events-none flex items-center justify-center theme-surface-3 theme-text-muted text-sm">Connecting to browser…</div>}
                    {passwordCandidate && <div role="dialog" aria-label="Save website password" className="absolute bottom-4 left-1/2 z-20 w-[min(90%,420px)] -translate-x-1/2 rounded-2xl border theme-border-strong theme-surface p-4 shadow-2xl">
                        <p className="text-sm font-semibold theme-text">Save password for {passwordCandidate.domain}?</p>
                        <p className="mt-1 text-xs theme-text-muted">{passwordCandidate.username || 'No username detected'} · Save or update a Login in the Figranium 1Password vault.</p>
                        {passwordSaveError && <p role="alert" className="mt-2 text-xs text-red-500">{passwordSaveError}</p>}
                        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={passwordSaving} className="app-button-secondary" onClick={() => answerPasswordPrompt('dismiss')}>Not now</button><button type="button" disabled={passwordSaving} className="app-button-primary" onClick={() => answerPasswordPrompt('save')}>{passwordSaving ? 'Saving…' : 'Save password'}</button></div>
                    </div>}
                </div>
            </div>
        </div>
    );
};

export default HeadfulModal;
