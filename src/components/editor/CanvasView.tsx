import React, { useState, useCallback, useEffect, useRef } from 'react';
import TablerIcon from '../TablerIcon';
import ActionItem from './ActionItem';
import StickyNote from './StickyNote';
import CanvasDotGrid from './CanvasDotGrid';
import { Task, Action, BlockTestResult, StickyNote as StickyNoteType } from '../../types';
import ExecutionConfigModal from './ExecutionConfigModal';
import ExtractionScriptBlock from './ExtractionScriptBlock';
import {
    findMatchingEndIndex,
    getIfFalseScopeId,
    getIfTrueScopeId,
    getLoopBodyScopeId,
    isBlockStartAction,
    isLoopAction,
} from '../../utils/actionBlocks';

interface CanvasViewProps {
    currentTask: Task;
    setCurrentTask: (task: Task) => void;
    canvasOffset: { x: number; y: number };
    canvasScale: number;
    canvasViewportRef: React.RefObject<HTMLDivElement>;
    triggerExpanded: boolean;
    setTriggerExpanded: (val: boolean) => void;
    onOpenCabinet: (tab?: any) => void;
    handleAutoSave: (task?: Task) => void;
    dragState: any;
    dragOverIndex: number | null;
    selectedActionIds: Set<string>;
    setSelectedActionIds?: (ids: Set<string>) => void;
    actionStatusById: Record<string, string>;
    availableTasks: Task[];
    selectorOptionsById: Record<string, string[]>;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    updateAction: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    openActionPalette: (targetId?: string, insertIndex?: number) => void;
    openContextMenu: (e: React.MouseEvent, id: string) => void;
    handleActionPointerDown: (e: React.PointerEvent, id: string, index: number) => void;
    onOpenHeadful: (url: string, targetActionId?: string, taskSnapshot?: Task, variables?: any) => void;
    isHeadfulOpen?: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    selectionBox: any;
    onAddStickyNote: (x: number, y: number) => void;
    onUpdateStickyNote: (id: string, updates: Partial<StickyNoteType>) => void;
    onDeleteStickyNote: (id: string) => void;
    onDuplicateStickyNote: (note: StickyNoteType) => void;
    selectedNoteIds: Set<string>;
    autoOpenActionId?: string | null;
    onClearAutoOpenActionId?: () => void;
}

const LOOP_CONNECTOR_WIDTH = 760;
const LOOP_MAIN_X = 380;
const LOOP_BODY_X = 600;
const LOOP_RAIL_X = 160;
const LOOP_BODY_TOP = 132;

