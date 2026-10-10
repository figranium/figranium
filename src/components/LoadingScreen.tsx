import { Skeleton } from './common/Skeleton';

interface LoadingScreenProps {
    title?: string;
    subtitle?: string;
    variant?: 'auth' | 'workspace' | 'editor';
}

const LoadingCopy = ({ title, subtitle }: Required<Pick<LoadingScreenProps, 'title' | 'subtitle'>>) => <div className="sr-only" role="status" aria-live="polite">{title}. {subtitle}</div>;

const WorkspaceLoader = ({ title, subtitle }: Required<Pick<LoadingScreenProps, 'title' | 'subtitle'>>) => (
    <main className="app-page loading-page" aria-busy="true">
        <LoadingCopy title={title} subtitle={subtitle} />
        <div className="app-page-inner loading-page-inner">
            <header className="app-page-header loading-page-header">
                <div className="space-y-3"><Skeleton className="h-8 w-44" /><Skeleton className="h-3 w-80 max-w-full" /></div>
                <Skeleton className="h-10 w-32 rounded-xl" />
            </header>
            <section className="app-panel loading-workspace-panel">
                <div className="loading-workspace-toolbar"><Skeleton className="h-9 flex-1 rounded-xl" /><Skeleton className="h-9 w-28 rounded-xl" /><Skeleton className="h-9 w-24 rounded-xl" /></div>
                <div className="loading-workspace-grid">
                    {Array.from({ length: 6 }, (_, index) => <div className="loading-workspace-card" key={index}><Skeleton className="h-10 w-10 rounded-xl" /><div className="mt-5 space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div><div className="mt-auto pt-6"><Skeleton className="h-8 w-24 rounded-lg" /></div></div>)}
                </div>
            </section>
        </div>
    </main>
);

const EditorLoader = ({ title, subtitle }: Required<Pick<LoadingScreenProps, 'title' | 'subtitle'>>) => (
    <main className="loading-editor" aria-busy="true">
        <LoadingCopy title={title} subtitle={subtitle} />
        <header className="loading-editor-header"><div className="flex min-w-0 items-center gap-3"><Skeleton className="h-9 w-9 shrink-0 rounded-xl" /><div className="min-w-0 space-y-2"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-2.5 w-28" /></div></div><div className="flex items-center gap-2"><Skeleton className="h-9 w-20 rounded-xl" /><Skeleton className="h-9 w-24 rounded-xl" /></div></header>
        <div className="loading-editor-body"><section className="loading-editor-canvas"><div className="loading-editor-canvas-toolbar"><Skeleton className="h-8 w-20 rounded-lg" /><Skeleton className="h-8 w-8 rounded-lg" /></div><div className="loading-editor-flow"><div className="loading-editor-node"><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-8 w-full rounded-lg" /></div><Skeleton className="h-8 w-0.5" /><div className="loading-editor-node loading-editor-node-wide"><Skeleton className="h-3 w-32" /><Skeleton className="mt-3 h-12 w-full rounded-lg" /><Skeleton className="mt-2 h-3 w-3/5" /></div></div></section><aside className="loading-editor-panel"><Skeleton className="h-4 w-28" /><div className="mt-6 space-y-5"><Skeleton className="h-9 w-full rounded-lg" /><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-9 w-3/5 rounded-lg" /></div></aside></div>
    </main>
);

const LoadingScreen: React.FC<LoadingScreenProps> = ({ title = 'Loading', subtitle = 'Preparing your workspace', variant = 'workspace' }) => {
    if (variant === 'editor') return <EditorLoader title={title} subtitle={subtitle} />;
    if (variant === 'workspace') return <WorkspaceLoader title={title} subtitle={subtitle} />;

    return <div className="fixed inset-0 z-[80] theme-bg flex items-center justify-center p-6" aria-busy="true">
        <LoadingCopy title={title} subtitle={subtitle} />
        <div className="app-panel w-full max-w-sm space-y-6 p-9"><div className="flex items-center gap-4"><Skeleton className="h-12 w-12 rounded-xl" /><div className="flex-1 space-y-3"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-2.5 w-full" /></div></div><div className="space-y-3"><Skeleton className="h-2.5 w-full" /><Skeleton className="h-2.5 w-5/6" /><Skeleton className="h-2.5 w-2/3" /></div><div><p className="text-sm font-semibold theme-text">{title}</p><p className="mt-1 text-xs theme-text-faint">{subtitle}</p></div></div>
    </div>;
};

export default LoadingScreen;
