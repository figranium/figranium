import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { isCloud } from '../../platform/runtime';
import OtpCodeInput from '../OtpCodeInput';

type TwoFactorStatus = { enabled: boolean; recoveryCodesRemaining: number };
type Enrollment = { secret: string; otpauthUri: string };

const inputClass = 'theme-input border theme-border rounded-xl px-4 py-3 text-sm theme-text';

const ERROR_TEXT: Record<string, string> = {
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect.',
    INVALID_TWO_FACTOR_CODE: 'That code is not valid. Check your authenticator app and try again.',
    TWO_FACTOR_LOCKED: 'Too many incorrect codes. Try again in 15 minutes.',
    TWO_FACTOR_SETUP_EXPIRED: 'Setup expired. Start again.',
    TWO_FACTOR_ALREADY_ENABLED: 'Two-factor authentication is already enabled.',
    TWO_FACTOR_NOT_ENABLED: 'Two-factor authentication is not enabled.',
    INVALID_INPUT_TYPE: 'Fill in every field.',
};

const readError = async (response: Response) => {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    return (payload?.error && ERROR_TEXT[payload.error]) || 'Request failed. Try again.';
};

const postTwoFactor = async (path: string, body: Record<string, string> = {}) => {
    const response = await fetch(`/api/auth/2fa${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
};

export default function TwoFactorPanel({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'error') => void }) {
    const [status, setStatus] = useState<TwoFactorStatus | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [busy, setBusy] = useState(false);
    const [localError, setLocalError] = useState('');

    const loadStatus = useCallback(async () => {
        try {
            const response = await fetch('/api/auth/2fa', { credentials: 'include' });
            if (!response.ok) throw new Error('STATUS_UNAVAILABLE');
            setStatus(await response.json() as TwoFactorStatus);
            setLoadFailed(false);
        } catch {
            setLoadFailed(true);
        }
    }, []);

    useEffect(() => {
        if (isCloud) return;
        void loadStatus();
    }, [loadStatus]);

    if (isCloud) return null;

    const run = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        setLocalError('');
        try {
            await action();
        } catch (error) {
            setLocalError(error instanceof Error ? error.message : 'Request failed. Try again.');
        } finally {
            setBusy(false);
        }
    };

    const startSetup = () => run(async () => {
        const data = await postTwoFactor('/setup', { currentPassword: password }) as Enrollment;
        setEnrollment({ secret: data.secret, otpauthUri: data.otpauthUri });
        setPassword('');
        setCode('');
    });

    const confirmSetup = () => run(async () => {
        const data = await postTwoFactor('/enable', { code: code.trim() });
        setEnrollment(null);
        setCode('');
        setRecoveryCodes(data.recoveryCodes as string[]);
        await loadStatus();
        onNotify('Two-factor authentication is on.', 'success');
    });

    const regenerateCodes = () => run(async () => {
        const data = await postTwoFactor('/recovery-codes', { currentPassword: password, code: code.trim() });
        setPassword('');
        setCode('');
        setRecoveryCodes(data.recoveryCodes as string[]);
        await loadStatus();
        onNotify('Recovery codes replaced. Old codes no longer work.', 'success');
    });

    const disableTwoFactor = () => run(async () => {
        await postTwoFactor('/disable', { currentPassword: password, code: code.trim() });
        setPassword('');
        setCode('');
        await loadStatus();
        onNotify('Two-factor authentication is off.', 'success');
    });

    const downloadRecoveryCodes = () => {
        if (!recoveryCodes) return;
        const blob = new Blob([`${recoveryCodes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'figranium-recovery-codes.txt';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        onNotify('Recovery codes downloaded.', 'success');
    };

    const credentialFields = (
        <div className="grid gap-3 max-w-xl">
            <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className={inputClass}
            />
            {useRecoveryCode ? (
                <input
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Recovery code (XXXX-XXXX)"
                    autoComplete="one-time-code"
                    spellCheck={false}
                    className={inputClass}
                />
            ) : (
                <div className="max-w-xs">
                    <OtpCodeInput
                        value={code}
                        onChange={setCode}
                        disabled={busy}
                        onRecoveryPaste={(text) => {
                            setUseRecoveryCode(true);
                            setCode(text);
                        }}
                    />
                </div>
            )}
            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    setUseRecoveryCode((prev) => !prev);
                    setCode('');
                    setLocalError('');
                }}
                className="justify-self-start text-xs theme-text-muted hover:underline disabled:opacity-50"
            >
                {useRecoveryCode ? 'Use authenticator code instead' : 'Use a recovery code instead'}
            </button>
        </div>
    );

    let body: ReactElement;
    // Recovery codes take priority: they are one-time and must stay visible even if a status refresh failed.
    if (loadFailed && !recoveryCodes) {
        body = (
            <div className="mt-4 space-y-3">
                <p role="alert" className="text-xs theme-text-muted">Two-factor status is unavailable.</p>
                <button type="button" className="app-button-secondary" onClick={() => void loadStatus()}>Try again</button>
            </div>
        );
    } else if (!status && !recoveryCodes) {
        body = <p className="mt-4 text-xs theme-text-faint">Loading...</p>;
    } else if (recoveryCodes) {
        body = (
            <div className="mt-5 space-y-4">
                <p className="text-sm theme-text">Save these recovery codes somewhere safe. Each one works once if you lose access to your authenticator app. They will not be shown again.</p>
                <div className="grid grid-cols-2 gap-2 max-w-md font-mono text-sm theme-text select-all">
                    {recoveryCodes.map((recoveryCode) => (
                        <span key={recoveryCode} className="rounded-lg border theme-border px-3 py-2">{recoveryCode}</span>
                    ))}
                </div>
                <div className="flex flex-wrap gap-3">
                    <button type="button" className="app-button-secondary" onClick={downloadRecoveryCodes}>Download codes (.txt)</button>
                    <button type="button" className="app-button-primary" onClick={() => setRecoveryCodes(null)}>I have saved these codes</button>
                </div>
            </div>
        );
    } else if (enrollment) {
        body = (
            <div className="mt-5 space-y-4">
                <p className="text-sm theme-text">1. In your authenticator app, add an account and enter this setup key:</p>
                <code className="block break-all rounded-xl border theme-border p-4 font-mono text-sm theme-text select-all">{enrollment.secret}</code>
                <p className="text-xs theme-text-faint">
                    Or <a href={enrollment.otpauthUri} className="underline">open the setup link</a> on a device that has your authenticator app.
                </p>
                <p className="text-sm theme-text">2. Enter the 6-digit code the app shows:</p>
                <form className="grid gap-3 max-w-xl" onSubmit={(event) => { event.preventDefault(); void confirmSetup(); }}>
                    <div className="max-w-xs">
                        <OtpCodeInput
                            value={code}
                            onChange={setCode}
                            disabled={busy}
                            autoFocus
                        />
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={busy || code.trim().length !== 6} className="app-button-primary disabled:opacity-50">Turn on</button>
                        <button type="button" disabled={busy} className="app-button-secondary disabled:opacity-50" onClick={() => { setEnrollment(null); setCode(''); setLocalError(''); }}>Cancel</button>
                    </div>
                </form>
            </div>
        );
    } else if (status?.enabled) {
        body = (
            <div className="mt-5 space-y-4">
                <p className="text-sm theme-text">
                    Enabled. Recovery codes remaining: <strong>{status.recoveryCodesRemaining}</strong>
                </p>
                {credentialFields}
                <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={busy || !password || !code.trim()} onClick={() => void regenerateCodes()} className="app-button-secondary disabled:opacity-50">Replace recovery codes</button>
                    <button type="button" disabled={busy || !password || !code.trim()} onClick={() => void disableTwoFactor()} className="app-button-secondary disabled:opacity-50">Turn off two-factor</button>
                </div>
            </div>
        );
    } else {
        body = (
            <div className="mt-5 space-y-4">
                <p className="text-xs theme-text-faint">Requires an authenticator app that supports TOTP, such as Google Authenticator, 1Password, or Aegis.</p>
                <div className="grid gap-3 max-w-xl">
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Current password"
                        autoComplete="current-password"
                        className={inputClass}
                    />
                </div>
                <button type="button" disabled={busy || !password} onClick={() => void startSetup()} className="app-button-primary disabled:opacity-50">Set up two-factor</button>
            </div>
        );
    }

    return (
        <section className="app-panel p-7">
            <h3 className="text-sm font-bold theme-text">Two-factor authentication</h3>
            <p className="mt-2 text-xs theme-text-muted">Ask for a code from an authenticator app in addition to your password when signing in.</p>
            {body}
            {localError && <p role="alert" className="mt-4 text-xs font-bold text-red-500">{localError}</p>}
        </section>
    );
}
