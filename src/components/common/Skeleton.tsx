import type { CSSProperties } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
    return <div aria-hidden="true" className={`app-skeleton ${className}`} style={style} />;
}

export function TaskListSkeleton({ rows = 4 }: { rows?: number }) {
    return <div className="divide-y theme-border" aria-label="Loading tasks" role="status">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4 px-5 py-4"><Skeleton className="h-10 w-10 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-2.5 w-2/5" /><div className="flex gap-2 pt-1"><Skeleton className="h-5 w-12 rounded-md" /><Skeleton className="h-5 w-16 rounded-md" /></div></div><div className="hidden gap-2 sm:flex"><Skeleton className="h-8 w-20 rounded-lg" /><Skeleton className="h-8 w-8 rounded-lg" /></div></div>)}</div>;
}

export function ExecutionListSkeleton({ rows = 5 }: { rows?: number }) {
    return <div aria-label="Loading executions" role="status">{Array.from({ length: rows }, (_, index) => <div key={index} className="grid min-h-[94px] grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b theme-border px-5 py-4"><div className="space-y-2"><Skeleton className="h-2.5 w-14" /><Skeleton className="h-2.5 w-10" /></div><div className="min-w-0 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-2.5 w-28" /></div><div className="flex items-center gap-3"><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-7 w-7 rounded-lg" /></div></div>)}</div>;
}

export function PasswordListSkeleton({ rows = 4 }: { rows?: number }) {
    return <div aria-label="Loading passwords" role="status">{Array.from({ length: rows }, (_, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(11rem,0.55fr)] gap-x-8 border-b theme-border px-5 py-4"><div className="space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-2.5 w-48" /></div><div className="space-y-2"><Skeleton className="h-2.5 w-28" /><Skeleton className="h-2.5 w-20" /></div></div>)}</div>;
}

export function SettingsListSkeleton({ rows = 3 }: { rows?: number }) {
    return <div className="space-y-3" aria-label="Loading settings" role="status">{Array.from({ length: rows }, (_, index) => <div key={index} className="rounded-2xl border theme-border p-4"><div className="flex items-start justify-between gap-5"><div className="flex-1 space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-2.5 w-3/5" /></div><Skeleton className="h-8 w-20 rounded-lg" /></div></div>)}</div>;
}

export function ExecutionDetailSkeleton() {
    return <main className="app-page custom-scrollbar animate-in fade-in duration-300" aria-label="Loading execution" role="status"><div className="app-page-inner space-y-6"><header className="app-page-header"><div className="space-y-3"><Skeleton className="h-6 w-52" /><Skeleton className="h-3 w-72" /></div><Skeleton className="h-9 w-24 rounded-xl" /></header><section className="app-panel grid gap-6 p-6 md:grid-cols-[1.1fr_.9fr]"><div className="space-y-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div><div className="grid grid-cols-2 gap-4"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div></section><section className="app-panel p-6 space-y-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></section></div></main>;
}
