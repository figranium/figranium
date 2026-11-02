import React, { useState } from 'react';
import TablerIcon from './TablerIcon';
import { authorizedCloudFetch } from '../platform/api';
import { useNavigate } from 'react-router-dom';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason?: string | null;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, reason }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubscribe = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const response = await authorizedCloudFetch('/api/v1/billing/checkout', { method: 'POST' });
            const data = await response.json().catch(() => null);
            if (!response.ok || typeof data?.checkoutUrl !== 'string') {
                throw new Error(data?.error || 'CHECKOUT_UNAVAILABLE');
            }
            const destination = new URL(data.checkoutUrl);
            if (destination.protocol !== 'https:' || !(
                destination.hostname === 'paddle.com' || destination.hostname.endsWith('.paddle.com')
            )) {
                throw new Error('INVALID_CHECKOUT_URL');
            }
            window.location.assign(destination.toString());
        } catch (err: any) {
            setError(err instanceof Error ? err.message : 'Could not initiate checkout.');
            setLoading(false);
        }
    };

    const handleGoToSettings = () => {
        onClose();
        navigate('/settings/account');
    };

    return (
        <div className="theme-modal-backdrop fixed inset-0 z-[110] backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-md theme-surface backdrop-blur-3xl border theme-border-strong theme-modal-elevation rounded-[28px] overflow-hidden flex flex-col p-7 relative slide-up">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 theme-text-muted hover:theme-text theme-hover rounded-xl transition-colors focus:outline-none"
                    aria-label="Close modal"
                >
                    <TablerIcon name="close" className="text-base" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                        <TablerIcon name="sparkles" className="text-xl" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold theme-text">Subscription Required</h2>
                        <p className="text-xs theme-text-muted">Upgrade to Figranium Cloud</p>
                    </div>
                </div>

                <p className="text-xs theme-text-muted leading-relaxed mb-5">
                    {reason || 'An active Cloud subscription is required to run automated tasks and launch isolated cloud browser sessions.'}
                </p>

                <div className="rounded-2xl border theme-border bg-[var(--app-surface-3)] p-4 mb-5">
                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs font-bold theme-text uppercase tracking-wider">Cloud Mini</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold theme-text">$15</span>
                            <span className="text-xs theme-text-muted">/ month</span>
                        </div>
                    </div>
                    <ul className="text-xs theme-text-muted space-y-2 mt-3 border-t theme-border pt-3">
                        <li className="flex items-center gap-2">
                            <TablerIcon name="check" className="text-sm text-green-400 shrink-0" />
                            <span><strong>60 Compute Units (CU)</strong> per month</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <TablerIcon name="check" className="text-sm text-green-400 shrink-0" />
                            <span><strong>120 browser minutes</strong> per month</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <TablerIcon name="check" className="text-sm text-green-400 shrink-0" />
                            <span>Isolated gVisor runner & headed Chromium</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <TablerIcon name="check" className="text-sm text-green-400 shrink-0" />
                            <span>Encrypted vault credentials & R2 artifact storage</span>
                        </li>
                    </ul>
                </div>

                {error && (
                    <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-2.5">
                    <button
                        type="button"
                        onClick={handleSubscribe}
                        disabled={loading}
                        className="app-button-primary w-full py-3 justify-center text-xs font-bold tracking-wide"
                    >
                        {loading ? 'Opening Paddle checkout…' : 'Subscribe to Cloud Mini ($15/mo)'}
                    </button>
                    <button
                        type="button"
                        onClick={handleGoToSettings}
                        disabled={loading}
                        className="app-button-secondary w-full py-2.5 justify-center text-xs font-bold tracking-wide"
                    >
                        Manage in Account Settings
                    </button>
                </div>

                <p className="mt-4 text-[10px] text-center theme-text-faint">
                    Billed monthly via Paddle. Cancel or update your plan anytime in Settings.
                </p>
            </div>
        </div>
    );
};

export default SubscriptionModal;
