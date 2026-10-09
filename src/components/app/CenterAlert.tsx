import { useEffect, useState } from 'react';
import TablerIcon from '../TablerIcon';

interface CenterAlertProps {
    message: string;
    tone?: 'success' | 'error';
    onClose: () => void;
}

const CenterAlert: React.FC<CenterAlertProps> = ({ message, tone, onClose }) => {
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        const autoTimer = setTimeout(() => {
            setClosing(true);
        }, 2500);
        return () => clearTimeout(autoTimer);
    }, []);

    useEffect(() => {
        if (!closing) return;
        const closeTimer = setTimeout(() => onClose(), 240);
        return () => clearTimeout(closeTimer);
    }, [closing, onClose]);

    return (
        <div className={`fixed bottom-6 right-6 z-[220] max-w-sm w-full ${closing ? 'animate-out fade-out slide-out-to-bottom-3 duration-200' : 'animate-in fade-in slide-in-from-bottom-3 duration-300'}`}>
            <div
                role={tone === 'error' ? 'alert' : 'status'}
                aria-label={tone === 'error' ? 'Error' : 'Success'}
                className={`app-toast rounded-2xl p-4 shadow-2xl flex items-center gap-3 ${closing ? 'animate-out fade-out zoom-out-95 duration-200' : 'animate-in fade-in zoom-in-95 duration-300'}`}
            >
                <div className="shrink-0">
                    {tone === 'error' ? (
                        <TablerIcon name="error" className="text-red-400 text-lg" />
                    ) : (
                        <TablerIcon name="check_circle" className="text-emerald-400 text-lg" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs theme-text leading-relaxed break-words">{message}</p>
                </div>
                <button
                    onClick={() => setClosing(true)}
                    className="app-toast-close inline-flex h-6 w-6 shrink-0 items-center justify-center bg-transparent p-0 theme-text-faint transition-colors hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                    aria-label="Close notification"
                    title="Close"
                >
                    <TablerIcon name="close" className="text-base" />
                </button>
            </div>
        </div>
    );
};

export default CenterAlert;
