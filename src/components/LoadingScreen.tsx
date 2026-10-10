import TablerIcon from './TablerIcon';

export type LoadingScreenVariant = 'auth' | 'dashboard' | 'templates' | 'vault' | 'settings' | 'executions' | 'execution-detail' | 'cabinets' | 'not-found' | 'editor' | 'workspace';

interface LoadingScreenProps {
    title?: string;
    subtitle?: string;
    variant?: LoadingScreenVariant;
}

/** A lightweight page-transition loader. Content-level loads use Skeleton components instead. */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ title = 'Loading', subtitle = 'Preparing your workspace', variant = 'workspace' }) => {
    const isAuth = variant === 'auth';
    const containerClass = isAuth
        ? 'fixed inset-0 z-[80] flex items-center justify-center theme-bg'
        : 'app-page flex items-center justify-center';

    return <main className={containerClass} role="status" aria-live="polite" aria-busy="true">
        <div className="flex flex-col items-center px-6 text-center">
            <TablerIcon name="progress_activity" className="animate-spin text-3xl theme-text-muted" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold theme-text">{title}</p>
            <p className="mt-1 text-xs theme-text-faint">{subtitle}</p>
        </div>
    </main>;
};

export default LoadingScreen;
