import type { CSSProperties } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
    return <div aria-hidden="true" className={`app-skeleton ${className}`} style={style} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
    return <div className="space-y-3" aria-label="Loading content" role="status">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4 rounded-2xl border theme-border p-4"><Skeleton className="h-9 w-9 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-2/5" /><Skeleton className="h-2.5 w-3/5" /></div><Skeleton className="h-6 w-16 rounded-lg" /></div>)}</div>;
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
    return <main className="app-page custom-scrollbar animate-in fade-in duration-300" aria-label="Loading content" role="status"><div className="app-page-inner space-y-6"><header className="app-page-header"><div className="space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-3 w-64" /></div><Skeleton className="h-10 w-28 rounded-xl" /></header><section className="app-panel overflow-hidden p-5"><ListSkeleton rows={rows} /></section></div></main>;
}
