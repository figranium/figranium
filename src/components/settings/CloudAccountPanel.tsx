import { useEffect, useState } from 'react';
import { cloudAuth, type CloudIdentity } from '../../platform/runtime';

export default function CloudAccountPanel({ onLogout }: { onLogout: () => void }) {
    const [identity, setIdentity] = useState<CloudIdentity | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        cloudAuth().getIdentity().then((user) => {
            if (active) { setIdentity(user); setFailed(!user); }
        }).catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, []);

    return <div className="space-y-5">
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Profile</h3>
            {failed ? <p role="alert" className="mt-3 text-xs theme-text-faint">Could not load your account details.</p> :
                identity ? <div className="mt-4 space-y-2 text-sm theme-text">
                    {identity.name && <p>{identity.name}</p>}
                    <p className="theme-text-muted">{identity.email}</p>
                </div> : <p className="mt-3 text-xs theme-text-faint">Loading account…</p>}
        </section>
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Subscription</h3>
            <p className="mt-1 text-xs theme-text-faint">Subscription management is not available yet.</p>
        </section>
        <section className="app-panel p-7 flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-sm font-bold theme-text">Session</h3>
                <p className="text-xs theme-text-faint mt-1">Sign out of Figranium Cloud on this device.</p></div>
            <button type="button" onClick={onLogout} className="app-button-danger">Sign out</button>
        </section>
    </div>;
}
