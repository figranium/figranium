import { useRef, useState } from 'react';
import CanvasDotGrid from './editor/CanvasDotGrid';
import TablerIcon from './TablerIcon';

interface AuthScreenProps {
    status: 'login' | 'setup' | 'two_factor';
    onSubmit: (email: string, pass: string, name?: string, passConfirm?: string) => Promise<void>;
    onTwoFactorSubmit?: (code: string) => Promise<void>;
    onCancelTwoFactor?: () => void;
    error: string;
    busy?: boolean;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ status, onSubmit, onTwoFactorSubmit, onCancelTwoFactor, error, busy = false }) => {
    const viewportRef = useRef<HTMLDivElement>(null!);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [passConfirm, setPassConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showPassConfirm, setShowPassConfirm] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [localError, setLocalError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (status === 'two_factor') {
            setLocalError('');
            void onTwoFactorSubmit?.(otpCode.trim());
            return;
        }
        if (status === 'setup' && pass !== passConfirm) {
            setLocalError('Passwords do not match.');
            return;
        }
        setLocalError('');
        onSubmit(email, pass, name, passConfirm);
    };

    const buttonLabel = status === 'setup'
        ? (busy ? 'Creating account...' : 'Create Account')
        : status === 'two_factor'
            ? (busy ? 'Verifying...' : 'Verify')
            : (busy ? 'Authenticating...' : 'Authenticate');

    const inputClass = "w-full theme-input border theme-border rounded-2xl px-5 py-4 text-sm theme-text focus:outline-none focus:border-[var(--app-border-strong)] focus-visible:ring-2 focus-visible:ring-white/50 transition-all placeholder:text-gray-600";

    return (
        <div ref={viewportRef} className="auth-screen fixed inset-0 z-[100] theme-bg flex items-center justify-center">
            <CanvasDotGrid canvasOffset={{ x: 0, y: 0 }} canvasScale={1} viewportRef={viewportRef} />
            <div className="w-[400px] max-w-[calc(100%-40px)] glass-card auth-card-opaque p-10 rounded-[48px] space-y-8 relative">
                <div className="text-center space-y-3">
                    <img src="/figranium_logo.svg" alt="Figranium" className="h-24 mx-auto object-contain theme-logo" style={{ color: 'var(--app-logo)' }} />
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {status === 'two_factor' ? (
                        <div className="space-y-2">
                            <label htmlFor="auth-otp" className="text-xs font-bold theme-text-muted tracking-wide">Authentication code</label>
                            <input
                                id="auth-otp"
                                type="text"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value)}
                                placeholder="123456 or recovery code"
                                className={inputClass}
                                required
                                autoFocus
                                autoComplete="one-time-code"
                                spellCheck={false}
                            />
                            <p className="text-xs theme-text-faint">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
                        </div>
                    ) : (
                    <div className="space-y-4">
                        {status === 'setup' && (
                            <div className="space-y-2">
                                <label htmlFor="auth-name" className="text-xs font-bold theme-text-muted tracking-wide">Name</label>
                                <input
                                    id="auth-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Full Name"
                                    className={inputClass}
                                    autoComplete="name"
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="auth-email" className="text-xs font-bold theme-text-muted tracking-wide">Email</label>
                            <input
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                className={inputClass}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="auth-pass" className="text-xs font-bold theme-text-muted tracking-wide">Password</label>
                            <div className="relative">
                                <input
                                    id="auth-pass"
                                    type={showPass ? "text" : "password"}
                                    value={pass}
                                    onChange={(e) => setPass(e.target.value)}
                                    placeholder="••••••••"
                                    className={`${inputClass} pr-12`}
                                    required
                                    autoComplete={status === 'setup' ? "new-password" : "current-password"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg theme-text-faint hover:text-[var(--app-text)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label={showPass ? "Hide password" : "Show password"}
                                    title={showPass ? "Hide password" : "Show password"}
                                >
                                    <TablerIcon name={showPass ? "visibility_off" : "visibility"} className="text-lg" />
                                </button>
                            </div>
                        </div>
                        {status === 'setup' && (
                            <div className="space-y-2">
                                <label htmlFor="auth-pass-confirm" className="text-xs font-bold theme-text-muted tracking-wide">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        id="auth-pass-confirm"
                                        type={showPassConfirm ? "text" : "password"}
                                        value={passConfirm}
                                        onChange={(e) => setPassConfirm(e.target.value)}
                                        placeholder="••••••••"
                                        className={`${inputClass} pr-12`}
                                        required
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassConfirm(!showPassConfirm)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg theme-text-faint hover:text-[var(--app-text)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label={showPassConfirm ? "Hide password confirmation" : "Show password confirmation"}
                                        title={showPassConfirm ? "Hide password confirmation" : "Show password confirmation"}
                                    >
                                        <TablerIcon name={showPassConfirm ? "visibility_off" : "visibility"} className="text-lg" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        aria-busy={busy}
                        className="shine-effect w-full theme-accent-bg py-4 rounded-2xl font-bold text-xs tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {busy && (
                            <div className="w-4 h-4 border-2 border-current/10 border-t-current rounded-full animate-spin" />
                        )}
                        {buttonLabel}
                    </button>

                    {status === 'two_factor' && onCancelTwoFactor && (
                        <button type="button" onClick={onCancelTwoFactor} disabled={busy} className="w-full text-xs font-bold theme-text-muted tracking-wide hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-60 disabled:no-underline">
                            Back to sign in
                        </button>
                    )}

                    {(localError || error) && (
                        <div role="alert" className="text-xs font-bold text-red-500 text-center tracking-wide">
                            {localError || error}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default AuthScreen;
