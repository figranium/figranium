import { useEffect, useState } from 'react';
import TablerIcon from './TablerIcon';
import { copyToClipboard } from '../utils/clipboard';

type Item = { id: string; vaultId: string; vault: string; title: string; username: string; hasPassword: boolean };

export default function PasswordsScreen({ onNotify, embedded = false }: { onNotify: (message: string, tone?: 'success' | 'error') => void; embedded?: boolean }) {
    const [items, setItems] = useState<Item[]>([]);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const load = async () => { const status = await fetch('/api/passwords/status').then((response) => response.json()); setConfigured(!!status.configured); if (status.configured) { const response = await fetch('/api/passwords'); const data = await response.json(); setItems(data.items || []); } };
    useEffect(() => { load().catch(() => setConfigured(false)); }, []);
    const copy = async (item: Item) => { const response = await fetch(`/api/passwords/${encodeURIComponent(item.vaultId)}/${encodeURIComponent(item.id)}/copy`, { method: 'POST' }); const data = await response.json(); if (response.ok && data.value) { await copyToClipboard(data.value); onNotify('Password copied.', 'success'); } else onNotify('Password could not be copied.', 'error'); };
    const content = configured === null ? <section className="app-panel w-full p-6" aria-busy="true"><div className="h-4 w-32 animate-pulse rounded bg-[var(--app-surface-3)]" /></section> : !configured ? <section className="app-panel w-full p-6"><h2 className="text-sm font-bold theme-text">Connect 1Password</h2><p className="mt-1 text-xs theme-text-faint">Add your service account token in <a href="/settings/connections" className="text-[var(--app-accent)] hover:underline">Settings → Connections</a>.</p></section> : <section className="app-panel w-full overflow-hidden">{items.map((item) => <article key={`${item.vaultId}-${item.id}`} className="app-list-row flex items-center justify-between gap-4 px-5 py-4"><div><h2 className="text-sm font-bold theme-text">{item.title}</h2><p className="mt-1 text-[11px] theme-text-faint">{item.username || 'No username'} · {item.vault}</p><p className="mt-2 font-mono text-xs theme-text-muted">••••••••••••</p></div><button disabled={!item.hasPassword} onClick={() => copy(item)} className="app-button-secondary"><TablerIcon name="content_copy" /> Copy password</button></article>)}{!items.length && <div className="app-empty-state"><TablerIcon name="key_off" className="text-3xl" /><p className="text-xs theme-text-faint">No Login items are available to this service account.</p></div>}</section>;
    return embedded ? <div className="w-full">{content}</div> : <main className="app-page custom-scrollbar"><div className="app-page-inner"><header className="app-page-header"><div><h1 className="app-page-title">Passwords</h1><p className="app-page-subtitle">1Password Login items</p></div></header>{content}</div></main>;
}
