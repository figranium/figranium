import React, { useState, useEffect, useCallback } from 'react';
import { ConfirmRequest, Credential } from '../types';
import ApiKeysPanel, { ApiKeyConfig, DbProviderConfig } from './settings/ApiKeysPanel';
import ProxiesPanel from './settings/ProxiesPanel';
import UserAgentPanel from './settings/UserAgentPanel';
import VersionPanel from './settings/VersionPanel';
import ThemePanel from './settings/ThemePanel';
import SystemPanel from './settings/SystemPanel';
import { APP_VERSION } from '@/utils/appInfo';
import TablerIcon from './TablerIcon';
import { useTheme } from '../hooks/useTheme';
import { useNavigate, useParams } from 'react-router-dom';
import { formatLabel } from '../utils/taskUtils';

type SettingsSection = 'api-keys' | 'user-agent' | 'proxies' | 'advanced' | 'appearance' | 'about';

const SETTINGS_SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
    { id: 'api-keys', label: 'API Keys', icon: 'key' },
    { id: 'user-agent', label: 'User Agent', icon: 'language' },
    { id: 'proxies', label: 'Proxies', icon: 'security' },
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'about', label: 'About', icon: 'info' },
    { id: 'advanced', label: 'Advanced', icon: 'settings-cog' },
];

