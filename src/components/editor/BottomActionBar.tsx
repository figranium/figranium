import React from 'react';
import TablerIcon from '../TablerIcon';

interface BottomActionBarProps {
    isExecuting: boolean;
    isStopping: boolean;
    isHeadfulOpen: boolean;
    onRun: () => void;
    onStop?: () => void;
    onOpenHeadful: () => void;
    onStopHeadful?: () => void;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
    isExecuting,
    isStopping,
    isHeadfulOpen,
    onRun,
    onStop,
    onOpenHeadful,
    onStopHeadful,
}) => {
    return (
        <div className="editor-action-bar fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 p-2 rounded-3xl backdrop-blur-xl">
            <button
                onClick={onRun}
                disabled={isExecuting || isHeadfulOpen}
                className="editor-action-primary px-8 py-4 rounded-2xl font-bold text-xs tracking-[0.3em] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px] focus:outline-none focus-visible:ring-2"
                title="Run Task (Ctrl + Enter)"
                aria-label="Run Task (Ctrl + Enter)"
            >
                {isExecuting ? (
                    <div className="editor-action-spinner w-3 h-3 border-2 rounded-full animate-spin" />
                ) : <TablerIcon name="play_arrow" className="text-sm" />}
                <span>
                    {isStopping ? 'Stopping...' : (isExecuting ? 'Running...' : 'Run Task')}
                </span>
            </button>
            {isExecuting && (
                <button
                    onClick={() => onStop?.()}
                    disabled={isStopping}
                    className="editor-action-secondary w-12 h-12 rounded-2xl border transition-all flex items-center justify-center"
                    title={isStopping ? 'Stopping task' : 'Stop task'}
                    aria-label={isStopping ? 'Stopping task' : 'Stop task'}
                >
                    <TablerIcon name={isStopping ? 'progress_activity' : 'stop'} className={`text-base ${isStopping ? 'animate-spin' : ''}`} />
                </button>
            )}
            <button
                onClick={() => {
                    if (isHeadfulOpen) {
                        onStopHeadful?.();
                    } else {
                        onOpenHeadful();
                    }
                }}
                disabled={isExecuting}
                className={`px-4 h-12 rounded-2xl border text-xs font-bold tracking-widest transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${isHeadfulOpen
                    ? 'border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'editor-action-secondary'
                    }`}
                title={isHeadfulOpen ? 'Stop headful browser' : 'Open browser to log in'}
            >
                <TablerIcon name={isHeadfulOpen ? 'stop' : 'open_in_browser'} className="text-base" />
                {isHeadfulOpen ? 'Close Browser' : 'Open Browser'}
            </button>
        </div>
    );
};

export default BottomActionBar;
