import { useEffect, useRef, useState } from 'react';
import TablerIcon from './TablerIcon';
import PasswordsScreen from './PasswordsScreen';
import { ConfirmRequest } from '../types';

type State = { id: string; name: string; cookies: number; origins: number; updatedAt: string };
type Source = 'fresh' | 'import';

export default function CookiesScreen({ onNotify, onConfirm }: { onNotify: (message: string, tone?: 'success' | 'error') => void; onConfirm: (request: string | ConfirmRequest) => Promise<boolean> }) {
    const [states, setStates] = useState<State[]>([]);
    const [tab, setTab] = useState<'cookies' | 'passwords'>('cookies');
    const [creating, setCreating] = useState(false);
    const [source, setSource] = useState<Source>('fresh');
    const [name, setName] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        const response = await fetch('/api/cookie-states');
        const data = await response.json();
        setStates(data.states || []);
    };

    useEffect(() => { load(); }, []);

    const closeCreate = () => {
        setCreating(false); setSource('fresh'); setName(''); setFile(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    const create = async () => {
        if (!name.trim()) return onNotify('Give this cookie state a name.', 'error');
        try {
            const payload: { name: string; state?: unknown } = { name: name.trim() };
            if (source === 'fresh') payload.state = { cookies: [], origins: [] };
            if (source === 'import') {
                if (!file) return onNotify('Choose a Playwright storage-state JSON file.', 'error');
                payload.state = JSON.parse(await file.text());
            }
            const response = await fetch('/api/cookie-states', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error();
            closeCreate(); await load();
            onNotify(source === 'fresh' ? 'Fresh cookie state created.' : 'Cookie state imported.', 'success');
        } catch {
            onNotify(source === 'fresh' ? 'Cookie state could not be created.' : 'Choose a valid Playwright storage-state JSON file.', 'error');
        }
    };

    const rename = async (id: string) => {
        const trimmed = editingName.trim(); if (!trimmed) return;
        const response = await fetch(`/api/cookie-states/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) });
        if (!response.ok) return onNotify('Cookie state could not be renamed.', 'error');
        setEditingId(null); await load();
    };

    const remove = async (state: State) => {
        if (!await onConfirm({ title: 'Delete cookie state', message: `Permanently delete ${state.name}? This cannot be undone.`, confirmLabel: 'Delete state' })) return;
        const { id } = state;
        const response = await fetch(`/api/cookie-states/${id}`, { method: 'DELETE' });
        if (!response.ok) return onNotify('Cookie state could not be deleted.', 'error');
        await load(); onNotify('Cookie state deleted.', 'success');
    };

    return <main className="app-page custom-scrollbar animate-in fade-in duration-500">
        <div className="app-page-inner">
            <header className="app-page-header"><div><h1 className="app-page-title">Vault</h1><p className="app-page-subtitle">Cookie states and password credentials for your automations</p></div></header>
            <div className="mb-6 flex w-fit gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-input)] p-1">
                <button onClick={() => setTab('cookies')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'cookies' ? 'theme-highlight' : 'theme-text-faint theme-hover'}`}><TablerIcon name="cookie" /> Cookie states</button>
                <button onClick={() => setTab('passwords')} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === 'passwords' ? 'theme-highlight' : 'theme-text-faint theme-hover'}`}><TablerIcon name="key" /> Passwords</button>
            </div>
            {tab === 'passwords' ? <PasswordsScreen embedded /> : <>
                <section className="app-panel mb-5 flex items-center justify-between gap-4 p-5">
                    <div><h2 className="text-sm font-bold theme-text">Cookie states</h2><p className="mt-1 text-xs theme-text-faint">Each state keeps its own session and is updated after browser runs.</p></div>
                    <button onClick={() => setCreating(true)} className="app-button-primary shrink-0"><TablerIcon name="add" /> Create state</button>
                </section>
                <section className="app-panel overflow-hidden">
                    {states.map((state) => <article key={state.id} className="app-list-row flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                        <div className="min-w-0 flex-1">
                            {editingId === state.id ? <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') rename(state.id); if (event.key === 'Escape') setEditingId(null); }} className="max-w-md rounded-lg border theme-border bg-[var(--app-input)] px-3 py-2 text-sm theme-text" /> : <h2 className="text-sm font-bold theme-text">{state.name}</h2>}
                            <p className="mt-1 text-[11px] theme-text-faint">{state.cookies} cookies · {state.origins} origins · updated {new Date(state.updatedAt).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-3">{editingId === state.id ? <><button aria-label="Save name" title="Save" className="theme-text-faint hover:text-[var(--app-text)]" onClick={() => rename(state.id)}><TablerIcon name="check" /></button><button aria-label="Cancel rename" title="Cancel" className="theme-text-faint hover:text-[var(--app-text)]" onClick={() => setEditingId(null)}><TablerIcon name="close" /></button></> : <button aria-label={`Rename ${state.name}`} title="Rename" className="theme-text-faint hover:text-[var(--app-text)]" onClick={() => { setEditingId(state.id); setEditingName(state.name); }}><TablerIcon name="edit" /></button>}{state.id !== 'cookies_default' && <button title="Delete" aria-label={`Delete ${state.name}`} className="text-red-400 hover:text-red-500" onClick={() => void remove(state)}><TablerIcon name="delete" /></button>}</div>
                    </article>)}
                    {!states.length && <div className="app-empty-state"><TablerIcon name="cookie_off" className="text-3xl" /><p className="text-xs theme-text-faint">No saved cookie states yet.</p></div>}
                </section>
            </>}
        </div>
        {creating && <div className="theme-modal-backdrop fixed inset-0 z-[205] flex items-center justify-center px-6 backdrop-blur-sm" onMouseDown={closeCreate}>
            <section role="dialog" aria-modal="true" aria-labelledby="create-cookie-state-title" className="w-full max-w-lg rounded-[28px] border p-7 shadow-2xl" style={{ background: 'var(--app-glass-modal)', borderColor: 'var(--app-border)' }} onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4"><div><h2 id="create-cookie-state-title" className="text-lg font-bold theme-text">Create state</h2><p className="mt-1 text-xs theme-text-faint">Start with a fresh session, or import a Playwright file.</p></div><button aria-label="Close" className="theme-text-faint hover:text-[var(--app-text)]" onClick={closeCreate}><TablerIcon name="close" /></button></div>
                <label className="mt-6 block text-xs font-bold theme-text-muted">State name</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Client portal" className="mt-2 w-full rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm theme-text" />
                <p className="mt-5 text-xs font-bold theme-text-muted">Source</p>
                <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setSource('fresh')} className={`rounded-xl border p-3 text-left text-xs ${source === 'fresh' ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-text)]' : 'theme-border theme-hover theme-text-muted'}`}><span className="block font-bold">Fresh state</span><span className="mt-1 block opacity-75">Start with no cookies</span></button><button onClick={() => setSource('import')} className={`rounded-xl border p-3 text-left text-xs ${source === 'import' ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-text)]' : 'theme-border theme-hover theme-text-muted'}`}><span className="block font-bold">Import JSON</span><span className="mt-1 block opacity-75">Playwright storage state</span></button></div>
                {source === 'import' && <div className="mt-4"><input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} /><button className="app-button-secondary w-full justify-center" onClick={() => fileRef.current?.click()}><TablerIcon name="upload_file" /> {file ? file.name : 'Choose JSON file'}</button></div>}
                <div className="mt-6 flex justify-end gap-3"><button className="app-button-secondary" onClick={closeCreate}>Cancel</button><button className="app-button-primary" disabled={!name.trim() || (source === 'import' && !file)} onClick={create}>Create state</button></div>
            </section>
        </div>}
    </main>;
}
