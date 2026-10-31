import React, { useEffect, useState } from 'react';
import { authorizedCloudFetch } from '../../platform/api';

type Channel = 'stable' | 'edge';
type BillingStatus = {
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    allowanceCu: number;
    remainingCu: number;
};
const formatDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

const AccountPanel: React.FC<{ onNotify: (message: string, tone?: 'success' | 'error') => void }> = ({ onNotify }) => {
    const [channel, setChannel] = useState<Channel>('stable');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [billing, setBilling] = useState<BillingStatus | null>(null);
    const [billingLoading, setBillingLoading] = useState(true);
    const [billingError, setBillingError] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const loadBilling = async () => {
        setBillingLoading(true);
        setBillingError(false);
        try {
            const response = await authorizedCloudFetch('/api/v1/billing');
            if (!response.ok) throw new Error('BILLING_UNAVAILABLE');
            const data = await response.json() as BillingStatus;
            setBilling(data);
        } catch {
            setBillingError(true);
        } finally {
            setBillingLoading(false);
        }
    };
    useEffect(() => { void loadBilling(); }, []);
    const beginCheckout = async () => {
        if (checkoutLoading) return;
        setCheckoutLoading(true);
        try {
            const response = await authorizedCloudFetch('/api/v1/billing/checkout', { method: 'POST' });
            const data = await response.json().catch(() => null);
            if (!response.ok || typeof data?.checkoutUrl !== 'string') {
                throw new Error(data?.error || 'CHECKOUT_UNAVAILABLE');
            }
            const destination = new URL(data.checkoutUrl);
            if (destination.protocol !== 'https:' || !(
                destination.hostname === 'paddle.com' || destination.hostname.endsWith('.paddle.com')
            )) throw new Error('INVALID_CHECKOUT_URL');
            window.location.assign(destination.toString());
        } catch (error) {
            onNotify(error instanceof Error ? `Could not start checkout: ${error.message}` : 'Could not start checkout.', 'error');
            setCheckoutLoading(false);
        }
    };
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
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(`Could not save update channel (HTTP ${response.status}: ${payload?.error || 'UNKNOWN_ERROR'}).`);
            }
            const data = await response.json();
            setChannel(data.channel === 'edge' ? 'edge' : 'stable');
            // The Worker selects the corresponding static bundle using the
            // HttpOnly channel cookie returned by this authenticated request.
            window.location.reload();
        } catch (error) {
            onNotify(error instanceof Error ? error.message : 'Could not save update channel.', 'error');
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
                <p className="mt-2 text-xs theme-text-muted">Cloud Mini · $15 per month · 60 CU per paid billing period. Unused CU does not roll over.</p>
                {billingLoading ? (
                    <div className="mt-5 space-y-3" aria-label="Loading billing information">
                        <div className="h-5 w-36 animate-pulse rounded-md bg-[var(--app-surface-3)]" />
                        <div className="h-10 w-full animate-pulse rounded-md bg-[var(--app-surface-3)]" />
                    </div>
                ) : billingError ? (
                    <div className="mt-5">
                        <p role="alert" className="text-sm theme-text-muted">Billing information is unavailable.</p>
                        <button type="button" className="app-button-secondary mt-3" onClick={() => void loadBilling()}>Try again</button>
                    </div>
                ) : billing?.status === 'none' ? (
                    <div className="mt-5 space-y-3">
                        <p className="text-sm theme-text">No subscription is associated with this workspace.</p>
                        <button type="button" className="app-button-primary" disabled={checkoutLoading} onClick={() => void beginCheckout()}>
                            {checkoutLoading ? 'Opening checkout…' : 'Subscribe to Cloud Mini'}
                        </button>
                        <p className="text-xs theme-text-faint">Checkout is securely handled by Paddle. Your plan activates after payment confirmation.</p>
                    </div>
                ) : (
                    <div className="mt-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-sm theme-text">Subscription status: <strong className="capitalize">{billing?.status || 'Unknown'}</strong></span>
                            <button type="button" className="app-button-secondary" onClick={() => void loadBilling()}>Refresh</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 rounded-xl border theme-border p-4">
                            <div><p className="text-xs theme-text-faint">Remaining CU</p><p className="mt-1 text-xl theme-text">{billing?.remainingCu ?? 0} / {billing?.allowanceCu ?? 0}</p></div>
                            <div><p className="text-xs theme-text-faint">Billing period ends</p><p className="mt-1 text-sm theme-text">{formatDate(billing?.periodEnd ?? null)}</p></div>
                        </div>
                        {billing?.status !== 'active' && <p className="text-xs theme-text-muted">Paid Executions require an active subscription and a confirmed billing period.</p>}
                    </div>
                )}
            </section>
        </div>
    );
};

export default AccountPanel;
