import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TablerIcon from './TablerIcon';
import FileTypeIcon from './FileTypeIcon';
import { ConfirmRequest } from '../types';

type Cabinet = { id: string; name: string; isDefault?: boolean; itemCount: number; unuploadedCount: number };
type Item = { id: string; name: string; kind: string; status: string };
type Dialog = { title: string; label: string; value?: string; confirm: string; submit: (value: string) => void } | null;
type ContextMenu = { cabinet: Cabinet; x: number; y: number } | null;

function GlassInput({ dialog, close }: { dialog: Dialog; close: () => void }) {
    const [value, setValue] = useState('');
    useEffect(() => setValue(dialog?.value || ''), [dialog]);
    if (!dialog) return null;
    const submit = () => { if (value.trim()) { dialog.submit(value.trim()); close(); } };
    return <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm" onMouseDown={close}>
        <div className="w-full max-w-md animate-in zoom-in-95 rounded-[32px] border p-8 shadow-2xl backdrop-blur-xl duration-200" style={{ background: 'var(--app-glass-modal)', borderColor: 'var(--app-border)' }} onMouseDown={e => e.stopPropagation()}>
            <div><p className="text-xs font-bold tracking-[.28em] theme-text-faint">Cabinets</p><h2 className="mt-1 text-lg font-bold theme-text">{dialog.title}</h2></div>
            <label className="mt-7 block text-xs font-bold tracking-[.18em] theme-text-muted">{dialog.label}</label>
            <input autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(); }} className="mt-2 w-full rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-input)] px-4 py-3 text-sm theme-text outline-none focus:ring-2 focus:ring-[var(--app-accent)]" />
            <div className="mt-6 flex gap-3"><button className="app-button-secondary flex-1 justify-center" onClick={close}>Cancel</button><button className="app-button-primary flex-1 justify-center" onClick={submit}>{dialog.confirm}</button></div>
        </div>
    </div>;
}

