import React, { useEffect, useState } from 'react';
import { authorizedCloudFetch } from '../../platform/api';

type Channel = 'stable' | 'edge';

const AccountPanel: React.FC<{ onNotify: (message: string, tone?: 'success' | 'error') => void }> = ({ onNotify }) => {
    const [channel, setChannel] = useState<Channel>('stable');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let active = true;
        authorizedCloudFetch('/api/v1/account/channel').then(async response => {
            if (!response.ok) throw new Error('Could not load update channel');
            const data = await response.json();
            if (active) setChannel(data.channel === 'edge' ? 'edge' : 'stable');
        }).catch(() => {
            if (active) onNotify('Could not load account preferences.', 'error');
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [onNotify]);

    const choose = async (next: Channel) => {
        if (saving || next === channel) return;
        setSaving(true);
        try {
            const response = await authorizedCloudFetch('/api/v1/account/channel', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: next })
            });
            if (!response.ok) throw new Error('Could not save update channel');
            const data = await response.json();
            setChannel(data.channel === 'edge' ? 'edge' : 'stable');
            // The Worker selects the corresponding static bundle using the
            // HttpOnly channel cookie returned by this authenticated request.
            window.location.reload();
        } catch {
            onNotify('Could not save update channel.', 'error');
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="space-y-5">
            <section className="app-panel p-7">
                <h3 className="text-sm font-bold theme-text">Update channel</h3>
                <p className="mt-2 text-xs theme-text-muted">Choose the release channel for your Cloud workspace. Edge releases may be less stable.</p>
                <fieldset className="mt-5 space-y-3" disabled={loading || saving}>
                    {(['stable', 'edge'] as const).map(option => (
                        <label key={option} className="flex items-center gap-3 rounded-xl border theme-border p-4 cursor-pointer">
                            <input type="radio" name="cloud-update-channel" checked={channel === option} onChange={() => void choose(option)} />
                            <span className="text-sm font-bold theme-text">{option === 'stable' ? 'Stable' : 'Edge'}</span>
                        </label>
                    ))}
                </fieldset>
                <p className="mt-3 text-xs theme-text-faint">Changing channels reloads Cloud with the selected release. Stable receives published releases; Edge follows the latest development build.</p>
            </section>
            <section className="app-panel p-7">
                <h3 className="text-sm font-bold theme-text">Subscription</h3>
                <p className="mt-2 text-xs theme-text-muted">Subscription management, billing changes, and cancellation will be available here when Cloud plans launch.</p>
            </section>
        </div>
    );
};

export default AccountPanel;
