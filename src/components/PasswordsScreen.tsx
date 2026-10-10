import { useCallback, useEffect, useState } from 'react';
import TablerIcon from './TablerIcon';
import { ListSkeleton } from './common/Skeleton';

type Item = { id: string; vaultId: string; vault: string; title: string; username: string; hasPassword: boolean; domains: string[] };

export default function PasswordsScreen({ embedded = false }: { embedded?: boolean }) {
    const [items, setItems] = useState<Item[]>([]);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [loadingItems, setLoadingItems] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const load = useCallback(async () => {
        setConfigured(null); setLoadError(false);
        const statusResponse = await fetch('/api/passwords/status'); const status = await statusResponse.json();
        if (!statusResponse.ok || !status.configured) { setConfigured(false); return; }
        setConfigured(true); setLoadingItems(true);
        try {
            const response = await fetch('/api/passwords'); const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not load Login items.');
            setItems(data.items || []);
        } catch { setLoadError(true); } finally { setLoadingItems(false); }
    }, []);
    useEffect(() => { void load().catch(() => setConfigured(false)); }, [load]);
    const loadingContent = <section className="app-panel w-full p-5"><ListSkeleton rows={4} /></section>;
    const content = configured === null || loadingItems ? loadingContent : !configured ? <section className="app-panel w-full p-6"><h2 className="text-sm font-bold theme-text">Connect 1Password</h2><p className="mt-1 text-xs theme-text-faint">Add your service account token in <a href="/settings/connections" className="text-[var(--app-accent)] hover:underline">Settings → Connections</a>.</p></section> : loadError ? <section className="app-panel w-full p-6"><p role="alert" className="text-xs text-red-400">Could not load Login items.</p><button type="button" onClick={() => void load()} className="app-button-secondary mt-4"><TablerIcon name="refresh" /> Try again</button></section> : <section className="app-panel w-full overflow-hidden">{items.map((item) => <article key={`${item.vaultId}-${item.id}`} className="app-list-row grid grid-cols-[minmax(0,1fr)_minmax(11rem,0.55fr)] gap-x-8 px-5 py-4"><div className="min-w-0"><h2 className="truncate text-sm font-bold theme-text">{item.title}</h2><p className="mt-1 truncate text-[11px] theme-text-faint">{item.domains.length ? item.domains.join(', ') : 'No website saved'}</p></div><div className="min-w-0"><p className="truncate text-[11px] theme-text-faint">{item.username || 'No username'}</p><p className="mt-1 text-[11px] theme-text-faint">{item.vault}</p></div></article>)}{!items.length && <div className="app-empty-state"><TablerIcon name="key_off" className="text-3xl" /><p className="text-xs theme-text-faint">No Login items are available to this service account.</p></div>}</section>;
    return embedded ? <div className="w-full">{content}</div> : <main className="app-page custom-scrollbar"><div className="app-page-inner"><header className="app-page-header"><div><h1 className="app-page-title">Passwords</h1><p className="app-page-subtitle">1Password Login items</p></div></header>{content}</div></main>;
}