export default function CabinetsScreen({ onConfirm, onNotify }: { onConfirm: (r: string | ConfirmRequest) => Promise<boolean>; onNotify: (m: string, tone?: 'success' | 'error') => void }) {
    const navigate = useNavigate();
    const { cabinetId } = useParams<{ cabinetId?: string }>();
    const [cabinets, setCabinets] = useState<Cabinet[]>([]);
    const [active, setActive] = useState('');
    const [items, setItems] = useState<Item[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu>(null);

    const load = useCallback(async () => {
        const d = await (await fetch('/api/cabinets')).json();
        const resolved = d.cabinets?.some((c: Cabinet) => c.id === cabinetId) ? cabinetId : d.defaultCabinetId || '';
        setCabinets(d.cabinets || []);
        setActive(resolved);
        if (resolved && cabinetId !== resolved) navigate(`/cabinets/${resolved}`, { replace: true });
    }, [cabinetId, navigate]);
    const loadItems = useCallback(async () => {
        if (!active) return;
        const d = await (await fetch(`/api/cabinets/${active}/items`)).json();
        setItems(d.items || []);
        setSelected([]);
    }, [active]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadItems(); }, [loadItems]);
    useEffect(() => {
        if (!contextMenu) return;
        const dismiss = () => setContextMenu(null);
        window.addEventListener('click', dismiss);
        window.addEventListener('resize', dismiss);
        return () => { window.removeEventListener('click', dismiss); window.removeEventListener('resize', dismiss); };
    }, [contextMenu]);

    const post = async (url: string, body?: any, method = 'POST') => {
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Request failed');
        return r.json().catch(() => ({}));
    };
    const mutate = async (fn: () => Promise<any>, message: string) => {
        try { await fn(); onNotify(message, 'success'); await load(); await loadItems(); }
        catch (e: any) { onNotify(e.message, 'error'); }
    };
    const current = cabinets.find(c => c.id === active);
    const renameCabinet = (cabinet: Cabinet) => setDialog({ title: 'Rename Cabinet', label: 'Cabinet name', value: cabinet.name, confirm: 'Save', submit: name => mutate(() => post(`/api/cabinets/${cabinet.id}`, { name }, 'PATCH'), 'Cabinet renamed') });
    const clearCabinet = async (cabinet: Cabinet) => {
        if (await onConfirm({ title: 'Clear Cabinet', message: `Permanently remove every item in ${cabinet.name}?`, confirmLabel: 'Clear cabinet' })) mutate(() => post(`/api/cabinets/${cabinet.id}/clear`), 'Cabinet cleared');
    };
    const deleteCabinet = async (cabinet: Cabinet) => {
        const replacement = cabinets.find(c => c.isDefault);
        if (!replacement || cabinet.isDefault) return;
        if (await onConfirm({ title: 'Delete Cabinet', message: `${cabinet.name} and every item in it will be permanently deleted. Task references will use ${replacement.name} instead.`, confirmLabel: 'Delete cabinet' })) {
            await mutate(async () => {
                await post(`/api/cabinets/${cabinet.id}`, { targetCabinetId: replacement.id }, 'DELETE');
                navigate(`/cabinets/${replacement.id}`, { replace: true });
            }, 'Cabinet deleted');
        }
    };
    const button = (label: string, icon: string, run: () => void, disabled = false, danger = false) => <button className={`${danger ? 'app-button-danger' : 'app-button-secondary'} cursor-pointer disabled:cursor-not-allowed`} title={label} aria-label={label} onClick={run} disabled={disabled}><TablerIcon name={icon} className="text-base" /><span className="hidden xl:inline">{label}</span></button>;
    const menuButton = (label: string, icon: string, onClick: () => void, danger = false) => <button className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold ${danger ? 'text-red-400 hover:bg-red-500/10' : 'theme-text theme-hover'}`} onClick={onClick}><TablerIcon name={icon} />{label}</button>;

    return <main className="app-page custom-scrollbar animate-in fade-in duration-500">
        <div className="app-page-inner">
            <header className="app-page-header"><div><h1 className="app-page-title">Cabinets</h1><p className="app-page-subtitle">Downloads ready for your automations</p></div><div className="app-toolbar">{button('Refresh', 'sync', load)}{button('New Cabinet', 'create_new_folder', () => setDialog({ title: 'Create Cabinet', label: 'Cabinet name', confirm: 'Create', submit: name => mutate(() => post('/api/cabinets', { name }), 'Cabinet created') }))}</div></header>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr]">
                <aside className="app-panel space-y-2 p-3" aria-label="Cabinets">
                    {cabinets.map(c => <button key={c.id} onClick={() => navigate(`/cabinets/${c.id}`)} onContextMenu={event => { event.preventDefault(); setContextMenu({ cabinet: c, x: event.clientX, y: event.clientY }); }} className={`w-full cursor-pointer rounded-xl p-3 text-left ${active === c.id ? 'theme-highlight' : 'theme-hover theme-text-faint'}`}>
                        <div className="flex justify-between gap-2"><span className="truncate text-sm font-bold">{c.name}</span>{c.isDefault && <TablerIcon name="star" className="text-sm" />}</div>
                        <div className="mt-1 text-[10px] tracking-wider">{c.itemCount} items · {c.unuploadedCount} ready</div>
                    </button>)}
                </aside>
                <section className="app-panel overflow-hidden">
                    <div className="app-panel-header flex-wrap gap-3"><div><h2 className="text-sm font-bold theme-text">{current?.name || 'Cabinet'}</h2><p className="mt-1 text-[10px] tracking-[.14em] theme-text-faint">{items.length} items</p></div><div className="flex flex-wrap gap-2">{button('Rename', 'edit', () => current && renameCabinet(current))}{button('Clear', 'delete_sweep', () => current && clearCabinet(current))}{button('Mark uploaded', 'check_circle', () => mutate(() => post(`/api/cabinets/${active}/items/status`, { itemIds: selected, status: 'uploaded' }, 'PATCH'), 'Marked uploaded'), !selected.length)}{button('Mark unuploaded', 'restart_alt', () => mutate(() => post(`/api/cabinets/${active}/items/status`, { itemIds: selected, status: 'unuploaded' }, 'PATCH'), 'Marked unuploaded'), !selected.length)}{button('Create ZIP', 'folder_zip', () => setDialog({ title: 'Create ZIP Archive', label: 'Archive name', value: 'archive.zip', confirm: 'Create ZIP', submit: name => mutate(() => post(`/api/cabinets/${active}/zip`, { itemIds: selected, name }), 'Archive created') }), !selected.length)}{button('Delete items', 'delete', async () => { if (await onConfirm({ title: 'Delete Items', message: 'Permanently delete the selected cabinet items?', confirmLabel: 'Delete' })) mutate(() => post(`/api/cabinets/${active}/items`, { itemIds: selected }, 'DELETE'), 'Items deleted'); }, !selected.length, true)}</div></div>
                    {items.length === 0 ? <div className="app-empty-state"><TablerIcon name="folder_off" className="text-3xl" /><p className="text-xs theme-text-faint">This cabinet is empty.</p></div> : <div className="divide-y theme-border">{items.map(i => <div key={i.id} className="flex items-center gap-3 p-3 hover:bg-white/[.03]"><input aria-label={`Select ${i.name}`} type="checkbox" checked={selected.includes(i.id)} onChange={() => setSelected(s => s.includes(i.id) ? s.filter(x => x !== i.id) : [...s, i.id])} /><FileTypeIcon name={i.name} kind={i.kind} /><a href={`/api/cabinets/${active}/items/${i.id}/download`} className="min-w-0 flex-1 cursor-pointer truncate text-sm theme-text hover:underline">{i.name}</a><span className={`app-badge ${i.status === 'uploaded' ? 'opacity-50' : ''}`}>{i.status}</span>{i.name.toLowerCase().endsWith('.zip') && button('Unzip', 'unarchive', () => mutate(() => post(`/api/cabinets/${active}/items/${i.id}/unzip`), 'Archive extracted'))}</div>)}</div>}
                </section>
            </div>
        </div>
        {contextMenu && <div className="fixed z-[210] min-w-40 rounded-xl border p-1 shadow-2xl backdrop-blur-xl" style={{ left: contextMenu.x, top: contextMenu.y, background: 'var(--app-glass-modal)', borderColor: 'var(--app-border)' }} onClick={event => event.stopPropagation()}>
            {menuButton('Rename', 'edit', () => { setContextMenu(null); renameCabinet(contextMenu.cabinet); })}
            {menuButton('Clear', 'delete_sweep', () => { setContextMenu(null); clearCabinet(contextMenu.cabinet); }, true)}
            {!contextMenu.cabinet.isDefault && <><div className="my-1 border-t theme-border" />{menuButton('Delete cabinet', 'delete', () => { setContextMenu(null); deleteCabinet(contextMenu.cabinet); }, true)}</>}
        </div>}
        <GlassInput dialog={dialog} close={() => setDialog(null)} />
    </main>;
}
