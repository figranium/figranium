export type ThemeId = 'dark' | 'light' | 'solarized-light' | 'solarized-dark';
export type ThemePreference = ThemeId | 'auto';
export const AUTO_THEME_ID = 'auto';

export interface ThemeDefinition {
    id: ThemeId;
    name: string;
    description: string;
    preview: string;
    /** CSS custom properties applied under `[data-theme="<id>"]` */
    vars: Record<string, string>;
}

export const THEMES: ThemeDefinition[] = [
    {
        id: 'dark',
        name: 'Dark',
        description: 'The classic Figranium dark theme.',
        preview: '/themes/Dark.png',
        vars: {
            '--app-bg': '#020202',
            '--app-surface': '#0a0a0a',
            '--app-surface-2': '#111111',
            '--app-surface-3': '#050505',
            '--app-border': 'rgba(255, 255, 255, 0.08)',
            '--app-border-strong': 'rgba(255, 255, 255, 0.15)',
            '--app-text': '#ffffff',
            '--app-text-muted': 'rgba(255, 255, 255, 0.6)',
            '--app-text-faint': 'rgba(255, 255, 255, 0.46)',
            '--app-glass': 'rgba(10, 10, 10, 0.9)',
            '--app-glass-card': 'rgba(255, 255, 255, 0.015)',
            '--app-glass-card-hover': 'rgba(255, 255, 255, 0.04)',
            '--app-glass-modal': 'rgba(10, 10, 10, 0.85)',
            '--app-input': 'rgba(0, 0, 0, 0.4)',
            '--app-scrollbar': 'rgba(255, 255, 255, 0.1)',
            '--app-scrollbar-hover': 'rgba(255, 255, 255, 0.2)',
            '--app-accent': '#ffffff',
            '--app-accent-text': '#000000',
            '--app-modal-backdrop': 'rgba(0, 0, 0, 0.65)',
            '--app-modal-shadow': '0 32px 100px rgba(0, 0, 0, 0.55)',
            '--app-logo': '#ffffff',
            '--app-code-bg': '#050505',
            '--app-code-text': '#93c5fd',
            '--app-code-keyword': '#93c5fd',
            '--app-code-string': '#86efac',
            '--app-code-number': '#fbbf24',
            '--app-code-comment': '#707786',
            '--app-code-boolean': '#fca5a5',
            '--app-code-identifier': '#e5e7eb',
            '--app-code-key': '#67e8f9',
            '--app-code-tag': '#60a5fa',
            '--app-code-attr': '#fcd34d',
            '--app-code-punct': 'rgba(255, 255, 255, 0.6)',
            '--app-caret': '#ffffff',
            '--app-dot': 'rgba(255, 255, 255, 0.12)',
            '--app-shadow-raised': '0 12px 28px rgba(0, 0, 0, 0.28)',
            '--app-shadow-overlay': '0 24px 64px rgba(0, 0, 0, 0.5)',
            '--app-shadow-sticky': '0 6px 20px rgba(0, 0, 0, 0.35)',
            '--app-sticky-default-bg': 'rgba(255, 255, 255, 0.07)',
            '--app-sticky-default-border': 'rgba(255, 255, 255, 0.18)',
            '--app-sticky-default-header': 'rgba(255, 255, 255, 0.10)',
            '--app-sticky-text': 'rgba(255, 255, 255, 0.82)',
            '--app-sticky-text-muted': 'rgba(255, 255, 255, 0.62)',
            '--app-sticky-text-faint': 'rgba(255, 255, 255, 0.32)',
            '--app-sticky-control': 'rgba(255, 255, 255, 0.55)',
            '--app-sticky-control-hover': 'rgba(255, 255, 255, 0.10)',
            '--app-sticky-code-bg': 'rgba(0, 0, 0, 0.24)',
        },
    },
    {
        id: 'light',
        name: 'Light',
        description: 'A clean, bright light theme.',
        preview: '/themes/Light.png',
        vars: {
            '--app-bg': '#f5f5f5',
            '--app-surface': '#ffffff',
            '--app-surface-2': '#eaeaea',
            '--app-surface-3': '#fafafa',
            '--app-border': 'rgba(0, 0, 0, 0.1)',
            '--app-border-strong': 'rgba(0, 0, 0, 0.2)',
            '--app-text': '#111111',
            '--app-text-muted': 'rgba(0, 0, 0, 0.6)',
            '--app-text-faint': 'rgba(0, 0, 0, 0.55)',
            '--app-glass': 'rgba(255, 255, 255, 0.9)',
            '--app-glass-card': 'rgba(0, 0, 0, 0.02)',
            '--app-glass-card-hover': 'rgba(0, 0, 0, 0.05)',
            '--app-glass-modal': 'rgba(255, 255, 255, 0.88)',
            '--app-input': 'rgba(0, 0, 0, 0.05)',
            '--app-scrollbar': 'rgba(0, 0, 0, 0.12)',
            '--app-scrollbar-hover': 'rgba(0, 0, 0, 0.2)',
            '--app-accent': '#2563eb',
            '--app-accent-text': '#ffffff',
            '--app-modal-backdrop': 'rgba(15, 23, 42, 0.14)',
            '--app-modal-shadow': '0 14px 36px rgba(15, 23, 42, 0.14)',
            '--app-logo': '#111111',
            '--app-code-bg': '#fafafa',
            '--app-code-text': '#1d4ed8',
            '--app-code-keyword': '#1d4ed8',
            '--app-code-string': '#15803d',
            '--app-code-number': '#b45309',
            '--app-code-comment': '#6b7280',
            '--app-code-boolean': '#b91c1c',
            '--app-code-identifier': '#111111',
            '--app-code-key': '#0e7490',
            '--app-code-tag': '#1d4ed8',
            '--app-code-attr': '#92400e',
            '--app-code-punct': 'rgba(0, 0, 0, 0.6)',
            '--app-caret': '#111111',
            '--app-dot': 'rgba(0, 0, 0, 0.18)',
            '--app-shadow-raised': 'none',
            '--app-shadow-overlay': '0 14px 36px rgba(17, 24, 39, 0.16)',
            '--app-shadow-sticky': '0 4px 14px rgba(17, 24, 39, 0.12)',
            '--app-sticky-default-bg': 'rgba(96, 165, 250, 0.32)',
            '--app-sticky-default-border': 'rgba(59, 130, 246, 0.62)',
            '--app-sticky-default-header': 'rgba(147, 197, 253, 0.46)',
            '--app-sticky-text': '#111827',
            '--app-sticky-text-muted': 'rgba(17, 24, 39, 0.78)',
            '--app-sticky-text-faint': 'rgba(17, 24, 39, 0.56)',
            '--app-sticky-control': 'rgba(17, 24, 39, 0.68)',
            '--app-sticky-control-hover': 'rgba(17, 24, 39, 0.10)',
            '--app-sticky-code-bg': 'rgba(255, 255, 255, 0.34)',
        },
    },
    {
        id: 'solarized-light',
        name: 'Solarized Light',
        description: 'A warm, low-contrast light theme based on Solarized.',
        preview: '/themes/SolarizedLight.png',
        vars: {
            '--app-bg': '#fdf6e3',
            '--app-surface': '#eee8d5',
            '--app-surface-2': '#e6e0cf',
            '--app-surface-3': '#f5eeda',
            '--app-border': 'rgba(88, 110, 117, 0.25)',
            '--app-border-strong': 'rgba(88, 110, 117, 0.4)',
            '--app-text': '#566c73',
            '--app-text-muted': 'rgba(86, 108, 115, 1)',
            '--app-text-faint': 'rgba(86, 108, 115, 0.94)',
            '--app-glass': 'rgba(238, 232, 213, 0.9)',
            '--app-glass-card': 'rgba(88, 110, 117, 0.05)',
            '--app-glass-card-hover': 'rgba(88, 110, 117, 0.09)',
            '--app-glass-modal': 'rgba(238, 232, 213, 0.88)',
            '--app-input': 'rgba(88, 110, 117, 0.08)',
            '--app-scrollbar': 'rgba(88, 110, 117, 0.25)',
            '--app-scrollbar-hover': 'rgba(88, 110, 117, 0.4)',
            '--app-accent': '#697800',
            '--app-accent-text': '#fdf6e3',
            '--app-modal-backdrop': 'rgba(0, 43, 54, 0.16)',
            '--app-modal-shadow': '0 14px 36px rgba(0, 43, 54, 0.14)',
            '--app-logo': '#002b36',
            '--app-code-bg': '#eee8d5',
            '--app-code-text': '#1e6da5',
            '--app-code-keyword': '#616f00',
            '--app-code-string': '#846400',
            '--app-code-number': '#bf2a72',
            '--app-code-comment': '#5d6b6b',
            '--app-code-boolean': '#bf2a72',
            '--app-code-identifier': '#566c73',
            '--app-code-key': '#1e736c',
            '--app-code-tag': '#1e6da5',
            '--app-code-attr': '#b64314',
            '--app-code-punct': '#576a71',
            '--app-caret': '#566c73',
            '--app-dot': 'rgba(88, 110, 117, 0.5)',
            '--app-shadow-raised': 'none',
            '--app-shadow-overlay': '0 14px 36px rgba(0, 43, 54, 0.16)',
            '--app-shadow-sticky': '0 4px 14px rgba(0, 43, 54, 0.12)',
            '--app-sticky-default-bg': 'rgba(125, 182, 216, 0.32)',
            '--app-sticky-default-border': 'rgba(75, 150, 196, 0.62)',
            '--app-sticky-default-header': 'rgba(166, 206, 228, 0.46)',
            '--app-sticky-text': '#002b36',
            '--app-sticky-text-muted': 'rgba(0, 43, 54, 0.78)',
            '--app-sticky-text-faint': 'rgba(0, 43, 54, 0.56)',
            '--app-sticky-control': 'rgba(0, 43, 54, 0.68)',
            '--app-sticky-control-hover': 'rgba(0, 43, 54, 0.10)',
            '--app-sticky-code-bg': 'rgba(255, 255, 255, 0.34)',
        },
    },
    {
        id: 'solarized-dark',
        name: 'Solarized Dark',
        description: 'A dark, warm Solarized theme.',
        preview: '/themes/SolarizedDark.png',
        vars: {
            '--app-bg': '#002b36',
            '--app-surface': '#073642',
            '--app-surface-2': '#0a4050',
            '--app-surface-3': '#01313d',
            '--app-border': 'rgba(147, 161, 161, 0.2)',
            '--app-border-strong': 'rgba(147, 161, 161, 0.35)',
            '--app-text': '#93a1a1',
            '--app-text-muted': 'rgba(147, 161, 161, 1)',
            '--app-text-faint': 'rgba(147, 161, 161, 0.9)',
            '--app-glass': 'rgba(7, 54, 66, 0.9)',
            '--app-glass-card': 'rgba(147, 161, 161, 0.05)',
            '--app-glass-card-hover': 'rgba(147, 161, 161, 0.09)',
            '--app-glass-modal': 'rgba(7, 54, 66, 0.85)',
            '--app-input': 'rgba(0, 0, 0, 0.3)',
            '--app-scrollbar': 'rgba(147, 161, 161, 0.25)',
            '--app-scrollbar-hover': 'rgba(147, 161, 161, 0.4)',
            '--app-accent': '#859900',
            '--app-accent-text': '#002b36',
            '--app-modal-backdrop': 'rgba(0, 20, 26, 0.48)',
            '--app-modal-shadow': '0 20px 52px rgba(0, 20, 26, 0.36)',
            '--app-logo': '#ffffff',
            '--app-code-bg': '#042029',
            '--app-code-text': '#839496',
            '--app-code-keyword': '#859900',
            '--app-code-string': '#2aa198',
            '--app-code-number': '#da5696',
            '--app-code-comment': '#6d8992',
            '--app-code-boolean': '#da5696',
            '--app-code-identifier': '#93a1a1',
            '--app-code-key': '#268bd2',
            '--app-code-tag': '#268bd2',
            '--app-code-attr': '#e55519',
            '--app-code-punct': '#708891',
            '--app-caret': '#839496',
            '--app-dot': 'rgba(147, 161, 161, 0.25)',
            '--app-shadow-raised': '0 8px 20px rgba(0, 20, 26, 0.18)',
            '--app-shadow-overlay': '0 16px 40px rgba(0, 20, 26, 0.28)',
            '--app-shadow-sticky': '0 4px 14px rgba(0, 20, 26, 0.22)',
            '--app-sticky-default-bg': 'rgba(147, 161, 161, 0.10)',
            '--app-sticky-default-border': 'rgba(147, 161, 161, 0.30)',
            '--app-sticky-default-header': 'rgba(147, 161, 161, 0.14)',
            '--app-sticky-text': '#d7e0df',
            '--app-sticky-text-muted': 'rgba(215, 224, 223, 0.74)',
            '--app-sticky-text-faint': 'rgba(215, 224, 223, 0.45)',
            '--app-sticky-control': 'rgba(215, 224, 223, 0.68)',
            '--app-sticky-control-hover': 'rgba(215, 224, 223, 0.10)',
            '--app-sticky-code-bg': 'rgba(0, 20, 26, 0.24)',
        },
    },
];

export const DEFAULT_THEME_ID: ThemeId = 'dark';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = AUTO_THEME_ID;

export function getThemeById(id: string | null | undefined): ThemeDefinition {
    if (!id) return THEMES[0];
    return THEMES.find(t => t.id === id) || THEMES[0];
}

export function isThemePreference(id: string | null | undefined): id is ThemePreference {
    return id === AUTO_THEME_ID || THEMES.some((theme) => theme.id === id);
}

export function getDeviceThemeId(): ThemeId {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

export function resolveThemePreference(preference: ThemePreference): ThemeDefinition {
    return getThemeById(preference === AUTO_THEME_ID ? getDeviceThemeId() : preference);
}

export function applyThemeVars(theme: ThemeDefinition) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme.id);
    const style = root.style;
    for (const [key, value] of Object.entries(theme.vars)) {
        style.setProperty(key, value);
    }
}
