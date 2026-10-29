import { useEffect, useState } from 'react';
import { cloudAuth, type CloudIdentity } from '../../platform/runtime';
import { authorizedCloudFetch } from '../../platform/api';

type Account = {
    channel: 'stable' | 'edge';
    subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null;
};

export default function CloudAccountPanel({ onLogout }: { onLogout: () => void }) {
    const [identity, setIdentity] = useState<CloudIdentity | null>(null);
    const [account, setAccount] = useState<Account | null>(null);
    const [identityFailed, setIdentityFailed] = useState(false);
    const [accountFailed, setAccountFailed] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        cloudAuth().getIdentity().then((user) => {
            if (active) { setIdentity(user); setIdentityFailed(!user); }
        }).catch(() => { if (active) setIdentityFailed(true); });
        authorizedCloudFetch('/api/v1/account').then(async (response) => {
            if (!response.ok) throw new Error('ACCOUNT_UNAVAILABLE');
            const data = await response.json() as Account;
            if (active) setAccount(data);
        }).catch(() => { if (active) setAccountFailed(true); });
        return () => { active = false; };
    }, []);

    async function saveChannel(channel: Account['channel']) {
        setSaving(true);
        try {
            const response = await authorizedCloudFetch('/api/v1/account/channel', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel })
            });
            if (!response.ok) throw new Error('CHANNEL_SAVE_FAILED');
            setAccount((previous) => previous ? { ...previous, channel } : previous);
            setAccountFailed(false);
        } catch {
            setAccountFailed(true);
        } finally { setSaving(false); }
    }

    return <div className="space-y-5">
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Profile</h3>
            {identityFailed ? <p role="alert" className="mt-3 text-xs theme-text-faint">Could not load your account details.</p> :
                identity ? <div className="mt-4 space-y-2 text-sm theme-text">
                    {identity.name && <p>{identity.name}</p>}
                    <p className="theme-text-muted">{identity.email}</p>
                </div> : <p className="mt-3 text-xs theme-text-faint">Loading account…</p>}
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Subscription</h3>
            {account ? account.subscription ? <div className="mt-3 text-sm theme-text">
                <p>{account.subscription.plan} · {account.subscription.status}</p>
                {account.subscription.currentPeriodEnd && <p className="mt-1 text-xs theme-text-faint">Current period ends {new Date(account.subscription.currentPeriodEnd).toLocaleDateString()}</p>}
            </div> : <p className="mt-1 text-xs theme-text-faint">No subscription is recorded for this workspace.</p>
                : <p className="mt-1 text-xs theme-text-faint">{accountFailed ? 'Subscription details are unavailable.' : 'Loading subscription…'}</p>}
            <p className="mt-3 text-xs theme-text-faint">Subscription management is not available yet.</p>
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Release channel preference</h3>
            <p className="mt-1 text-xs theme-text-faint">Your preference is saved for your workspace. It will not change the runner until channel support is available.</p>
            {account && <div className="mt-4 flex gap-3">
                {(['stable', 'edge'] as const).map((channel) =>
                    <button key={channel} type="button" disabled={saving} aria-pressed={account.channel === channel}
                        onClick={() => void saveChannel(channel)}
                        className={account.channel === channel ? 'app-button-primary disabled:opacity-50' : 'app-button-secondary disabled:opacity-50'}>
                        {channel === 'stable' ? 'Stable' : 'Edge'}
                    </button>)}
            </div>}
            {accountFailed && <p role="alert" className="mt-3 text-xs theme-text-faint">Could not load or save account settings.</p>}
        </section>
        <section className="app-panel p-7 flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-sm font-bold theme-text">Session</h3>
                <p className="text-xs theme-text-faint mt-1">Sign out of Figranium Cloud on this device.</p></div>
            <button type="button" onClick={onLogout} className="app-button-danger">Sign out</button>
        </section>
    </div>;
}
