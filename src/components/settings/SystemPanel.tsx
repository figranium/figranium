import { useCallback, useEffect, useState } from 'react';
import { ConfirmRequest } from '../../types';
import CustomSelect from '../common/CustomSelect';

type SystemData = {
    retentionDays: number | null;
    protection?: { pressure?: string; totalMb?: number; availableMb?: number; cpuLoad?: number; maxConcurrent?: number; active?: number; queued?: number };
    captcha?: { activeTier?: string | null; backend?: string | null; device?: string | null; error?: string | null; lastProbeAt?: number | null };
    cleanup?: { lastRunAt?: number | null; deletedCaptures?: number; deletedExecutions?: number; error?: string | null };
};

const RETENTION_OPTIONS = [
    { value: '1', label: '1 day' }, { value: '3', label: '3 days' }, { value: '7', label: '7 days' },
    { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' },
    { value: '365', label: '365 days' }, { value: 'never', label: 'Never' }
] as const;

export default function SystemPanel({ onConfirm, onNotify }: { onConfirm: (request: string | ConfirmRequest) => Promise<boolean>; onNotify: (message: string, tone?: 'success' | 'error') => void }) {
    const [data, setData] = useState<SystemData | null>(null);
    const [choice, setChoice] = useState<string>('7');
    const [saving, setSaving] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [resetPassword, setResetPassword] = useState('');
    const load = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/system', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load system settings');
            const next = await response.json();
            setData(next); setChoice(next.retentionDays === null ? 'never' : String(next.retentionDays));
        } catch { onNotify('Failed to load system status.', 'error'); }
    }, [onNotify]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        fetch('/api/auth/me', { credentials: 'include' })
            .then((response) => response.ok ? response.json() : null)
            .then((account) => { if (account?.user?.email) setEmail(account.user.email); })
            .catch(() => {});
    }, []);

    const saveRetention = async () => {
        const retentionDays = choice === 'never' ? null : Number(choice);
        if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365)) return;
        const destructive = retentionDays !== null && (data?.retentionDays === null || retentionDays < (data?.retentionDays ?? retentionDays));
        if (destructive && !await onConfirm({ title: 'Remove expired data', message: 'Saving this retention period will permanently delete captures and execution history older than the selected age.', confirmLabel: 'Save and delete' })) return;
        setSaving(true);
        try {
            const response = await fetch('/api/settings/system', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retentionDays }) });
            if (!response.ok) throw new Error('Save failed');
            onNotify('System retention saved.', 'success'); await load();
        } catch { onNotify('Failed to save retention.', 'error'); } finally { setSaving(false); }
    };
    const saveAccount = async () => {
        if (newPassword && newPassword !== passwordConfirm) return onNotify('New passwords do not match.', 'error');
        if (!currentPassword) return onNotify('Enter your current password to save account changes.', 'error');
        setSaving(true);
        try {
            const response = await fetch('/api/auth/account', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, email, newPassword }) });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Save failed');
            setCurrentPassword(''); setNewPassword(''); setPasswordConfirm('');
            onNotify('Account details updated.', 'success');
        } catch { onNotify('Could not update account details. Check your current password.', 'error'); } finally { setSaving(false); }
    };
    const clearData = async (kind: 'captures' | 'executions') => {
        const label = kind === 'captures' ? 'captures' : 'execution history';
        if (!await onConfirm({ title: `Clear ${label}`, message: `Permanently delete all ${label}? This cannot be undone.`, confirmLabel: `Clear ${label}` })) return;
        setSaving(true);
        try {
            const endpoint = kind === 'captures' ? '/api/clear-screenshots' : '/api/executions/clear';
            const response = await fetch(endpoint, { method: 'POST', credentials: 'include' });
            if (!response.ok) throw new Error('Clear failed');
            onNotify(`${kind === 'captures' ? 'Captures' : 'Execution history'} cleared.`, 'success');
            await load();
        } catch { onNotify(`Failed to clear ${label}.`, 'error'); } finally { setSaving(false); }
    };
    const clearEverything = async () => {
        if (!resetPassword) return onNotify('Enter your current password to clear all workspace data.', 'error');
        if (!await onConfirm({ title: 'Clear all workspace data', message: 'This permanently removes tasks, captures, execution history, browser state, API keys, credentials, proxies, preferences, downloads, and local CAPTCHA files. Your account stays signed in.', confirmLabel: 'Clear everything' })) return;
        setSaving(true);
        try {
            const response = await fetch('/api/settings/reset', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: resetPassword }) });
            if (!response.ok) throw new Error('Reset failed');
            setResetPassword(''); onNotify('Workspace data cleared.', 'success'); window.location.assign('/settings/advanced');
        } catch { onNotify('Could not clear workspace data. Check your current password.', 'error'); } finally { setSaving(false); }
    };
    return <div className="space-y-5">
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Account</h3><p className="text-xs theme-text-faint mt-1">Use your current password to protect account changes.</p>
            <div className="mt-5 grid gap-3 max-w-xl"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="New email address (optional)" className="theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text" /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (optional)" className="theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text" /><input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Confirm new password" className="theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text" /><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text" /></div>
            <button type="button" disabled={saving} onClick={saveAccount} className="app-button-primary mt-3 disabled:opacity-50">Save account</button>
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Data retention</h3><p className="text-xs theme-text-faint mt-1">Captures and execution history older than this period are deleted automatically.</p>
            <div className="mt-5 flex flex-wrap gap-3 items-center"><CustomSelect value={choice} options={RETENTION_OPTIONS} onChange={setChoice} ariaLabel="Data retention period" disabled={saving} className="min-w-36" /><button type="button" disabled={saving} onClick={saveRetention} className="app-button-primary disabled:opacity-50">Save retention</button></div>
            <p className="mt-4 text-xs theme-text-faint">Last cleanup: {data?.cleanup?.lastRunAt ? new Date(data.cleanup.lastRunAt).toLocaleString() : 'not run yet'} · {data?.cleanup?.deletedCaptures ?? 0} captures and {data?.cleanup?.deletedExecutions ?? 0} executions removed.</p>
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Maintenance</h3><p className="text-xs theme-text-faint mt-1">Manually remove saved run data when you need to free disk space immediately.</p>
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={() => clearData('captures')} className="app-button-secondary disabled:opacity-50">Clear captures</button><button type="button" disabled={saving} onClick={() => clearData('executions')} className="app-button-secondary disabled:opacity-50">Clear execution history</button></div>
            <div className="mt-7 border-t theme-border pt-5 max-w-xl"><h4 className="text-sm font-bold text-red-500">Clear all workspace data</h4><p className="mt-1 text-xs theme-text-faint">Keeps your account and current sign-in, but permanently removes everything else stored by Figranium.</p><div className="mt-3 flex flex-wrap gap-3"><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Current password" className="theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text" /><button type="button" disabled={saving} onClick={clearEverything} className="app-button-danger disabled:opacity-50">Clear all</button></div></div>
        </section>
        <section className="app-panel p-7">
            <div><h3 className="text-sm font-bold theme-text">CAPTCHA assistance</h3><p className="text-xs theme-text-faint mt-1">Optional local help for supported CAPTCHA challenges. It is only used when a task reaches a CAPTCHA; normal browser and scrape tasks are unaffected.</p></div>
            <div className="mt-5 text-xs theme-text-muted">Local solver: <span className="font-bold theme-text">{data?.captcha?.activeTier || 'Unavailable'}</span>{data?.captcha?.backend ? ` · ${data.captcha.backend}/${data.captcha.device || 'auto'}` : ''}<p className="mt-2 theme-text-faint">Running Figranium through npm does not require any extra CAPTCHA setup. “Unavailable” means local solving is disabled; remote solver services or human handoff can still be used when configured.</p></div>
        </section>
    </div>;
}
