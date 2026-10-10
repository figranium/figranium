import { Skeleton } from './common/Skeleton';

interface LoadingScreenProps {
    title?: string;
    subtitle?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = () => {
    return (
        <div className="fixed inset-0 z-[80] theme-bg flex items-center justify-center p-6">
            <div className="app-panel w-full max-w-sm space-y-6 p-9" aria-label="Loading" role="status">
                <div className="flex items-center gap-4"><Skeleton className="h-12 w-12 rounded-xl" /><div className="flex-1 space-y-3"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-2.5 w-full" /></div></div>
                <div className="space-y-3"><Skeleton className="h-2.5 w-full" /><Skeleton className="h-2.5 w-5/6" /><Skeleton className="h-2.5 w-2/3" /></div>
            </div>
        </div>
    );
};

export default LoadingScreen;