const LoopConnector: React.FC = () => {
    const hostRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const updateHeight = () => setHeight(Math.round(host.getBoundingClientRect().height));
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    const bottomY = Math.max(LOOP_BODY_TOP + 48, height - 22);
    const closedLoopPath = [
        `M ${LOOP_MAIN_X} 58`,
        `H ${LOOP_BODY_X - 16}`,
        `Q ${LOOP_BODY_X} 58 ${LOOP_BODY_X} 74`,
        `V ${bottomY - 18}`,
        `Q ${LOOP_BODY_X} ${bottomY} ${LOOP_BODY_X - 18} ${bottomY}`,
        `H ${LOOP_RAIL_X + 18}`,
        `Q ${LOOP_RAIL_X} ${bottomY} ${LOOP_RAIL_X} ${bottomY - 18}`,
        'V 76',
        `Q ${LOOP_RAIL_X} 58 ${LOOP_RAIL_X + 18} 58`,
        `H ${LOOP_MAIN_X}`,
        'Z',
    ].join(' ');

    return (
        <div ref={hostRef} className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
            {height > 0 && (
                <svg
                    className="canvas-loop-connector absolute inset-0 overflow-visible text-white/25"
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${LOOP_CONNECTOR_WIDTH} ${height}`}
                    preserveAspectRatio="none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d={`M ${LOOP_MAIN_X} 0 V 58`} vectorEffect="non-scaling-stroke" />
                    <path d={closedLoopPath} vectorEffect="non-scaling-stroke" />
                    <path d={`M ${LOOP_MAIN_X} ${bottomY} V ${height}`} vectorEffect="non-scaling-stroke" />
                </svg>
            )}
        </div>
    );
};

const CanvasView: React.FC<CanvasViewProps> = ({
    currentTask,
    setCurrentTask,
    canvasOffset,
    canvasScale,
    canvasViewportRef,
    onOpenCabinet,
    handleAutoSave,
    dragState,
    dragOverIndex,
    selectedActionIds,
    actionStatusById,
    availableTasks,
    selectorOptionsById,
    onStartGroupContainerInspect,
    onStartGroupFieldInspect,
    updateAction,
    openActionPalette,
    openContextMenu,
    handleActionPointerDown,
    onOpenHeadful,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    selectionBox,
    onAddStickyNote,
    onUpdateStickyNote,
    onDeleteStickyNote,
    onDuplicateStickyNote,
    selectedNoteIds,
    autoOpenActionId,
    onClearAutoOpenActionId,
}) => {
    const onStartInspect = useCallback((id: string, field: 'selector' | 'targetSelector' = 'selector') => {
        const inspectId = field === 'targetSelector' ? `${id}::targetSelector` : id;
        onOpenHeadful?.(currentTask.url || 'https://www.google.com', inspectId, currentTask, currentTask.variables);
    }, [onOpenHeadful, currentTask.url, currentTask.variables]);

    const handleCreateVariable = useCallback((name: string) => {
        const nextVars = { ...currentTask.variables };
        if (name in nextVars) return;
        nextVars[name] = { type: 'string', value: '', autoCreated: true };
        const updated = { ...currentTask, variables: nextVars };
        setCurrentTask(updated);
        handleAutoSave(updated);
    }, [currentTask, setCurrentTask, handleAutoSave]);

    const handleDeleteVariable = useCallback((name: string) => {
        const nextVars = { ...currentTask.variables };
        if (!(name in nextVars) || !nextVars[name].autoCreated) return;
        delete nextVars[name];
        const updated = { ...currentTask, variables: nextVars };
        setCurrentTask(updated);
        handleAutoSave(updated);
    }, [currentTask, setCurrentTask, handleAutoSave]);

    const [blockTestResultsById, setBlockTestResultsById] = useState<Record<string, BlockTestResult>>({});
    const [isExecutionConfigOpen, setIsExecutionConfigOpen] = useState(false);

    const updateExecutionConfig = useCallback((updates: Partial<Task>, saveImmediately = false) => {
        const updated = { ...currentTask, ...updates };
        setCurrentTask(updated);
        if (saveImmediately) handleAutoSave(updated);
    }, [currentTask, setCurrentTask, handleAutoSave]);

    useEffect(() => {
        setBlockTestResultsById({});
    }, [currentTask.id]);

    const handleBlockTestResult = useCallback((result: BlockTestResult) => {
        setBlockTestResultsById((previous) => ({ ...previous, [result.actionId]: result }));
    }, []);

    const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);

    const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
        // Only trigger on the canvas background, not on blocks or sticky notes
        const target = e.target as HTMLElement;
        if (target.closest('[data-action-id]') || target.closest('[data-sticky-note-id]') || target.closest('[data-interactive-target="true"]')) return;
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const worldX = Math.round((e.clientX - rect.left - canvasOffset.x) / canvasScale);
        const worldY = Math.round((e.clientY - rect.top - canvasOffset.y) / canvasScale);
        const padding = 8;
        const menuW = 180;
        const menuH = 48;
        const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - menuW - padding);
        const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - menuH - padding);
        setCanvasContextMenu({ x, y, worldX, worldY });
    }, [canvasOffset, canvasScale]);

    const buildAst = (
        startIndex: number,
        endIndex: number,
        _depth: number = 0,
        actionWidth: 280 | 360 = 360,
    ): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        let i = startIndex;
        while (i < endIndex) {
            const currentIndex = i;
            const action = currentTask.actions[currentIndex];
            if (!action) { i++; continue; }

            const matchingEnd = findMatchingEndIndex(currentTask.actions, currentIndex);

            if (action.type === 'if' && matchingEnd !== null && matchingEnd < endIndex) {
                const blockStart = i;
                const blockEnd = matchingEnd;
                let nestLevel = 1;
                let j = i + 1;
                let elseIndex = -1;
                while (j < blockEnd && nestLevel > 0) {
                    const a = currentTask.actions[j];
                    if (isBlockStartAction(a.type)) nestLevel++;
                    if (a.type === 'end') {
                        nestLevel--;
                    }
                    if (a.type === 'else' && nestLevel === 1) {
                        elseIndex = j;
                    }
                    j++;
                }

                const trueStart = blockStart + 1;
                const trueEnd = elseIndex !== -1 ? elseIndex : blockEnd;
                const falseStart = elseIndex !== -1 ? elseIndex + 1 : -1;
                const falseEnd = elseIndex !== -1 ? blockEnd : -1;
                const isNestedIf = _depth > 0;
                const branchActionWidth = isNestedIf ? 280 : actionWidth;

                nodes.push(
                    <div key={action.id} className="flex flex-col items-center w-full">
                        <div className="w-[360px]">
                            <ActionItem
                                action={action}
                                task={currentTask}
                                index={currentIndex}
                                isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                isDragging={dragState?.id === action.id}
                                dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                isSelected={selectedActionIds.has(action.id)}
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                                onCreateVariable={handleCreateVariable}
                                onDeleteVariable={handleDeleteVariable}
                                autoOpenConfig={autoOpenActionId === action.id}
                                onCloseConfigModal={onClearAutoOpenActionId}
                                testResult={blockTestResultsById[action.id]}
                                onTestResult={handleBlockTestResult}
                            />
                        </div>
                        <div className={`flex mt-4 relative ${isNestedIf ? 'gap-6 -translate-x-[132px]' : 'gap-16'}`}>
                            <div className={`flex flex-col items-center ${isNestedIf ? 'w-[280px]' : 'min-w-[200px]'}`}>
                                <div className="text-xs font-bold text-white/60 tracking-widest mb-2">
                                    True
                                </div>
                                <div className="w-px h-6 bg-white/25" />
                                <div className="flex flex-col items-center gap-3">
                                    {buildAst(trueStart, trueEnd, _depth + 1, branchActionWidth)}
                                </div>
                                <div className="mt-2 flex flex-col items-center">
                                    <div className="w-px h-4 bg-white/20" />
                                    <button
                                        data-action-drop-scope={getIfTrueScopeId(action.id)}
                                        onClick={() => openActionPalette(undefined, trueEnd)}
                                        className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label="Add action (Ctrl + K)"
                                        title="Add action (Ctrl + K)"
                                    >
                                        <TablerIcon name="add" className="canvas-insert-icon text-lg transition-colors" />
                                    </button>
                                </div>
                            </div>
                            <div className={`flex flex-col items-center ${isNestedIf ? 'w-[280px]' : 'min-w-[200px]'}`}>
                                    <div className="text-xs font-bold text-white/60 tracking-widest mb-2">Otherwise</div>
                                    <div className="w-px h-6 bg-white/25" />
                                    <div className="flex flex-col items-center gap-3">
                                        {falseStart !== -1 ? buildAst(falseStart, falseEnd, _depth + 1, branchActionWidth) : null}
                                    </div>
                                    <div className="mt-2 flex flex-col items-center">
                                        <div className="w-px h-4 bg-white/20" />
                                        <button
                                            data-action-drop-scope={getIfFalseScopeId(action.id)}
                                            onClick={() => {
                                                if (falseStart !== -1) {
                                                    openActionPalette(undefined, falseEnd);
                                                } else {
                                                    const elseAction: Action = { id: 'act_' + Date.now() + '_else', type: 'else', selector: '', value: '' };
                                                    const newActions = [...currentTask.actions];
                                                    newActions.splice(blockEnd, 0, elseAction);
                                                    setCurrentTask({ ...currentTask, actions: newActions });
                                                    handleAutoSave({ ...currentTask, actions: newActions });
                                                    setTimeout(() => openActionPalette(undefined, blockEnd + 1), 50);
                                                }
                                            }}
                                            className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Add action (Ctrl + K)"
                                            title="Add action (Ctrl + K)"
                                        >
                                            <TablerIcon name="add" className="canvas-insert-icon text-lg transition-colors" />
                                        </button>
                                    </div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center mt-3">
                            <div className="w-px h-2 bg-white/25" />
                            <button
                                onClick={() => openActionPalette(undefined, blockEnd + 1)}
                                className="w-8 h-8 border border-dashed border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Add action (Ctrl + K)"
                                title="Add action (Ctrl + K)"
                            >
                                <TablerIcon name="add" className="canvas-insert-icon text-sm transition-colors" />
                            </button>
                            <div className="w-px h-2 bg-white/25" />
                        </div>
                    </div>
                );
                i = blockEnd + 1;
            } else if (isLoopAction(action.type) && matchingEnd !== null && matchingEnd < endIndex) {
                const blockEnd = matchingEnd;
                const bodyStart = currentIndex + 1;
                const bodyEnd = blockEnd;
                const loopBodyScopeId = getLoopBodyScopeId(action.id);
                const isEmptyLoop = bodyStart === bodyEnd;

                nodes.push(
                    <div key={action.id} className="flex flex-col items-center w-full">
                        <div className="w-[360px]">
                            <ActionItem
                                action={action}
                                task={currentTask}
                                index={currentIndex}
                                isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                isDragging={dragState?.id === action.id}
                                dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                isSelected={selectedActionIds.has(action.id)}
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                                onCreateVariable={handleCreateVariable}
                                onDeleteVariable={handleDeleteVariable}
                                autoOpenConfig={autoOpenActionId === action.id}
                                onCloseConfigModal={onClearAutoOpenActionId}
                                testResult={blockTestResultsById[action.id]}
                                onTestResult={handleBlockTestResult}
                            />
                        </div>

                        <div className="relative w-[760px] min-h-[260px] shrink-0 pt-[132px] pb-11">
                            <LoopConnector />

                            {isEmptyLoop ? (
                                <button
                                    data-action-drop-scope={loopBodyScopeId}
                                    onClick={() => openActionPalette(undefined, bodyEnd)}
                                    className="absolute left-[576px] top-[123px] z-20 w-12 h-12 canvas-insert-button border border-dashed rounded-xl transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2"
                                    aria-label="Add action inside loop (Ctrl + K)"
                                    title="Add action inside loop (Ctrl + K)"
                                >
                                    <TablerIcon name="add" className="canvas-insert-icon text-lg transition-colors" />
                                </button>
                            ) : (
                            <div className="relative z-10 ml-[420px] w-[360px] flex flex-col items-center">
                                <div className="flex flex-col items-center gap-3 w-full">
                                    {buildAst(bodyStart, bodyEnd, _depth + 1)}
                                </div>
                                <div className="mt-2 flex flex-col items-center">
                                    <div className="h-4 border-l border-white/20" />
                                    <button
                                        data-action-drop-scope={loopBodyScopeId}
                                        onClick={() => openActionPalette(undefined, bodyEnd)}
                                        className="relative z-20 w-12 h-12 canvas-insert-button border border-dashed rounded-xl transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2"
                                        aria-label="Add action inside loop (Ctrl + K)"
                                        title="Add action inside loop (Ctrl + K)"
                                    >
                                        <TablerIcon name="add" className="canvas-insert-icon text-lg transition-colors" />
                                    </button>
                                </div>
                            </div>
                            )}
                        </div>

                        <div className="relative z-10 flex flex-col items-center">
                            <button
                                onClick={() => openActionPalette(undefined, blockEnd + 1)}
                                className="relative z-20 w-8 h-8 canvas-insert-button border border-dashed rounded-lg transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2"
                                aria-label="Add action after loop (Ctrl + K)"
                                title="Add action after loop (Ctrl + K)"
                            >
                                <TablerIcon name="add" className="canvas-insert-icon text-sm transition-colors" />
                            </button>
                            <div className="h-2 border-l border-white/25" />
                        </div>
                    </div>
                );
                i = blockEnd + 1;
            } else if (action.type === 'end' || action.type === 'else') {
                i++;
            } else {
                nodes.push(
                    <div key={action.id} className="flex flex-col items-center">
                        <div className={actionWidth === 280 ? 'w-[280px]' : 'w-[360px]'}>
                            <ActionItem
                                action={action}
                                task={currentTask}
                                index={currentIndex}
                                isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                isDragging={dragState?.id === action.id}
                                dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                isSelected={selectedActionIds.has(action.id)}
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                                onCreateVariable={handleCreateVariable}
                                onDeleteVariable={handleDeleteVariable}
                                autoOpenConfig={autoOpenActionId === action.id}
                                onCloseConfigModal={onClearAutoOpenActionId}
                                testResult={blockTestResultsById[action.id]}
                                onTestResult={handleBlockTestResult}
                            />
                        </div>
                        {i < endIndex - 1 && currentTask.actions[i + 1]?.type !== 'end' && (
                            <div className="flex flex-col items-center my-1">
                                <div className="w-px h-2 bg-white/25" />
                                <button
                                    onClick={() => openActionPalette(undefined, currentIndex + 1)}
                                    className="relative z-20 w-8 h-8 canvas-insert-button border border-dashed rounded-lg transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2"
                                    aria-label="Add action (Ctrl + K)"
                                    title="Add action (Ctrl + K)"
                                >
                                    <TablerIcon name="add" className="canvas-insert-icon text-sm transition-colors" />
                                </button>
                                <div className="w-px h-2 bg-white/25" />
                            </div>
                        )}
                    </div>
                );
                i++;
            }
        }
        return nodes;
    };

    return (
        <div
            ref={canvasViewportRef}
            className="canvas-workflow flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={handleCanvasContextMenu}
        >
            {/* Dot grid — viewport space so backgroundPosition tracks canvas offset directly,
                preventing the repeating pattern from aliasing on exact-multiple wheel deltas */}
            <div
                className="absolute inset-0 pointer-events-none z-0"
                style={{
                    backgroundImage: `radial-gradient(circle, var(--app-dot) 0.8px, transparent 0)`,
                    backgroundSize: `${22 * canvasScale}px ${22 * canvasScale}px`,
                    backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
                }}
            />
            <CanvasDotGrid
                canvasOffset={canvasOffset}
                canvasScale={canvasScale}
                viewportRef={canvasViewportRef}
                selectionBox={selectionBox}
            />

            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
                }}
            >
                {/* Sticky notes layer — below blocks (z-5 vs z-10) */}
                {(currentTask.stickyNotes || []).map((note) => (
                    <StickyNote
                        key={note.id}
                        note={note}
                        canvasScale={canvasScale}
                        isSelected={selectedNoteIds.has(note.id)}
                        onUpdate={onUpdateStickyNote}
                        onDelete={onDeleteStickyNote}
                        onDuplicate={onDuplicateStickyNote}
                    />
                ))}

                <div className="relative z-10 flex flex-col items-center pointer-events-none" style={{ paddingTop: '60px', minWidth: '500px' }}>
                    <div
                        className="canvas-execution-card w-[360px] bg-black border border-white/15 p-5 rounded-2xl select-text cursor-auto relative z-10 pointer-events-auto"
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            setIsExecutionConfigOpen(true);
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                aria-label="Configure On Execution"
                                title="Configure On Execution"
                                onClick={() => setIsExecutionConfigOpen(true)}
                                className="flex items-center gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg pr-2 transition-all"
                            >
                                <TablerIcon name="bolt" className="text-white/40 text-base" />
                                <h3 className="text-white/60 font-bold tracking-widest text-xs">On Execution</h3>
                            </button>
                            <button
                                type="button"
                                onClick={() => onOpenCabinet('mode')}
                                className="group rounded-lg bg-transparent p-2 text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                title="Open Task Settings"
                                aria-label="Open Task Settings"
                            >
                                <TablerIcon name="settings" className="text-lg transition-transform duration-200 ease-out group-hover:rotate-45" />
                            </button>
                        </div>
                        {currentTask.description && (
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{currentTask.description}</p>
                        )}
                    </div>
                    {currentTask.mode === 'scrape' && <div className="canvas-connector w-px h-10 bg-white/25" />}
                    {currentTask.mode === 'agent' && (
                        <div className="flex flex-col items-center pointer-events-auto">
                            <div className="canvas-connector w-px h-2 bg-white/25" />
                            <button
                                data-action-drop-scope="root"
                                onClick={() => openActionPalette(undefined, 0)}
                                className="relative z-20 w-8 h-8 canvas-insert-button border border-dashed rounded-lg transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2"
                                aria-label="Add action before first block (Ctrl + K)"
                                title="Add action before first block (Ctrl + K)"
                            >
                                <TablerIcon name="add" className="canvas-insert-icon text-sm transition-colors" />
                            </button>
                            <div className="canvas-connector w-px h-2 bg-white/25" />
                        </div>
                    )}
                    {currentTask.mode === 'scrape' && (
                        <div className="w-[360px] pointer-events-auto">
                            {currentTask.extractionScript !== undefined ? (
                                <ExtractionScriptBlock
                                    task={currentTask}
                                    onUpdate={(updates) => { const merged = { ...currentTask, ...updates }; setCurrentTask(merged); handleAutoSave(merged); }}
                                    onAutoSave={() => handleAutoSave()}
                                    onDelete={() => { const t = { ...currentTask, extractionScript: undefined, extractionFormat: undefined }; setCurrentTask(t); handleAutoSave(t); }}
                                    onStartInspect={onStartInspect}
                                    onStartGroupContainerInspect={onStartGroupContainerInspect}
                                    onStartGroupFieldInspect={onStartGroupFieldInspect}
                                    selectorOptionsById={selectorOptionsById}
                                />
                            ) : (
                                <button
                                    onClick={() => { const t = { ...currentTask, extractionScript: '' }; setCurrentTask(t); handleAutoSave(t); }}
                                    data-interactive-target="true"
                                    className="canvas-add-action w-full border border-dashed rounded-2xl p-5 transition-all flex items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                >
                                    <TablerIcon name="add" className="canvas-insert-icon text-lg transition-colors" />
                                    <span className="canvas-add-action-text text-xs font-bold tracking-[0.2em] transition-colors">Add Extraction Script</span>
                                </button>
                            )}
                        </div>
                    )}
                    {currentTask.mode === 'agent' && (
                        <div className="flex flex-col items-center w-full select-text cursor-auto pointer-events-auto">
                            <div className="space-y-6 w-full flex flex-col items-center relative">
                                {buildAst(0, currentTask.actions.length)}
                                <div className="pt-2 flex flex-col items-center">
                                    <div className="canvas-connector w-px h-6 bg-white/10" />
                                    <button
                                        data-action-drop-scope="root"
                                        onClick={() => openActionPalette()}
                                        className="canvas-add-action w-[360px] border border-dashed rounded-2xl p-6 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label="Add action (Ctrl + K)"
                                        title="Add action (Ctrl + K)"
                                    >
                                        <div className="canvas-add-action-icon-box w-10 h-10 rounded-xl transition-colors flex items-center justify-center">
                                            <TablerIcon name="add" className="canvas-insert-icon text-2xl transition-colors" />
                                        </div>
                                        <span className="canvas-add-action-text text-xs font-bold tracking-[0.2em] transition-colors">Add Action</span>
                                    </button>
                                </div>
                                <div className="canvas-connector w-px h-6 bg-white/25" />
                                <div className="w-[360px]">
                                    {currentTask.extractionScript !== undefined ? (
                                        <ExtractionScriptBlock
                                            task={currentTask}
                                            onUpdate={(updates) => { const merged = { ...currentTask, ...updates }; setCurrentTask(merged); handleAutoSave(merged); }}
                                            onAutoSave={() => handleAutoSave()}
                                            onDelete={() => { const t = { ...currentTask, extractionScript: undefined, extractionFormat: undefined }; setCurrentTask(t); handleAutoSave(t); }}
                                            onStartInspect={onStartInspect}
                                            onStartGroupContainerInspect={onStartGroupContainerInspect}
                                            onStartGroupFieldInspect={onStartGroupFieldInspect}
                                            selectorOptionsById={selectorOptionsById}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => { const t = { ...currentTask, extractionScript: '' }; setCurrentTask(t); handleAutoSave(t); }}
                                            data-interactive-target="true"
                                            className="canvas-add-action w-full border border-dashed rounded-2xl p-5 transition-all flex items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        >
                                            <TablerIcon name="add" className="canvas-insert-icon text-lg transition-colors" />
                                            <span className="canvas-add-action-text text-xs font-bold tracking-[0.2em] transition-colors">Add Extraction Script</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {selectionBox && (
                <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
                    <div
                        className="absolute bg-blue-500/10 border border-blue-400"
                        style={{
                            left: Math.min(selectionBox.startX, selectionBox.currentX),
                            top: Math.min(selectionBox.startY, selectionBox.currentY),
                            width: Math.abs(selectionBox.currentX - selectionBox.startX),
                            height: Math.abs(selectionBox.currentY - selectionBox.startY)
                        }}
                    />
                </div>
            )}

            {isExecutionConfigOpen && (
                <ExecutionConfigModal
                    task={currentTask}
                    onUpdate={updateExecutionConfig}
                    onClose={() => {
                        setIsExecutionConfigOpen(false);
                        handleAutoSave(currentTask);
                    }}
                />
            )}

            {canvasContextMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setCanvasContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCanvasContextMenu(null); }} />
                    <div
                        className="fixed z-50 w-[180px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-xs font-bold tracking-widest text-white/80"
                        style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
                    >
                        <button
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
                            onClick={() => {
                                onAddStickyNote(canvasContextMenu.worldX, canvasContextMenu.worldY);
                                setCanvasContextMenu(null);
                            }}
                        >
                            <TablerIcon name="sticky_note_2" className="text-[14px] text-white/50" />
                            Add sticky note
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default CanvasView;
