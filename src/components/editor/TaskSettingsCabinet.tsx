import React from 'react';
import { createPortal } from 'react-dom';
import TablerIcon from '../TablerIcon';
import { Task, VarType, Credential, TaskOutput } from '../../types';
import ScheduleTab from './ScheduleTab';
import VariablesTab from './VariablesTab';
import ApiTab from './ApiTab';
import ExtractionTab from './ExtractionTab';
import CustomSelect from '../common/CustomSelect';
import { formatLabel } from '../../utils/taskUtils';

const TRANSLATION_LANGUAGES = [
    { value: 'english', label: 'English' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'french', label: 'French' },
    { value: 'german', label: 'German' },
    { value: 'italian', label: 'Italian' },
    { value: 'portuguese', label: 'Portuguese' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'korean', label: 'Korean' },
    { value: 'chinese_simplified', label: 'Chinese (Simplified)' },
    { value: 'arabic', label: 'Arabic' },
];

interface TaskSettingsCabinetProps {
    isOpen: boolean;
    onClose: () => void;
    currentTask: Task;
    lastResultData?: unknown;
    onUpdateTask: (updates: Partial<Task>) => void;
    proxyListLoaded: boolean;
    proxyList: { id: string }[];
    onStartFieldInspect?: (fieldId: string) => void;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    fieldSelectorOptionsById?: Record<string, string[]>;
}

