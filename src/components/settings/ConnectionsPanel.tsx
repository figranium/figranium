import { useEffect, useState } from 'react';

type Credential = { id: string; name: string; provider: 'baserow'; config: { baseUrl: string; token: string } };

function BrandIcon({ provider }: { provider: 'onepassword' | 'baserow' }) {
    const source = provider === 'onepassword' ? '/brands/1password.svg' : '/brands/baserow.svg';
    const label = provider === 'onepassword' ? '1Password' : 'Baserow';
    return <img src={source} alt={`${label} logo`} className="h-7 w-7 rounded-md" />;
}

export default function ConnectionsPanel({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'error') => void }) {
    const [configured, setConfigured] = useState(false);
    const [onePasswordToken, setOnePasswordToken] = useState('');
    const [baserow, setBaserow] = useState<Credential[]>([]);
    const [baserowForm, setBaserowForm] = useState({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
    const [saving, setSaving] = useState(false);
    const load = async () => {
        const [status, credentials] = await Promise.all([fetch('/api/passwords/status'), fetch('/api/credentials')]);
        const statusData = await status.json(); const credentialData = await credentials.json();
        setConfigured(!!statusData.configured); setBaserow((credentialData || []).filter((item: Credential) => item.provider === 'baserow'));
    };
    useEffect(() => { load().catch(() => onNotify('Could not load connections.', 'error')); }, []);
    useEffect(() => {
        const frame = requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
        return () => cancelAnimationFrame(frame);
    }, []);
    const connect1Password = async () => {
        setSaving(true);
        try { const response = await fetch('/api/passwords/configure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: onePasswordToken }) }); if (!response.ok) throw new Error(); setOnePasswordToken(''); setConfigured(true); onNotify('1Password connected.', 'success'); }
        catch { onNotify('Could not connect to 1Password.', 'error'); } finally { setSaving(false); }
    };
    const disconnect1Password = async () => { await fetch('/api/passwords/configure', { method: 'DELETE' }); setConfigured(false); onNotify('1Password disconnected.', 'success'); };
    const saveBaserow = async () => {
        setSaving(true);
        try { const response = await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: baserowForm.name, provider: 'baserow', config: { baseUrl: baserowForm.baseUrl, token: baserowForm.token } }) }); if (!response.ok) throw new Error(); setBaserowForm({ name: '', baseUrl: 'https://api.baserow.io', token: '' }); await load(); onNotify('Baserow connection saved.', 'success'); }
        catch { onNotify('Could not save Baserow connection.', 'error'); } finally { setSaving(false); }
    };
    const removeBaserow = async (id: string) => { await fetch(`/api/credentials/${id}`, { method: 'DELETE' }); await load(); onNotify('Baserow connection removed.', 'success'); };
    return <div className="space-y-5">
        <section className="app-panel p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-bold theme-text">1Password</h2><p className="mt-1 text-xs theme-text-faint">Connect a service-account token. Figranium creates or uses a dedicated “Figranium” vault.</p></div><BrandIcon provider="onepassword" /></div>{configured ? <div className="mt-5 flex items-center justify-between rounded-xl border theme-border bg-[var(--app-surface-3)] p-4"><span className="text-xs theme-text">Connected to the Figranium vault</span><button className="app-button-danger" onClick={disconnect1Password}>Disconnect</button></div> : <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input type="password" autoComplete="new-password" value={onePasswordToken} onChange={event => setOnePasswordToken(event.target.value)} placeholder="Service account token" className="min-w-0 flex-1 rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm theme-text"/><button disabled={!onePasswordToken || saving} className="app-button-primary" onClick={connect1Password}>Connect</button></div>}</section>
        <section className="app-panel p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-bold theme-text">Baserow</h2><p className="mt-1 text-xs theme-text-faint">Store a Baserow API key for task output destinations.</p></div><BrandIcon provider="baserow" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><input autoComplete="off" value={baserowForm.name} onChange={event => setBaserowForm(value => ({ ...value, name: event.target.value }))} placeholder="Connection name" className="rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm theme-text"/><input autoComplete="off" value={baserowForm.baseUrl} onChange={event => setBaserowForm(value => ({ ...value, baseUrl: event.target.value }))} placeholder="Baserow URL" className="rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm theme-text"/><input type="password" autoComplete="new-password" value={baserowForm.token} onChange={event => setBaserowForm(value => ({ ...value, token: event.target.value }))} placeholder="Baserow API key" className="rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm theme-text"/><button disabled={!baserowForm.name || !baserowForm.token || saving} className="app-button-primary" onClick={saveBaserow}>Save connection</button></div>{baserow.length > 0 && <div className="mt-5 divide-y theme-border rounded-xl border theme-border">{baserow.map(connection => <div key={connection.id} className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="text-sm font-bold theme-text">{connection.name}</p><p className="mt-1 text-[11px] theme-text-faint">{connection.config.baseUrl} · API key saved</p></div><button className="app-button-danger" onClick={() => removeBaserow(connection.id)}>Remove</button></div>)}</div>}</section>
    </div>;
}
