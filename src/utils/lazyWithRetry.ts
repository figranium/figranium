import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const STALE_IMPORT_PATTERN = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
const RETRY_KEY = 'figranium.lazy-import-retry';

/**
 * Reloads once when a deployment has removed a code-split chunk referenced by
 * an already-open tab. A successful import clears the guard for future deploys.
 */
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): LazyExoticComponent<T> {
    return lazy(async () => {
        try {
            const module = await factory();
            try { window.sessionStorage.removeItem(RETRY_KEY); } catch { /* storage unavailable */ }
            return module;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            let alreadyRetried = true;
            try {
                alreadyRetried = window.sessionStorage.getItem(RETRY_KEY) === '1';
                if (!alreadyRetried && STALE_IMPORT_PATTERN.test(message)) {
                    window.sessionStorage.setItem(RETRY_KEY, '1');
                    window.location.reload();
                    return new Promise<{ default: T }>(() => {});
                }
            } catch { /* let the error boundary handle browsers without storage */ }
            throw error;
        }
    });
}
