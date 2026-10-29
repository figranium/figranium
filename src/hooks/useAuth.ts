import { cloudAuth, isCloud } from '../platform/runtime';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../types';

const formatAuthError = (errorCode: unknown, fallback: string) => {
    if (typeof errorCode !== 'string' || !errorCode) return fallback;
    switch (errorCode) {
        case 'ALREADY_SETUP':
            return 'An account already exists';
        case 'INVALID':
            return 'Invalid credentials';
        case 'SESSION_SAVE_FAILED':
            return 'Unable to persist your session';
        default: {
            const normalized = errorCode.toLowerCase().replace(/_/g, ' ');
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        }
    }
};

export function useAuth() {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [authStatus, setAuthStatus] = useState<'checking' | 'login' | 'setup' | 'authenticated'>('checking');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);

    const checkAuth = useCallback(async () => {
        try {
            if (isCloud) {
                const identity = await cloudAuth().getIdentity();
                if (identity) {
                    setUser({ id: identity.id, name: identity.name, email: identity.email });
                    setAuthStatus('authenticated');
                    return true;
                }
                setUser(null);
                setAuthStatus('login');
                return false;
            }
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await res.json();
            if (data.authenticated) {
                setUser(data.user);
                setAuthStatus('authenticated');
                return true;
            }
            const sRes = await fetch('/api/auth/check-setup', { credentials: 'include' });
            const sData = await sRes.json();
            setAuthStatus(sData.setupRequired ? 'setup' : 'login');
        } catch (e) {
            setAuthStatus('login');
        }
        return false;
    }, []);

    useEffect(() => {
        checkAuth();
        if (!isCloud) return;
        const onChange = () => { void checkAuth(); };
        window.addEventListener('figranium:cloud-session-changed', onChange);
        return () => window.removeEventListener('figranium:cloud-session-changed', onChange);
    }, [checkAuth]);

    const handleAuthSubmit = useCallback(async (email: string, pass: string, name?: string, passConfirm?: string) => {
        if (!email || !pass) {
            setAuthError('Email and password are required');
            return;
        }
        if (authStatus === 'setup' && (!name || pass !== passConfirm)) {
            setAuthError(name ? "Passwords do not match" : "Name required");
            return;
        }
        if (authBusy) return;

        if (isCloud) {
            setAuthBusy(true);
            try {
                await cloudAuth().signIn(email, pass);
                setAuthError('');
                if (await checkAuth()) navigate('/');
                else setAuthError('Cloud authentication failed');
            } catch (error) {
                setAuthError(error instanceof Error ? error.message : 'Cloud sign-in failed');
            } finally {
                setAuthBusy(false);
            }
            return;
        }
        const endpoint = authStatus === 'setup' ? '/api/auth/setup' : '/api/auth/login';
        const payload = authStatus === 'setup'
            ? { name, email, password: pass }
            : { email, password: pass };

        setAuthBusy(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setAuthError('');
                setAuthStatus('checking');
                const authenticated = await checkAuth();
                if (authenticated) {
                    navigate('/');
                } else {
                    setAuthError('Authentication failed');
                    setAuthStatus('login');
                }
            } else {
                const fallback = authStatus === 'setup' ? 'Setup failed' : 'Invalid credentials';
                setAuthError(formatAuthError((data as any)?.error, fallback));
            }
        } catch (e) {
            setAuthError("Network error");
        } finally {
            setAuthBusy(false);
        }
    }, [authStatus, authBusy, navigate, checkAuth]);

    const logout = useCallback(async (requestConfirm: (msg: string) => Promise<boolean>) => {
        const confirmed = await requestConfirm('Are you sure you want to log out?');
        if (!confirmed) return;
        if (isCloud) await cloudAuth().signOut();
        else await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        setUser(null);
        setAuthStatus('login');
        navigate('/');
    }, [navigate]);

    return {
        user,
        setUser,
        authStatus,
        setAuthStatus,
        authError,
        authBusy,
        checkAuth,
        handleAuthSubmit,
        logout
    };
}
