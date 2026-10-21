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
    onOpenBehavior: () => void;
    onOpenHistory: () => void;
    onOpenStates: () => void;
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
    currentTask,
    onUpdateTaskName,
    onAutoSave,
    onOpenApi,
    onOpenSchedule,
    onOpenVariables,
    onOpenBehavior,
    onOpenHistory,
    onOpenStates,
}) => {
    return (
        <div className="fixed top-0 left-0 right-0 z-40 w-full pointer-events-none">
            <div className="glass-card editor-top-bar relative flex items-center justify-between p-1 px-6 border-b border-white/10 backdrop-blur-xl pointer-events-auto">
                <div className="absolute inset-x-0 mx-auto w-full max-w-[400px] px-6 pointer-events-none">
                    <input
                        type="text"
                        value={currentTask.name || ''}
                        onChange={(e) => onUpdateTaskName(e.target.value)}
                        onBlur={() => onAutoSave()}
                        placeholder="Task name"
                        className="bg-transparent border-none text-xs font-bold text-white tracking-[0.08em] focus:outline-none w-full pointer-events-auto text-center placeholder:text-white/20 py-1"
                    />
                </div>
                <div className="relative z-10 ml-auto flex items-center gap-1">
                    <button
                        onClick={onOpenApi}
                        className="editor-top-bar-control w-8 h-8 border-0 bg-transparent shadow-none flex items-center justify-center text-white/30 hover:bg-transparent transition-colors focus:outline-none"
                        title="API"
                        aria-label="API"
                    >
                        <TablerIcon name="api" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenSchedule}
                        className="editor-top-bar-control w-8 h-8 border-0 bg-transparent shadow-none flex items-center justify-center text-white/30 hover:bg-transparent transition-colors focus:outline-none"
                        title="Schedule"
                        aria-label="Schedule"
                    >
                        <TablerIcon name="event_repeat" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenVariables}
                        className="editor-top-bar-control w-8 h-8 border-0 bg-transparent shadow-none flex items-center justify-center text-white/30 hover:bg-transparent transition-colors focus:outline-none"
                        title="Variables"
                        aria-label="Variables"
                    >
                        <TablerIcon name="variables" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenBehavior}
                        className="editor-top-bar-control w-8 h-8 border-0 bg-transparent shadow-none flex items-center justify-center text-white/30 hover:bg-transparent transition-colors focus:outline-none"
                        title="Behavior"
                        aria-label="Behavior"
                    >
                        <TablerIcon name="device_gamepad_3" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenStates}
                        className="editor-top-bar-control w-8 h-8 border-0 bg-transparent shadow-none flex items-center justify-center text-white/30 hover:bg-transparent transition-colors focus:outline-none"
                        title="States"
                        aria-label="States"
                    >
                        <TablerIcon name="polygon" className="text-base" />
                    </button>
                    <button
                        onClick={onOpenHistory}
                        className="editor-top-bar-control w-8 h-8 border-0 bg-transparent shadow-none flex items-center justify-center text-white/30 hover:bg-transparent transition-colors focus:outline-none"
                        title="Version History"
                        aria-label="Version History"
                    >
                        <TablerIcon name="history_toggle" className="text-base" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditorTopBar;
