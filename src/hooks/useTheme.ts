import { useState, useCallback, useEffect } from 'react';
import { THEMES, ThemeDefinition, ThemePreference, AUTO_THEME_ID, DEFAULT_THEME_PREFERENCE, isThemePreference, resolveThemePreference, applyThemeVars } from '../utils/theme';

const THEME_STORAGE_KEY = 'figranium.theme';
function setCookie(preference: ThemePreference) {
    if (typeof document === 'undefined') return;
    try {
        document.cookie = `figranium_theme=${preference}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
        // ignore
    }
}

function getInitialThemePreference(): ThemePreference {
    if (typeof window === 'undefined') return DEFAULT_THEME_PREFERENCE;
    try {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const raw of cookies) {
            const c = raw.trim();
            if (c.startsWith('figranium_theme=') || c.startsWith('theme=')) {
                const val = c.substring(c.indexOf('=') + 1).trim();
                if (isThemePreference(val)) return val;
            }
        }
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
    } catch {
        return DEFAULT_THEME_PREFERENCE;
    }
}

export function useTheme() {
    const [themePreference, setThemePreference] = useState<ThemePreference>(getInitialThemePreference);
    const [theme, setThemeState] = useState<ThemeDefinition>(() => resolveThemePreference(getInitialThemePreference()));

    useEffect(() => {
        applyThemeVars(theme);
        setCookie(themePreference);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, themePreference);
        } catch {
            // ignore
        }
    }, [theme, themePreference]);

    useEffect(() => {
        if (themePreference !== AUTO_THEME_ID || typeof window === 'undefined') return;
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const syncDeviceTheme = () => {
            const next = resolveThemePreference(AUTO_THEME_ID);
            setThemeState(next);
            applyThemeVars(next);
        };
        query.addEventListener('change', syncDeviceTheme);
        return () => query.removeEventListener('change', syncDeviceTheme);
    }, [themePreference]);

    // Fetch persisted theme from backend data on mount and sync
    useEffect(() => {
        let mounted = true;
        fetch('/api/settings/theme', { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (mounted && data && isThemePreference(data.theme)) {
                    const preference = data.theme as ThemePreference;
                    const serverTheme = resolveThemePreference(preference);
                    setThemePreference(preference);
                    setThemeState(serverTheme);
                    applyThemeVars(serverTheme);
                    setCookie(preference);
                    try {
                        localStorage.setItem(THEME_STORAGE_KEY, preference);
                    } catch { }
                }
            })
            .catch(() => { });
        return () => { mounted = false; };
    }, []);

    const setTheme = useCallback((preference: ThemePreference) => {
        const next = resolveThemePreference(preference);
        setThemePreference(preference);
        setThemeState(next);
        // Immediately apply theme and set cookie/localStorage for fast UI feedback
        applyThemeVars(next);
        setCookie(preference);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, preference);
        } catch {
            // ignore
        }
        // Persist theme to backend data storage
        fetch('/api/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ theme: preference })
        }).catch(err => {
            console.error('Failed to persist theme to backend data:', err);
        });
    }, []);

    return {
        theme,
        themePreference,
        setTheme,
        themes: THEMES,
    };
}
