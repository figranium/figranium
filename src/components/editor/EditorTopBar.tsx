import React from 'react';
import TablerIcon from '../TablerIcon';
import { Task } from '../../types';

interface EditorTopBarProps {
    currentTask: Task;
    onUpdateTaskName: (name: string) => void;
    onAutoSave: () => void;
    onOpenApi: () => void;
    onOpenSchedule: () => void;
    onOpenVariables: () => void;
    onOpenHistory: () => void;
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
    currentTask,
    onUpdateTaskName,
    onAutoSave,
    onOpenApi,
    onOpenSchedule,
    onOpenVariables,
    onOpenHistory,
}) => {
    return (
        <div className="fixed top-0 left-0 right-0 z-40 w-full pointer-events-none">
            <div className="glass-card flex items-center justify-between p-1 px-6 border-b border-white/10 backdrop-blur-xl pointer-events-auto">
                <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[400px] px-6">
                    <input
                        type="text"
                        value={currentTask.name || ''}
                        onChange={(e) => onUpdateTaskName(e.target.value)}
                        onBlur={() => onAutoSave()}
                        placeholder="Task name"
                        className="bg-transparent border-none text-xs font-bold text-white tracking-[0.08em] focus:outline-none w-full text-center placeholder:text-white/20 py-1"
                    />
                </div>
                <div className="ml-auto flex items-center gap-1">
                    <button
                        onClick={onOpenApi}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="API"
                        aria-label="API"
                    >
                        <TablerIcon name="api" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenSchedule}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="Schedule"
                        aria-label="Schedule"
                    >
                        <TablerIcon name="event_repeat" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenVariables}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="Variables"
                        aria-label="Variables"
                    >
                        <TablerIcon name="variables" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenHistory}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="Version History"
                        aria-label="Version History"
                    >
                        <TablerIcon name="history" className="text-base" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditorTopBar;
