import React, { useEffect, useState } from 'react';
import TablerIcon from '../TablerIcon';

export interface DatabaseConfigStatus {
    configured: boolean;
    db_protocol: string;
    source: 'environment' | 'settings' | 'none';
    restartRequired: boolean;
}

interface DatabasePanelProps {
    config: DatabaseConfigStatus;
    loading: boolean;
    saving: boolean;
    onSave: (config: Record<string, string>) => Promise<void>;
}

const FIELD_DEFINITIONS = [
    { key: 'db_protocol', label: 'db_protocol', placeholder: 'postgres', type: 'text' },
    { key: 'db_username', label: 'db_username', placeholder: 'Database username', type: 'text' },
    { key: 'db_password', label: 'db_password', placeholder: 'Database password', type: 'password' },
    { key: 'db_host', label: 'db_host', placeholder: 'Database host', type: 'text' },
    { key: 'db_port', label: 'db_port', placeholder: '5432', type: 'text' },
    { key: 'db_database', label: 'db_database', placeholder: 'postgres', type: 'text' },
] as const;

const emptyDraft = () => Object.fromEntries(FIELD_DEFINITIONS.map(({ key }) => [key, key === 'db_protocol' ? 'postgres' : ''])) as Record<string, string>;

const DatabasePanel: React.FC<DatabasePanelProps> = ({ config, loading, saving, onSave }) => {
    const [draft, setDraft] = useState<Record<string, string>>(emptyDraft);

    useEffect(() => {
        setDraft(emptyDraft());
    }, [config.configured, config.source]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        await onSave(draft);
        setDraft(emptyDraft());
    };

    const existingValueHint = config.configured ? 'Saved value is intentionally hidden. Leave blank to keep it.' : undefined;

    return (
        <form className="app-panel p-7" onSubmit={handleSubmit}>
            <div className="mb-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-surface-2)]">
                        <TablerIcon name="database" className="text-lg text-[var(--app-text)]" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-[var(--app-text)]">PostgreSQL</h3>
                        <p className="mt-1 text-xs text-[var(--app-text-faint)]">Configure the storage database for the next server start.</p>
                    </div>
                </div>
            </div>

            {config.source === 'environment' && (
                <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
                    Environment configuration is active and takes priority. Values remain hidden here.
                </div>
            )}

            <div className="mb-5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-3)] px-4 py-3 text-xs text-[var(--app-text-muted)]">
                All saved connection values are intentionally obscured. Enter a replacement value only for fields you want to change.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {FIELD_DEFINITIONS.map(({ key, label, placeholder, type }) => (
                    <label key={key} className="block">
                        <span className="mb-2 block font-mono text-xs font-bold text-[var(--app-text-muted)]">{label}</span>
                        <input
                            type={type}
                            value={draft[key] || ''}
                            onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                            placeholder={existingValueHint || placeholder}
                            title={existingValueHint}
                            required={!config.configured || config.source === 'environment'}
                            autoComplete={type === 'password' ? 'new-password' : 'off'}
                            className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2.5 font-mono text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:border-[var(--app-border-strong)] focus:outline-none"
                        />
                    </label>
                ))}
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-xs text-[var(--app-text-faint)]">{config.restartRequired ? 'Restart Figranium after saving to activate these settings.' : ''}</p>
                <button
                    type="submit"
                    disabled={loading || saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--app-accent)] px-4 py-2.5 text-xs font-bold text-[var(--app-accent-text)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <TablerIcon name="save" className="text-sm" />
                    {saving ? 'Saving…' : 'Save configuration'}
                </button>
            </div>
        </form>
    );
};

export default DatabasePanel;