interface SettingsScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({
    onConfirm,
    onNotify
}) => {
    const navigate = useNavigate();
    const { section: sectionParam } = useParams<{ section?: string }>();
    const routeSection = SETTINGS_SECTIONS.some((item) => item.id === sectionParam) ? sectionParam as SettingsSection : 'api-keys';
    const [section, setSection] = useState<SettingsSection>(routeSection);
    useEffect(() => {
        setSection(routeSection);
        if (!sectionParam || routeSection !== sectionParam) navigate(`/settings/${routeSection}`, { replace: true });
    }, [navigate, routeSection, sectionParam]);
    const selectSection = (nextSection: SettingsSection) => {
        setSection(nextSection);
        navigate(`/settings/${nextSection}`);
    };
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [credentialsLoading, setCredentialsLoading] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [apiKeyLoading, setApiKeyLoading] = useState(true);
    const [apiKeySaving, setApiKeySaving] = useState(false);
    const [proxies, setProxies] = useState<{ id: string; server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }[]>([]);
    const [defaultProxyId, setDefaultProxyId] = useState<string | null>(null);
    const [includeDefaultInRotation, setIncludeDefaultInRotation] = useState(false);
    const [rotationMode, setRotationMode] = useState<'round-robin' | 'random'>('round-robin');
    const [proxiesLoading, setProxiesLoading] = useState(false);
    const [userAgentSelection, setUserAgentSelection] = useState('system');
    const [userAgentOptions, setUserAgentOptions] = useState<string[]>([]);
    const [userAgentLoading, setUserAgentLoading] = useState(false);

    const { themePreference, setTheme } = useTheme();

    const loadCredentials = useCallback(async () => {
        setCredentialsLoading(true);
        try {
            const res = await fetch('/api/credentials');
            if (res.ok) setCredentials(await res.json());
        } catch {
            setCredentials([]);
        } finally {
            setCredentialsLoading(false);
        }
    }, []);

    const deleteCredential = useCallback(async (id: string) => {
        await fetch(`/api/credentials/${id}`, { method: 'DELETE' });
        setCredentials(prev => prev.filter(c => c.id !== id));
    }, []);

    const loadApiKey = async () => {
        setApiKeyLoading(true);
        try {
            const res = await fetch('/api/settings/api-key', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setApiKey(null);
                return;
            }
            const data = await res.json();
            setApiKey(data.apiKey || null);
        } catch {
            setApiKey(null);
        } finally {
            setApiKeyLoading(false);
        }
    };

    const loadProxies = async () => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setProxies([]);
                setDefaultProxyId(null);
                setRotationMode('round-robin');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
        } catch {
            setProxies([]);
            setDefaultProxyId(null);
            setIncludeDefaultInRotation(false);
            setRotationMode('round-robin');
        } finally {
            setProxiesLoading(false);
        }
    };

    const addProxy = async (entry: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }) => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(entry)
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                onNotify(`Failed to add proxy${detail ? `: ${detail}` : ''}.`, 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxy added.', 'success');
        } catch {
            onNotify('Failed to add proxy.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const loadUserAgent = async () => {
        setUserAgentLoading(true);
        try {
            const res = await fetch('/api/settings/user-agent', { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                }
                setUserAgentSelection('system');
                setUserAgentOptions([]);
                return;
            }
            const data = await res.json();
            setUserAgentSelection(data.selection === 'system' ? 'system' : String(data.selection || 'system'));
            setUserAgentOptions(Array.isArray(data.userAgents) ? data.userAgents : []);
        } catch {
            setUserAgentSelection('system');
            setUserAgentOptions([]);
        } finally {
            setUserAgentLoading(false);
        }
    };

    const saveUserAgent = async (selection: string) => {
        setUserAgentLoading(true);
        try {
            const res = await fetch('/api/settings/user-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ selection })
            });
            if (!res.ok) {
                onNotify('Failed to update user agent.', 'error');
                return;
            }
            const data = await res.json();
            setUserAgentSelection(data.selection === 'system' ? 'system' : String(data.selection || 'system'));
            setUserAgentOptions(Array.isArray(data.userAgents) ? data.userAgents : []);
            onNotify('User agent updated.', 'success');
        } catch {
            onNotify('Failed to update user agent.', 'error');
        } finally {
            setUserAgentLoading(false);
        }
    };

    const importProxies = async (entries: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }[]) => {
        if (!entries.length) {
            onNotify('No valid proxies found in file.', 'error');
            return;
        }
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ proxies: entries })
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                onNotify(`Failed to import proxies${detail ? `: ${detail}` : ''}.`, 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxies imported.', 'success');
        } catch {
            onNotify('Failed to import proxies.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const updateProxy = async (id: string, entry: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }) => {
        setProxiesLoading(true);
        try {
            const res = await fetch(`/api/settings/proxies/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(entry)
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                onNotify(`Failed to update proxy${detail ? `: ${detail}` : ''}.`, 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxy updated.', 'success');
        } catch {
            onNotify('Failed to update proxy.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const deleteProxy = async (id: string) => {
        if (id === 'host') return;
        const confirmed = await onConfirm('Delete this proxy?');
        if (!confirmed) return;
        setProxiesLoading(true);
        try {
            const res = await fetch(`/api/settings/proxies/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!res.ok) {
                onNotify('Delete failed.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Proxy deleted.', 'success');
        } catch {
            onNotify('Delete failed.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const deleteProxies = async (ids: string[]) => {
        if (ids.length === 0) return;
        const confirmed = await onConfirm(`Delete ${ids.length} proxies?`);
        if (!confirmed) return;
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ids })
            });
            if (!res.ok) {
                onNotify('Bulk delete failed.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify(`${ids.length} proxies deleted.`, 'success');
        } catch {
            onNotify('Bulk delete failed.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const setDefaultProxy = async (id: string | null) => {
        const normalized = id === 'host' ? null : id;
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: normalized })
            });
            if (!res.ok) {
                onNotify('Failed to set default.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Default proxy updated.', 'success');
        } catch {
            onNotify('Failed to set default.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const toggleIncludeDefaultInRotation = async (enabled: boolean) => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/rotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ includeDefaultInRotation: enabled })
            });
            if (!res.ok) {
                onNotify('Failed to update rotation setting.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Rotation setting updated.', 'success');
        } catch {
            onNotify('Failed to update rotation setting.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const updateRotationMode = async (mode: 'round-robin' | 'random') => {
        setProxiesLoading(true);
        try {
            const res = await fetch('/api/settings/proxies/rotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rotationMode: mode })
            });
            if (!res.ok) {
                onNotify('Failed to update rotation mode.', 'error');
                return;
            }
            const data = await res.json();
            setProxies(Array.isArray(data.proxies) ? data.proxies : []);
            setDefaultProxyId(data.defaultProxyId || null);
            setIncludeDefaultInRotation(!!data.includeDefaultInRotation);
            setRotationMode(data.rotationMode === 'random' ? 'random' : 'round-robin');
            onNotify('Rotation mode updated.', 'success');
        } catch {
            onNotify('Failed to update rotation mode.', 'error');
        } finally {
            setProxiesLoading(false);
        }
    };

    const regenerateApiKey = async () => {
        setApiKeySaving(true);
        try {
            const res = await fetch('/api/settings/api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const data = await res.json();
                    detail = data?.error || data?.message || '';
                } catch {
                    detail = '';
                }
                if (res.status === 401) {
                    onNotify('Session expired. Please log in again.', 'error');
                } else {
                    onNotify(`Failed to generate API key${detail ? `: ${detail}` : ''}.`, 'error');
                }
                return;
            }
            const data = await res.json();
            setApiKey(data.apiKey || null);
            onNotify('API key generated.', 'success');
        } catch {
            onNotify('Failed to generate API key.', 'error');
        } finally {
            setApiKeySaving(false);
        }
    };

    useEffect(() => {
        if (section === 'api-keys') {
            loadApiKey();
            loadCredentials();
        }
        if (section === 'user-agent') loadUserAgent();
        if (section === 'proxies') loadProxies();
    }, [section, loadCredentials]);

    const dbProviders: DbProviderConfig[] = [
        {
            providerKey: 'baserow',
            name: 'Baserow',
            iconUrl: 'https://www.google.com/s2/favicons?domain=baserow.io&sz=128',
        }
    ];

    const handleAddDbCredential = async (cred: { name: string; provider: 'baserow'; config: { baseUrl: string; token: string } }): Promise<boolean> => {
        try {
            const res = await fetch('/api/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(cred)
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error('[handleAddDbCredential] API error', res.status, body);
                return false;
            }
            const created = await res.json();
            setCredentials(prev => [...prev, created]);
            onNotify('Credential saved.', 'success');
            return true;
        } catch (err) {
            console.error('[handleAddDbCredential] fetch error:', err);
            return false;
        }
    };

    const apiKeysConfig: ApiKeyConfig[] = [
        {
            id: 'figranium_api_key',
            name: 'Tasks API',
            description: 'Manage task API access via `x-api-key` header',
            icon: 'database',
            value: apiKey,
            saving: apiKeySaving,
            loading: apiKeyLoading,
            showCopyButton: true,
            readOnly: true,
            onSave: async () => { },
            onRegenerate: async () => { await regenerateApiKey(); }
        }
    ];

    credentials.forEach(cred => {
        apiKeysConfig.push({
            id: `db_cred_${cred.id}`,
            name: cred.name,
            description: `${formatLabel(cred.provider)} · ${cred.config.baseUrl}`,
            iconUrl: 'https://www.google.com/s2/favicons?domain=baserow.io&sz=128',
            value: cred.config.token || null,
            saving: false,
            loading: credentialsLoading,
            onSave: async () => {},
            readOnly: true,
            onDelete: async () => {
                const confirmed = onConfirm
                    ? await onConfirm(`Delete credential "${cred.name}"?`)
                    : confirm(`Delete credential "${cred.name}"?`);
                if (confirmed) await deleteCredential(cred.id);
            }
        });
    });

    return (
        <div className="settings-shell animate-in fade-in duration-500">
            <nav className="settings-nav" aria-label="Settings sections">
                <div className="settings-nav-title">Settings</div>
                <div className="settings-nav-list">
                    {SETTINGS_SECTIONS.map((item) => (
                        <button key={item.id} onClick={() => selectSection(item.id)} className={`settings-nav-item ${section === item.id ? 'settings-nav-item-active' : ''}`} aria-current={section === item.id ? 'page' : undefined}>
                            <TablerIcon name={item.icon} className="text-lg" />
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            <main className="app-page custom-scrollbar">
                <div className="app-page-inner !max-w-[1120px] settings-content">
                    <header className="app-page-header">
                        <div>
                            <div className="app-page-kicker">Settings</div>
                            <h1 className="app-page-title">{SETTINGS_SECTIONS.find((item) => item.id === section)?.label}</h1>
                            <p className="app-page-subtitle">Configure Figranium for your workspace</p>
                        </div>
                    </header>

                    {section === 'api-keys' && (
                        <ApiKeysPanel
                            keys={apiKeysConfig}
                            dbProviders={dbProviders}
                            onAddDbCredential={handleAddDbCredential}
                            onConfirm={onConfirm}
                        />
                    )}
                    {section === 'user-agent' && (
                        <UserAgentPanel
                            selection={userAgentSelection}
                            options={userAgentOptions}
                            loading={userAgentLoading}
                            onChange={saveUserAgent}
                        />
                    )}
                    {section === 'appearance' && (
                        <ThemePanel
                            currentThemeId={themePreference}
                            onSelect={setTheme}
                        />
                    )}
                    {section === 'advanced' && <SystemPanel onConfirm={onConfirm} onNotify={onNotify} />}
                    {section === 'about' && (
                        <VersionPanel version={APP_VERSION} />
                    )}
                    {section === 'proxies' && (
                    <ProxiesPanel
                        proxies={proxies}
                        defaultProxyId={defaultProxyId}
                        includeDefaultInRotation={includeDefaultInRotation}
                        rotationMode={rotationMode}
                        loading={proxiesLoading}
                        onRefresh={loadProxies}
                        onAdd={addProxy}
                        onImport={importProxies}
                        onUpdate={updateProxy}
                        onDelete={deleteProxy}
                        onDeleteMultiple={deleteProxies}
                        onSetDefault={setDefaultProxy}
                        onToggleIncludeDefault={toggleIncludeDefaultInRotation}
                        onRotationModeChange={updateRotationMode}
                    />
                    )}
                </div>
            </main>
        </div>
    );
};

export default SettingsScreen;
