import { useState } from 'react';

interface VersionPanelProps {
    version: string;
    buildChannel: 'edge' | 'release';
    buildCommit: string;
}

const VersionPanel = ({ version, buildChannel, buildCommit }: VersionPanelProps) => {
    const [copied, setCopied] = useState(false);
    const displayVersion = version ? `v${version}` : 'Unknown';
    // Cloud builds Edge with Vite's /edge/ base. Keep the visible channel
    // truthful even when an older pipeline supplies stale custom metadata.
    const isEdgeBuild = buildChannel === 'edge' || import.meta.env.BASE_URL === '/edge/';
    const buildIdentifier = isEdgeBuild && buildCommit ? `Edge · ${buildCommit}` : 'Edge build';

    const handleCopy = async () => {
        const text = isEdgeBuild ? `${version || displayVersion} (${buildIdentifier})` : (version || displayVersion);
        try {
            const hasClipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext;
            if (hasClipboard) {
                await navigator.clipboard.writeText(text);
            } else if (typeof document !== 'undefined') {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="app-panel p-7 space-y-6">
            <div className="flex items-center gap-4 mb-2">
                <div>
                    <h3 className="text-sm font-bold theme-text">Version</h3>
                    <p className="text-xs theme-text-faint mt-1">Package metadata</p>
                </div>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold tracking-[0.3em] theme-text">{displayVersion}</div>
                    {isEdgeBuild && (
                        <span className="rounded-full border border-[var(--app-accent)]/30 bg-[var(--app-accent)]/10 px-2 py-1 text-[10px] font-bold tracking-wide text-[var(--app-accent)]">
                            {buildIdentifier}
                        </span>
                    )}
                </div>
                <button
                    onClick={handleCopy}
                    className="app-button-secondary"
                    type="button"
                >
                    {copied ? 'Copied' : 'Copy version'}
                </button>
            </div>
        </div>
    );
};

export default VersionPanel;