const TaskSettingsCabinet: React.FC<TaskSettingsCabinetProps & {
    initialTab?: 'mode' | 'variables' | 'behavior' | 'extraction' | 'api' | 'output' | 'schedule' | 'history' | 'cabinets',
    versions: { id: string; timestamp: number; name: string; mode: string }[],
    versionsLoading: boolean,
    isCreatingVersion: boolean,
    onCreateVersion: () => void,
    deletingVersionId: string | null,
    onDeleteVersion: (id: string) => void,
    onRollback: (id: string) => void,
    onPreview: (id: string) => void
}> = ({
    isOpen,
    onClose,
    currentTask,
    lastResultData,
    onUpdateTask,
    proxyListLoaded,
    proxyList,
    onStartFieldInspect,
    onStartGroupContainerInspect,
    onStartGroupFieldInspect,
    fieldSelectorOptionsById,
    initialTab = 'mode',
    versions,
    versionsLoading,
    isCreatingVersion,
    onCreateVersion,
    deletingVersionId,
    onDeleteVersion,
    onRollback,
    onPreview
}) => {
        const [activeTab, setActiveTab] = React.useState<typeof initialTab>(initialTab);
        const [credentials, setCredentials] = React.useState<Credential[]>([]);
        const [newCred, setNewCred] = React.useState({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
        const [showNewCredForm, setShowNewCredForm] = React.useState(false);
        const [credSaving, setCredSaving] = React.useState(false);
        const [outputTables, setOutputTables] = React.useState<{ id: string; name: string; databaseId: string; databaseName: string }[]>([]);
        const [tableFields, setTableFields] = React.useState<{ name: string; type: string }[]>([]);
        const [tablesLoading, setTablesLoading] = React.useState(false);
        const [fieldsLoading, setFieldsLoading] = React.useState(false);
        const [tablesError, setTablesError] = React.useState('');
        const [fieldsError, setFieldsError] = React.useState('');
        const [versionContextMenu, setVersionContextMenu] = React.useState<{ id: string; x: number; y: number } | null>(null);
        const [cabinets, setCabinets] = React.useState<{ id: string; name: string; isDefault?: boolean }[]>([]);
        const [cookieStates, setCookieStates] = React.useState<{ id: string; name: string; cookies: number }[]>([]);

        React.useLayoutEffect(() => {
            if (isOpen) setActiveTab(initialTab);
        }, [isOpen, initialTab]);

        React.useEffect(() => {
            if (!isOpen || activeTab !== 'history') setVersionContextMenu(null);
        }, [activeTab, isOpen]);

        React.useEffect(() => {
            if (!versionContextMenu) return;
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') setVersionContextMenu(null);
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [versionContextMenu]);

        React.useEffect(() => {
            if (isOpen && activeTab === 'output') {
                fetch('/api/credentials').then(r => r.json()).then(setCredentials).catch(() => {});
            }
        }, [isOpen, activeTab]);

        React.useEffect(() => {
            if (!isOpen || activeTab !== 'cabinets') return;
            fetch('/api/cookie-states').then(r => r.ok ? r.json() : null).then(data => setCookieStates(data?.states || [])).catch(() => setCookieStates([]));
            fetch('/api/cabinets').then(r => r.ok ? r.json() : null).then(data => setCabinets(data?.cabinets || [])).catch(() => setCabinets([]));
        }, [isOpen, activeTab]);

        React.useEffect(() => {
            const credentialId = currentTask.output?.credentialId;
            if (!credentialId || !isOpen || activeTab !== 'output') return;
            let cancelled = false;
            setTablesLoading(true);
            setTablesError('');
            setOutputTables([]);
            fetch(`/api/credentials/${credentialId}/proxy/baserow/tables`)
                .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.detail || data.error); return data; })
                .then(data => { if (!cancelled) setOutputTables(data); })
                .catch(error => { if (!cancelled) setTablesError(error.message || 'Could not load Baserow tables.'); })
                .finally(() => { if (!cancelled) setTablesLoading(false); });
            return () => { cancelled = true; };
        }, [currentTask.output?.credentialId, isOpen, activeTab]);

        React.useEffect(() => {
            const credentialId = currentTask.output?.credentialId;
            const tableId = currentTask.output?.tableId;
            if (!credentialId || !tableId || !isOpen || activeTab !== 'output') { setTableFields([]); setFieldsLoading(false); return; }
            let cancelled = false;
            setFieldsError('');
            setTableFields([]);
            setFieldsLoading(true);
            fetch(`/api/credentials/${credentialId}/proxy/baserow/tables/${tableId}/fields`)
                .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.detail || data.error); return data; })
                .then(data => { if (!cancelled) setTableFields(data); })
                .catch(error => { if (!cancelled) setFieldsError(error.message || 'Could not inspect table fields.'); })
                .finally(() => { if (!cancelled) setFieldsLoading(false); });
            return () => { cancelled = true; };
        }, [currentTask.output?.credentialId, currentTask.output?.tableId, isOpen, activeTab]);

        const outputKeys = React.useMemo(() => {
            let sample: unknown = lastResultData;
            if (typeof sample === 'string') { try { sample = JSON.parse(sample); } catch { sample = null; } }
            const rows = Array.isArray(sample) ? sample : [sample];
            const sampledKeys = rows.flatMap(row => row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : []);
            if (sampledKeys.length) return [...new Set(sampledKeys)];
            if (currentTask.extractionMode === 'javascript') return [];
            return [...new Set([...(currentTask.extractionFields || []).map(field => field.name), ...(currentTask.extractionGroups || []).map(group => group.name)].filter(Boolean))];
        }, [lastResultData, currentTask.extractionMode, currentTask.extractionFields, currentTask.extractionGroups]);
        const missingFields = outputKeys.filter(key => !tableFields.some(field => field.name === key));
        const selectedDatabaseId = currentTask.output?.databaseId || outputTables.find(table => table.id === currentTask.output?.tableId)?.databaseId || '';

        const saveNewCredential = async () => {
            if (!newCred.name || !newCred.token) return;
            setCredSaving(true);
            try {
                const resp = await fetch('/api/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newCred.name, provider: 'baserow', config: { baseUrl: newCred.baseUrl, token: newCred.token } })
                });
                if (resp.ok) {
                    const created = await resp.json();
                    setCredentials(prev => [...prev, created]);
                    setNewCred({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
                    setShowNewCredForm(false);
                    if (!currentTask.output?.credentialId) {
                        onUpdateTask({ output: { ...currentTask.output as TaskOutput, credentialId: created.id, provider: 'baserow', tableId: currentTask.output?.tableId || '', onError: currentTask.output?.onError || 'ignore' } });
                    }
                }
            } finally {
                setCredSaving(false);
            }
        };

        const deleteCredential = async (id: string) => {
            await fetch(`/api/credentials/${id}`, { method: 'DELETE' });
            setCredentials(prev => prev.filter(c => c.id !== id));
            if (currentTask.output?.credentialId === id) {
                onUpdateTask({ output: { ...currentTask.output as TaskOutput, credentialId: '' } });
            }
        };

        if (!isOpen) return null;

        const rotateProxiesDisabled = proxyListLoaded && proxyList.length === 1 && proxyList[0]?.id === 'host';

        const updateVariable = (oldName: string, name: string, type: VarType, value: any) => {
            if (['password', 'uname'].includes(name.trim().toLowerCase())) return;
            const nextVars = { ...currentTask.variables };
            if (oldName !== name) delete nextVars[oldName];
            nextVars[name] = { type, value };
            onUpdateTask({ variables: nextVars });
        };

        const removeVariable = (name: string) => {
            const nextVars = { ...currentTask.variables };
            delete nextVars[name];
            onUpdateTask({ variables: nextVars });
        };

        const addVariable = () => {
            const name = `var_${Object.keys(currentTask.variables || {}).length + 1}`;
            updateVariable(name, name, 'string', '');
        };

        const toggleStealth = (key: keyof Task['stealth']) => {
            onUpdateTask({
                stealth: {
                    ...currentTask.stealth,
                    [key]: !currentTask.stealth[key]
                }
            });
        };

        const renderTabButton = (id: typeof activeTab, label: string, icon: string) => (
            <button
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${activeTab === id
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] shadow-lg shadow-black/10 focus-visible:ring-blue-500'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-glass-card-hover)] focus-visible:ring-white/50'
                    }`}
            >
                <TablerIcon name={icon} className="text-sm" />
                {label}
            </button>
        );

        return (
            <>
            <div className="fixed inset-y-0 right-0 w-[450px] z-[100] flex">
                {/* Backdrop for closing */}
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

                {/* The Cabinet */}
                <div className="relative h-full w-full glass border-l theme-border shadow-[-20px_0_50px_rgba(0,0,0,0.15)] flex flex-col animate-in slide-in-from-right duration-300 ease-out p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-bold text-[var(--app-text)] tracking-tight">Task Settings</h2>
                            <p className="text-xs text-[var(--app-text-muted)] tracking-[0.2em] mt-1">{currentTask.name || 'Untitled Task'}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[var(--app-glass-card-hover)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            aria-label="Close settings"
                            title="Close settings"
                        >
                            <TablerIcon name="close" />
                        </button>
                    </div>

                    {/* Description — always visible regardless of active tab */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em] block mb-2">Description</label>
                        <textarea
                            value={currentTask.description || ''}
                            onChange={(e) => onUpdateTask({ description: e.target.value })}
                            placeholder="What does this task do? Give AI agents and operators context..."
                            rows={3}
                            className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2.5 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)] resize-none transition-all custom-scrollbar"
                        />
                    </div>

                    {/* Tabs Nav */}
                    <div role="tablist" className="flex flex-wrap gap-2 mb-8 bg-[var(--app-input)] p-1 rounded-2xl border border-[var(--app-border)]">
                        {renderTabButton('mode', 'Mode', 'settings_input_component')}
                        {renderTabButton('variables', 'Vars', 'variables')}
                        {renderTabButton('behavior', 'Behavior', 'device_gamepad_3')}
                        {renderTabButton('extraction', 'Extract', 'terminal')}
                        {renderTabButton('api', 'API', 'api')}
                        {renderTabButton('output', 'Output', 'outbound')}
                        {renderTabButton('schedule', 'Schedule', 'event_repeat')}
                        {renderTabButton('cabinets', 'States', 'polygon')}
                        {renderTabButton('history', 'History', 'history_toggle')}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                        {activeTab === 'mode' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Execution Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => onUpdateTask({ mode: 'agent' })}
                                            className={`p-4 rounded-2xl border transition-all text-left space-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.mode === 'agent'
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] ring-1 ring-[var(--app-border-strong)]'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] opacity-50 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--app-input)] flex items-center justify-center">
                                                <TablerIcon name="ads_click" className="text-[var(--app-text-muted)]" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-[var(--app-text)]">Agent Mode</div>
                                                <div className="text-xs text-[var(--app-text-faint)]">Custom action sequence with logic</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => onUpdateTask({ mode: 'scrape' })}
                                            className={`p-4 rounded-2xl border transition-all text-left space-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.mode === 'scrape'
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] ring-1 ring-[var(--app-border-strong)]'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] opacity-50 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--app-input)] flex items-center justify-center">
                                                <TablerIcon name="language" className="text-[var(--app-text-muted)]" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-[var(--app-text)]">Scrape Mode</div>
                                                <div className="text-xs text-[var(--app-text-faint)]">Fixed data extraction flow</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'variables' && <VariablesTab currentTask={currentTask} addVariable={addVariable} updateVariable={updateVariable} removeVariable={removeVariable} />}

                        {activeTab === 'behavior' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Runtime Flags</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {[
                                            { label: 'Disable Recording', key: 'disableRecording', icon: 'videocam_off' },
                                            { label: 'Rotate Proxies', key: 'rotateProxies', icon: 'vpn_lock', disabled: rotateProxiesDisabled },
                                            { label: 'Rotate User Agents', key: 'rotateUserAgents', icon: 'person_search' },
                                            { label: 'Rotate Viewport', key: 'rotateViewport', icon: 'screenshot_monitor' },
                                            { label: 'Include Shadow DOM', key: 'includeShadowDom', icon: 'layers' },
                                            { label: 'Auto-Solve Captchas', key: 'autoSolveCaptcha', icon: 'verified_user' },
                                        ].map((item) => (
                                            <button
                                                key={item.key}
                                                disabled={item.disabled}
                                                role="switch"
                                                aria-checked={!!currentTask[item.key as keyof Task]}
                                                onClick={() => onUpdateTask({ [item.key]: !currentTask[item.key as keyof Task] })}
                                                className={`flex items-center justify-between p-4 rounded-2xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask[item.key as keyof Task]
                                                    ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)]'
                                                    : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] opacity-60 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                    } ${item.disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <TablerIcon name={item.icon} className="text-sm opacity-70" />
                                                    <span className="text-xs font-medium">{item.label}</span>
                                                </div>
                                                <div className={`w-8 h-4 rounded-full relative transition-colors ${currentTask[item.key as keyof Task] ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}>
                                                    <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask[item.key as keyof Task] ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Page Translation</label>
                                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-3)] p-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <TablerIcon name="translate" className="text-sm opacity-70" />
                                                <div>
                                                    <p className="text-xs font-medium text-[var(--app-text)]">Translate visited pages</p>
                                                    <p className="mt-1 text-xs text-[var(--app-text-faint)]">Uses translate.js in browser-backed task runs.</p>
                                                </div>
                                            </div>
                                            <button
                                                role="switch"
                                                aria-checked={!!currentTask.translation?.enabled}
                                                onClick={() => onUpdateTask({
                                                    translation: {
                                                        enabled: !currentTask.translation?.enabled,
                                                        targetLanguage: currentTask.translation?.targetLanguage || 'english'
                                                    }
                                                })}
                                                className={`w-8 h-4 rounded-full relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.translation?.enabled ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}
                                                aria-label="Translate visited pages"
                                            >
                                                <span className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask.translation?.enabled ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                            </button>
                                        </div>
                                        {currentTask.translation?.enabled && (
                                            <div className="mt-4">
                                                <label className="mb-2 block text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Translate to</label>
                                                <CustomSelect
                                                    value={currentTask.translation.targetLanguage || 'english'}
                                                    onChange={(targetLanguage) => onUpdateTask({
                                                        translation: { enabled: true, targetLanguage }
                                                    })}
                                                    options={TRANSLATION_LANGUAGES}
                                                    ariaLabel="Translation target language"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Stealth & Behavior</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Human Typing', key: 'naturalTyping', icon: 'keyboard' },
                                            { label: 'Cursor Glide', key: 'cursorGlide', icon: 'near_me' },
                                            { label: 'Idle Moves', key: 'idleMovements', icon: 'mouse' },
                                            { label: 'Dead Clicks', key: 'deadClicks', icon: 'ads_click' },
                                            { label: 'Fatigue Sim', key: 'fatigue', icon: 'hourglass_empty' },
                                            { label: 'Allow Typos', key: 'allowTypos', icon: 'spellcheck' },
                                            { label: 'Random Clicks', key: 'randomizeClicks', icon: 'shuffle' },
                                            { label: 'Overscroll', key: 'overscroll', icon: 'unfold_more' },
                                        ].map((item) => (
                                            <button
                                                key={item.key}
                                                role="switch"
                                                aria-checked={!!currentTask.stealth[item.key as keyof Task['stealth']]}
                                                onClick={() => toggleStealth(item.key as keyof Task['stealth'])}
                                                className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.stealth[item.key as keyof Task['stealth']]
                                                    ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)]'
                                                    : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] opacity-60 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                    }`}
                                            >
                                                <TablerIcon name={item.icon} className="text-sm opacity-70" />
                                                <span className="text-xs font-bold tracking-tight">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'cabinets' && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Cookie state</label>
                                    <p className="text-xs text-[var(--app-text-faint)]">Attached runs use and update this isolated state. Detached runs start with no cookies.</p>
                                    <CustomSelect
                                        value={currentTask.cookieStateId === undefined ? 'cookies_default' : currentTask.cookieStateId || ''}
                                        onChange={(cookieStateId) => onUpdateTask({ cookieStateId: cookieStateId || null })}
                                        options={[...cookieStates.map(state => ({ value: state.id, label: `${state.name} (${state.cookies} cookies)` })), { value: '', label: 'No State' }]}
                                        ariaLabel="Attached cookie state"
                                    />
                                    <a href="/vault" className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-[var(--app-accent)] hover:opacity-80"><TablerIcon name="open_in_new" className="text-sm" /> Manage Vault</a>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Download destination</label>
                                    <p className="mt-2 text-xs text-[var(--app-text-faint)]">Downloads made by this automation are saved in this cabinet.</p>
                                </div>
                                <CustomSelect
                                    value={currentTask.downloadCabinetId || ''}
                                    onChange={(downloadCabinetId) => onUpdateTask({ downloadCabinetId })}
                                    options={cabinets.length ? cabinets.map(c => ({ value: c.id, label: `${c.name}${c.isDefault ? ' (Default)' : ''}`, icon: 'inventory_2' })) : [{ value: '', label: 'Loading cabinets…', disabled: true }]}
                                    ariaLabel="Download cabinet"
                                />
                                <a href="/cabinets" className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-[var(--app-accent)] hover:opacity-80"><TablerIcon name="open_in_new" className="text-sm" /> Manage Cabinets</a>
                            </div>
                        )}

                        {activeTab === 'extraction' && (
                            <ExtractionTab
                                currentTask={currentTask}
                                onUpdateTask={onUpdateTask}
                                onStartFieldInspect={onStartFieldInspect}
                                onStartGroupContainerInspect={onStartGroupContainerInspect}
                                onStartGroupFieldInspect={onStartGroupFieldInspect}
                                fieldSelectorOptionsById={fieldSelectorOptionsById}
                            />
                        )}



                        {activeTab === 'api' && <ApiTab currentTask={currentTask} onUpdateTask={onUpdateTask} />}

                        {activeTab === 'output' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* Enable toggle */}
                                <button
                                    role="switch"
                                    aria-checked={!!currentTask.output}
                                    onClick={() => onUpdateTask({ output: currentTask.output ? undefined : { provider: 'baserow', credentialId: '', tableId: '', onError: 'ignore' } })}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--app-surface-3)] border border-[var(--app-border)] hover:bg-[var(--app-surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                >
                                    <div className="text-left">
                                        <span className="text-xs font-medium text-[var(--app-text)]">Push results to destination</span>
                                        <p className="text-xs text-[var(--app-text-faint)] mt-0.5">Send extracted data to an external table after each run</p>
                                    </div>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${currentTask.output ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}>
                                        <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask.output ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                    </div>
                                </button>

                                {currentTask.output && (<>
                                    {/* Provider dropdown */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Provider</label>
                                        <CustomSelect
                                            value={currentTask.output.provider}
                                            onChange={(provider) => onUpdateTask({ output: { ...currentTask.output as TaskOutput, provider, credentialId: '', tableId: '' } })}
                                            options={[{ value: 'baserow' as const, label: 'Baserow' }]}
                                            ariaLabel="Output provider"
                                        />
                                    </div>

                                    {/* Credential picker */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Credential</label>
                                            <button
                                                onClick={() => setShowNewCredForm(v => !v)}
                                                className="text-xs font-bold text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                                            >
                                                <TablerIcon name="add" className="text-xs" />
                                                New
                                            </button>
                                        </div>

                                        {showNewCredForm && (
                                            <div className="space-y-2 p-3 rounded-xl bg-[var(--app-surface-3)] border border-[var(--app-border)]">
                                                <input
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    placeholder="Name (e.g. My Baserow)"
                                                    value={newCred.name}
                                                    onChange={e => setNewCred(v => ({ ...v, name: e.target.value }))}
                                                />
                                                <input
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    placeholder="Base URL"
                                                    value={newCred.baseUrl}
                                                    onChange={e => setNewCred(v => ({ ...v, baseUrl: e.target.value }))}
                                                />
                                                <input
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    placeholder="API Token"
                                                    type="password"
                                                    value={newCred.token}
                                                    onChange={e => setNewCred(v => ({ ...v, token: e.target.value }))}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={saveNewCredential}
                                                        disabled={credSaving || !newCred.name || !newCred.token}
                                                        className="flex-1 py-1.5 rounded-lg bg-[var(--app-accent)] text-[var(--app-accent-text)] text-xs font-bold disabled:opacity-40 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    >
                                                        {credSaving ? 'Saving…' : 'Save'}
                                                    </button>
                                                    <button
                                                        onClick={() => setShowNewCredForm(false)}
                                                        className="px-3 py-1.5 rounded-lg bg-[var(--app-surface-3)] text-[var(--app-text-muted)] text-xs font-bold hover:text-[var(--app-text)] border border-[var(--app-border)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {(() => {
                                            const filtered = credentials.filter(c => c.provider === currentTask.output?.provider);
                                            return filtered.length === 0 && !showNewCredForm ? (
                                                <p className="text-xs text-[var(--app-text-faint)]">No credentials yet. Click <span className="text-[var(--app-text-muted)]">+ New</span> to add one.</p>
                                            ) : (
                                                <CustomSelect
                                                    value={currentTask.output.credentialId}
                                                    onChange={(credentialId) => onUpdateTask({ output: { ...currentTask.output as TaskOutput, credentialId, databaseId: undefined, tableId: '' } })}
                                                    options={[{ value: '', label: 'Select credential…' }, ...filtered.map((credential) => ({ value: credential.id, label: credential.name }))]}
                                                    ariaLabel="Output credential"
                                                />
                                            );
                                        })()}

                                        {/* Credential list with delete */}
                                        {credentials.filter(c => c.provider === currentTask.output?.provider).length > 0 && (
                                            <div className="space-y-1">
                                                {credentials.filter(c => c.provider === currentTask.output?.provider).map(c => (
                                                    <div key={c.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--app-surface-3)] border border-[var(--app-border)]">
                                                        <div>
                                                            <span className="text-xs text-[var(--app-text)]">{c.name}</span>
                                                            <span className="text-xs text-[var(--app-text-faint)] ml-2">{c.config.baseUrl}</span>
                                                        </div>
                                                        <button onClick={() => deleteCredential(c.id)} className="text-[var(--app-text-faint)] hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded">
                                                            <TablerIcon name="delete" className="text-sm" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {currentTask.output.credentialId && (
                                        <div className="space-y-2 rounded-xl border border-[var(--app-border)] p-3">
                                            <p className="text-xs font-medium text-[var(--app-text)]">Existing Baserow destination</p>
                                            <p className="text-xs text-[var(--app-text-muted)]">Use a Baserow database token with read and create-row access. Create the database, table, and fields in Baserow first.</p>
                                            <CustomSelect value={selectedDatabaseId}
                                                onChange={databaseId => onUpdateTask({ output: { ...currentTask.output as TaskOutput, databaseId, tableId: '' } })}
                                                options={[{ value: '', label: tablesLoading ? 'Loading databases…' : 'Choose database…' }, ...[...new Map(outputTables.map(t => [t.databaseId, { value: t.databaseId, label: t.databaseName }])).values()], ...(selectedDatabaseId && !outputTables.some(t => t.databaseId === selectedDatabaseId) ? [{ value: selectedDatabaseId, label: `Saved database ${selectedDatabaseId}` }] : [])]}
                                                ariaLabel="Baserow database" />
                                            {selectedDatabaseId && <CustomSelect value={currentTask.output.tableId}
                                                onChange={tableId => onUpdateTask({ output: { ...currentTask.output as TaskOutput, databaseId: selectedDatabaseId, tableId, dedicated: false } })}
                                                options={[{ value: '', label: 'Choose table…' }, ...outputTables.filter(t => t.databaseId === selectedDatabaseId).map(t => ({ value: t.id, label: t.name })), ...(currentTask.output.tableId && !outputTables.some(t => t.id === currentTask.output?.tableId && t.databaseId === selectedDatabaseId) ? [{ value: currentTask.output.tableId, label: `Saved table ${currentTask.output.tableId}` }] : [])]}
                                                ariaLabel="Baserow table" />}
                                            {tablesError && <p role="alert" className="text-xs text-red-400">{tablesError}</p>}
                                            {!tablesLoading && !tablesError && outputTables.length === 0 && <p className="text-xs text-[var(--app-text-muted)]">No accessible tables found. Check the token's read permission in Baserow.</p>}
                                            {currentTask.output.tableId && <div className="space-y-1 text-xs text-[var(--app-text-muted)]">
                                                <p className="font-medium text-[var(--app-text)]">Fields to create in the selected table</p>
                                                {fieldsLoading ? <p>Loading table fields…</p> : fieldsError ? <p role="alert" className="text-red-400">{fieldsError}</p> : outputKeys.length === 0 ? <p>Run the task once with JSON output to identify the fields from its extraction script.</p> : missingFields.length ? <p>{missingFields.join(', ')}. Use field types compatible with the JSON values; Long text works for text and nested JSON.</p> : <p>All known output fields are present.</p>}
                                            </div>}
                                        </div>
                                    )}

                                    {/* On Error */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">On Push Error</label>
                                        <div className="flex gap-2">
                                            {(['ignore', 'fail'] as const).map(val => (
                                                <button
                                                    key={val}
                                                    onClick={() => onUpdateTask({ output: { ...currentTask.output as TaskOutput, onError: val } })}
                                                    className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${currentTask.output?.onError === val ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] focus-visible:ring-blue-500' : 'bg-[var(--app-surface-3)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] focus-visible:ring-white/50'}`}
                                                >
                                                    {val === 'ignore' ? 'Ignore' : 'Log Error'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-[var(--app-text-faint)]">
                                            {currentTask.output.onError === 'fail'
                                                ? 'Push errors will be logged prominently in the server console.'
                                                : 'Push errors will be silently suppressed.'}
                                        </p>
                                    </div>
                                </>)}
                            </div>
                        )}

                        {activeTab === 'schedule' && (
                            <ScheduleTab currentTask={currentTask} onUpdateTask={onUpdateTask} />
                        )}

                        {activeTab === 'history' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Version History</label>
                                    <div className="flex items-center gap-3">
                                        {versionsLoading && <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-text)]" />}
                                        <button
                                            type="button"
                                            onClick={onCreateVersion}
                                            disabled={isCreatingVersion || versionsLoading}
                                            className="theme-accent-bg flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-border-strong)]"
                                        >
                                            <TablerIcon name={isCreatingVersion ? 'progress_activity' : 'add'} className={`text-sm ${isCreatingVersion ? 'animate-spin' : ''}`} />
                                            {isCreatingVersion ? 'Creating…' : 'New Version'}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {versions.map((v) => (
                                        <div
                                            key={v.id}
                                            onContextMenu={(event) => {
                                                event.preventDefault();
                                                setVersionContextMenu({
                                                    id: v.id,
                                                    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 184)),
                                                    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 64)),
                                                });
                                            }}
                                            className={`bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4 flex items-center justify-between group hover:border-[var(--app-border-strong)] transition-all ${deletingVersionId === v.id ? 'pointer-events-none opacity-50' : ''}`}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs font-bold text-[var(--app-text)] mb-0.5">{new Date(v.timestamp).toLocaleString()}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--app-surface-2)] text-[var(--app-text-muted)] font-bold tracking-widest">{formatLabel(v.mode)}</span>
                                                    <span className="text-xs text-[var(--app-text-faint)] truncate max-w-[150px]">{v.name || 'Untitled'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => onPreview(v.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--app-text-faint)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-2)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    title="Preview version"
                                                    aria-label="Preview version"
                                                >
                                                    <TablerIcon name="visibility" className="text-sm" />
                                                </button>
                                                <button
                                                    onClick={() => onRollback(v.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--app-text-faint)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-2)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    title="Rollback to this version"
                                                    aria-label="Rollback to this version"
                                                >
                                                    <TablerIcon name="restore" className="text-sm" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {versions.length === 0 && !versionsLoading && (
                                        <div className="text-center py-12 border border-dashed border-[var(--app-border)] rounded-3xl">
                                            <p className="text-xs text-[var(--app-text-faint)] tracking-widest">No previous versions found</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {versionContextMenu && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[249]"
                        onMouseDown={() => setVersionContextMenu(null)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setVersionContextMenu(null);
                        }}
                    />
                    <div
                        role="menu"
                        aria-label="Version actions"
                        className="theme-surface theme-text fixed z-[250] w-44 rounded-xl border theme-border-strong p-1.5 shadow-2xl"
                        style={{ left: versionContextMenu.x, top: versionContextMenu.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                const versionId = versionContextMenu.id;
                                setVersionContextMenu(null);
                                onDeleteVersion(versionId);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                        >
                            <TablerIcon name="delete" className="text-sm" />
                            Delete version
                        </button>
                    </div>
                </>,
                document.body,
            )}
            </>
        );
    };

export default TaskSettingsCabinet;
