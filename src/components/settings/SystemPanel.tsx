import { useCallback, useEffect, useRef, useState } from 'react';
import TablerIcon from '../TablerIcon';
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

export default function SystemPanel({ onConfirm, onNotify, onLogout }: { onConfirm: (request: string | ConfirmRequest) => Promise<boolean>; onNotify: (message: string, tone?: 'success' | 'error') => void; onLogout: () => void }) {
    const [data, setData] = useState<SystemData | null>(null);
    const [choice, setChoice] = useState<string>('7');
    const [saving, setSaving] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [resetPassword, setResetPassword] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportSelection, setExportSelection] = useState<Record<string, boolean>>({
        tasks: true, executions: true, captures: true, apiKeys: true, cookies: true, connections: true
    });
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importAvailable, setImportAvailable] = useState<string[]>([]);
    const [importSelection, setImportSelection] = useState<Record<string, boolean>>({});
    const [importing, setImporting] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);
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
    const exportData = async () => {
        const selected = Object.entries(exportSelection).filter(([, enabled]) => enabled).map(([key]) => key);
        if (!selected.length) return onNotify('Select at least one data type to export.', 'error');
        setExporting(true);
        try {
            const response = await fetch('/api/settings/export', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ include: selected })
            });
            if (!response.ok) throw new Error('Export failed');
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || 'figranium-export.zip';
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove();
            URL.revokeObjectURL(url);
            onNotify('Data export downloaded.', 'success');
        } catch { onNotify('Failed to export data.', 'error'); } finally { setExporting(false); }
    };
    const inspectImport = async (file: File | null) => {
        setImportFile(file); setImportAvailable([]); setImportSelection({});
        if (!file) return;
        try {
            const response = await fetch('/api/settings/import/inspect', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/zip' }, body: file });
            if (!response.ok) throw new Error('Invalid export');
            const result = await response.json();
            setImportAvailable(result.available || []);
            setImportSelection(Object.fromEntries((result.available || []).map((key: string) => [key, true])));
        } catch { setImportFile(null); onNotify('Choose a valid Figranium export ZIP.', 'error'); }
    };
    const importData = async () => {
        if (!importFile) return onNotify('Choose a Figranium export ZIP first.', 'error');
        const selected = importAvailable.filter((key) => importSelection[key]);
        if (!selected.length) return onNotify('Select at least one data type to import.', 'error');
        if (!await onConfirm({ title: 'Import selected data', message: 'Selected imported data will replace matching workspace data. Existing data in unselected categories will stay unchanged.', confirmLabel: 'Import data' })) return;
        setImporting(true);
        try {
            const response = await fetch(`/api/settings/import?include=${encodeURIComponent(selected.join(','))}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/zip' }, body: importFile });
            if (!response.ok) throw new Error('Import failed');
            onNotify('Selected data imported.', 'success');
            setImportFile(null); setImportAvailable([]); setImportSelection({});
        } catch { onNotify('Failed to import data.', 'error'); } finally { setImporting(false); }
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
        <section className="app-panel p-7 flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-sm font-bold theme-text">Session</h3><p className="text-xs theme-text-faint mt-1">Sign out of this Figranium workspace on this device.</p></div>
            <button type="button" onClick={onLogout} className="app-button-danger">Sign out</button>
        </section>
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
            <div><h3 className="text-sm font-bold theme-text">CAPTCHA assistance</h3><p className="text-xs theme-text-faint mt-1">Optional local help for supported CAPTCHA challenges. It is only used when a task reaches a CAPTCHA; normal browser and scrape tasks are unaffected.</p></div>
            <div className="mt-5 text-xs theme-text-muted">Local solver: <span className="font-bold theme-text">{data?.captcha?.activeTier || 'Unavailable'}</span>{data?.captcha?.backend ? ` · ${data.captcha.backend}/${data.captcha.device || 'auto'}` : ''}<p className="mt-2 theme-text-faint">Running Figranium through npm does not require any extra CAPTCHA setup. “Unavailable” means local solving is disabled; remote solver services or human handoff can still be used when configured.</p></div>
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Export data</h3>
            <p className="text-xs theme-text-faint mt-1">Download a portable ZIP containing only the Figranium data you select.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-w-3xl">
                {[
                    ['tasks', 'Tasks'], ['executions', 'Executions'], ['captures', 'Captures'],
                    ['apiKeys', 'API Keys'], ['cookies', 'Cookie states'], ['connections', 'Connections']
                ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 rounded-xl border theme-border px-4 py-3 text-sm theme-text cursor-pointer">
                        <input type="checkbox" checked={!!exportSelection[key]} onChange={(event) => setExportSelection((current) => ({ ...current, [key]: event.target.checked }))} className="size-4 accent-blue-600" />
                        <span>{label}</span>
                    </label>
                ))}
            </div>
            <p className="mt-4 text-xs theme-text-faint">Archives include API key values, session cookies, and connection tokens. Store exported ZIP files securely.</p>
            <button type="button" disabled={saving || exporting} onClick={exportData} className="app-button-primary mt-4 disabled:opacity-50">{exporting ? 'Exporting…' : 'Export selected'}</button>
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Import data</h3>
            <p className="text-xs theme-text-faint mt-1">Restore selected data from a Figranium export ZIP. Imported categories replace their matching workspace data.</p>
            <div className="mt-5 flex max-w-xl items-center gap-3 rounded-xl border theme-border bg-[var(--app-input)] p-2">
                <input ref={importInputRef} type="file" accept=".zip,application/zip" onChange={(event) => void inspectImport(event.target.files?.[0] || null)} className="hidden" />
                <button type="button" onClick={() => importInputRef.current?.click()} className="app-button-secondary shrink-0"><TablerIcon name="upload_file" /> Choose ZIP</button>
                <span className={`min-w-0 truncate text-sm ${importFile ? 'theme-text' : 'theme-text-faint'}`}>{importFile?.name || 'No file selected'}</span>
            </div>
            {importFile && importAvailable.length > 0 && <div className="mt-4">
                <p className="text-xs theme-text-faint mb-2">Choose what to import from <span className="font-bold theme-text">{importFile.name}</span>.</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-w-3xl">
                    {[
                        ['tasks', 'Tasks'], ['executions', 'Executions'], ['captures', 'Captures'],
                        ['apiKeys', 'API Keys'], ['cookies', 'Cookie states'], ['connections', 'Connections']
                    ].filter(([key]) => importAvailable.includes(key)).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-3 rounded-xl border theme-border px-4 py-3 text-sm theme-text cursor-pointer">
                            <input type="checkbox" checked={!!importSelection[key]} onChange={(event) => setImportSelection((current) => ({ ...current, [key]: event.target.checked }))} className="size-4 accent-blue-600" />
                            <span>{label}</span>
                        </label>
                    ))}
                </div>
                <button type="button" disabled={saving || importing} onClick={importData} className="app-button-primary mt-4 disabled:opacity-50">{importing ? 'Importing…' : 'Import selected'}</button>
            </div>}
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Maintenance</h3><p className="text-xs theme-text-faint mt-1">Manually remove saved run data when you need to free disk space immediately.</p>
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={() => clearData('captures')} className="app-button-secondary disabled:opacity-50">Clear captures</button><button type="button" disabled={saving} onClick={() => clearData('executions')} className="app-button-secondary disabled:opacity-50">Clear execution history</button></div>
            <div className="mt-7 border-t theme-border pt-5 max-w-xl"><h4 className="text-sm font-bold text-red-500">Clear all workspace data</h4><p className="mt-1 text-xs theme-text-faint">Keeps your account and current sign-in, but permanently removes everything else stored by Figranium.</p><div className="mt-3 flex flex-wrap gap-3"><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Current password" className="theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text" /><button type="button" disabled={saving} onClick={clearEverything} className="app-button-danger disabled:opacity-50">Clear all</button></div></div>
        </section>
    </div>;
}
