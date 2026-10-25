import React, { useEffect, useState, useRef } from 'react';
import { Action, BlockTestResult, Task, Variable } from '../../types';
import TablerIcon from '../TablerIcon';
import { ACTION_CATALOG, getActionIconColor } from './actionCatalog';
import ActionConfigModal from './ActionConfigModal';
import { formatLabel } from '../../utils/taskUtils';

type ActionPreview = { label: string; value: string };

const firstLine = (value?: string) => (value || '').split('\n').find(Boolean)?.trim() || '';
const combine = (...values: Array<string | undefined>) => values.filter(Boolean).join(' → ');

const getActionPreview = (action: Action): ActionPreview | null => {
    const selector = action.selector || '';
    const value = action.value || '';

    switch (action.type) {
        case 'click':
            return selector ? { label: action.clickType && action.clickType !== 'single' ? `${action.clickType} click` : 'selector', value: selector } : null;
        case 'check':
        case 'uncheck':
        case 'hover':
            return selector ? { label: 'selector', value: selector } : null;
        case 'drag_and_drop': {
            const route = combine(selector, action.targetSelector);
            return route ? { label: 'move', value: route } : null;
        }
        case 'select': {
            const selection = combine(selector, value);
            return selection ? { label: 'select', value: selection } : null;
        }
        case 'type': {
            const target = selector || 'active field';
            const content = value ? `“${value}”` : '';
            const preview = content ? `${target} · ${content}` : target;
            return { label: action.typeMode === 'append' ? 'append to' : 'replace in', value: preview };
        }
        case 'navigate':
            return value ? { label: 'url', value } : null;
        case 'press':
            return action.key ? { label: 'key', value: action.key } : null;
        case 'wait':
            return value ? { label: 'pause', value: `${value}s` } : null;
        case 'wait_selector':
            return selector ? { label: value ? `within ${value}s` : 'until visible', value: selector } : null;
        case 'wait_downloads':
            return { label: 'downloads', value: value ? `up to ${value}s` : 'until complete' };
        case 'scroll':
            return { label: action.key ? `${action.key}ms` : 'scroll', value: selector || 'page' };
        case 'javascript':
            return value ? { label: 'script', value: firstLine(value) } : null;
        case 'csv':
            return value ? { label: 'csv', value: firstLine(value) } : null;
        case 'repeat':
            return value ? { label: 'repeat', value: `${value} times` } : null;
        case 'foreach': {
            const source = selector || action.varName || '';
            return source ? { label: selector ? 'for each match' : 'for each item in', value: source } : null;
        }
        case 'set': {
            const variable = action.varName || value;
            return variable ? { label: 'assign', value: variable } : null;
        }
        case 'merge': {
            const merge = combine(value, action.varName);
            return merge ? { label: 'merge into', value: merge } : null;
        }
        case 'if':
        case 'while': {
            const condition = [action.conditionVar, action.conditionOp, action.conditionValue].filter(Boolean).join(' ');
            return condition ? { label: 'condition', value: condition } : null;
        }
        case 'http_request':
            return { label: action.method || 'GET', value: value || 'request URL' };
        case 'get_content': {
            const extraction = combine(selector || 'page', action.varName);
            return extraction ? { label: 'extract', value: extraction } : null;
        }
        case 'start':
            return value ? { label: 'task', value } : null;
        case 'screenshot':
            return value ? { label: 'label', value } : null;
        case 'stop':
            return { label: 'outcome', value: value || 'success' };
        case 'upload':
            return { label: 'upload to', value: selector || 'page upload field' };
        case 'solve_captcha':
        case 'wait_captcha':
            return { label: 'captcha', value: action.captchaType || 'auto-detect' };
        default:
            return null;
    }
};

const renderBlockMarker = (type: Action['type']) => {
    const iconClass = "text-[12px] !text-[color:var(--action-icon-color)]";
    if (type === 'if' || type === 'else') return <TablerIcon name="call_split" className={`${iconClass} text-white`} />;
    if (type === 'end') return <TablerIcon name="subdirectory_arrow_right" className={`${iconClass} text-gray-500`} />;
    if (type === 'while' || type === 'repeat') return <TablerIcon name="repeat" className={`${iconClass} text-white`} />;
    if (type === 'foreach') return <TablerIcon name="list" className={`${iconClass} text-white`} />;
    if (type === 'on_error') return <TablerIcon name="warning" className={`${iconClass} text-red-400`} />;
    if (type === 'set') return <TablerIcon name="variable_insert" className={`${iconClass} text-white`} />;
    if (type === 'stop') return <TablerIcon name="stop" className={`${iconClass} text-white`} />;
    if (type === 'click') return <TablerIcon name="ads_click" className={`${iconClass} text-white`} />;
    if (type === 'check') return <TablerIcon name="check_box" className={`${iconClass} text-white`} />;
    if (type === 'uncheck') return <TablerIcon name="check_box_outline_blank" className={`${iconClass} text-white`} />;
    if (type === 'drag_and_drop') return <TablerIcon name="drag_indicator" className={`${iconClass} text-white`} />;
    if (type === 'reload') return <TablerIcon name="refresh" className={`${iconClass} text-white`} />;
    if (type === 'select') return <TablerIcon name="arrow_drop_down_circle" className={`${iconClass} text-white`} />;
    if (type === 'type') return <TablerIcon name="text_format" className={`${iconClass} text-white`} />;
    if (type === 'hover') return <TablerIcon name="my_location" className={`${iconClass} text-white`} />;
    if (type === 'press') return <TablerIcon name="keyboard" className={`${iconClass} text-white`} />;
    if (type === 'wait') return <TablerIcon name="schedule" className={`${iconClass} text-white`} />;
    if (type === 'wait_selector') return <TablerIcon name="schedule" className={`${iconClass} text-white`} />;
    if (type === 'scroll') return <TablerIcon name="swap_vert" className={`${iconClass} text-white`} />;
    if (type === 'javascript') return <TablerIcon name="javascript" className={`${iconClass} text-white`} />;
    if (type === 'csv') return <TablerIcon name="csv" className={`${iconClass} text-white`} />;
    if (type === 'upload') return <TablerIcon name="upload_file" className={`${iconClass} text-white`} />;
    if (type === 'finalize_uploads') return <TablerIcon name="task_alt" className={`${iconClass} text-white`} />;
    if (type === 'merge') return <TablerIcon name="layers" className={`${iconClass} text-white`} />;
    if (type === 'screenshot') return <TablerIcon name="photo_camera" className={`${iconClass} text-white`} />;
    if (type === 'start') return <TablerIcon name="play_circle" className={`${iconClass} text-white`} />;
    if (type === 'navigate') return <TablerIcon name="navigation" className={`${iconClass} text-white`} />;
    if (type === 'http_request') return <TablerIcon name="language" className={`${iconClass} text-white`} />;
    if (type === 'wait_downloads') return <TablerIcon name="download" className={`${iconClass} text-white`} />;
    if (type === 'get_content') return <TablerIcon name="article" className={`${iconClass} text-white`} />;
    if (type === 'solve_captcha') return <TablerIcon name="verified_user" className={`${iconClass} text-white`} />;
    if (type === 'wait_captcha') return <TablerIcon name="hourglass_top" className={`${iconClass} text-white`} />;
    if (type === 'do_nothing') return <TablerIcon name="block" className={`${iconClass} text-white/50`} />;
    return <span className="text-xs text-white/20">|</span>;
};

// Block types that have no config and shouldn't open a modal
const NO_CONFIG_TYPES: Action['type'][] = ['else', 'end', 'on_error', 'do_nothing', 'reload', 'finalize_uploads'];

interface ActionItemProps {
    action: Action;
    task: Task;
    index: number;
    status: 'running' | 'success' | 'error' | 'skipped' | undefined;
    isDragging: boolean;
    isDragOver: boolean;
    translateY: number;
    variables: Record<string, Variable>;
    availableTasks: Task[];
    onUpdate: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    onAutoSave: () => void;
    onOpenPalette: (id?: string) => void;
    onOpenContextMenu: (e: React.MouseEvent, id: string) => void;
    onPointerDown: (e: React.PointerEvent, id: string, index: number) => void;
    dragTransformY?: number;
    onStartInspect?: (id: string, field?: 'selector' | 'targetSelector') => void;
    onCreateVariable?: (name: string) => void;
    onDeleteVariable?: (name: string) => void;
    isSelected?: boolean;
    selectorOptions?: string[];
    autoOpenConfig?: boolean;
    onCloseConfigModal?: () => void;
    testResult?: BlockTestResult;
    onTestResult: (result: BlockTestResult) => void;
}

const ActionItem: React.FC<ActionItemProps> = React.memo(({
    action,
    task,
    index,
    status,
    isDragging,
    isDragOver,
    translateY,
    variables,
    availableTasks,
    onUpdate,
    onAutoSave,
    onOpenPalette,
    onOpenContextMenu,
    onPointerDown,
    dragTransformY,
    onStartInspect,
    onCreateVariable,
    onDeleteVariable,
    isSelected,
    selectorOptions,
    autoOpenConfig,
    onCloseConfigModal,
    testResult,
    onTestResult,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
    const paletteOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const statusClass = status === 'running'
        ? 'border-yellow-400/60'
        : status === 'success'
            ? 'border-green-400/60'
            : status === 'error'
                ? 'border-red-400/70'
                : status === 'skipped'
                    ? 'border-gray-500/40'
                    : '';

    const isInteractiveTarget = (target: EventTarget | null) => {
        if (!target || !(target instanceof HTMLElement)) return false;
        return !!target.closest('input, textarea, select, button, a, [contenteditable="true"], [data-no-drag="true"], [role="button"]');
    };

    const transformStyle = isDragging
        ? `translateY(${dragTransformY || 0}px)`
        : translateY
            ? `translateY(${translateY}px)`
            : undefined;

    const preview = getActionPreview(action);
    const hasConfig = !NO_CONFIG_TYPES.includes(action.type);

    useEffect(() => {
        if (autoOpenConfig && hasConfig) {
            setIsModalOpen(true);
        }
    }, [autoOpenConfig, hasConfig]);

    useEffect(() => {
        return () => {
            if (paletteOpenTimer.current) {
                clearTimeout(paletteOpenTimer.current);
                paletteOpenTimer.current = null;
            }
        };
    }, []);

    const openActionPaletteWithDelay = () => {
        if (paletteOpenTimer.current) {
            clearTimeout(paletteOpenTimer.current);
            paletteOpenTimer.current = null;
            if (hasConfig) {
                setIsModalOpen(true);
            }
            return;
        }

        paletteOpenTimer.current = setTimeout(() => {
            paletteOpenTimer.current = null;
            onOpenPalette(action.id);
        }, 180);
    };

    return (
        <>
            <div
                id={`action-${action.id}`}
                data-action-id={action.id}
                onPointerDown={(e) => {
                    if (isInteractiveTarget(e.target)) return;
                    if (e.button !== 0) return;
                    pointerDownPos.current = { x: e.clientX, y: e.clientY };
                    e.stopPropagation();
                    onPointerDown(e, action.id, index);
                }}
                onDoubleClick={(e) => {
                    if (!hasConfig) return;
                    if (isInteractiveTarget(e.target)) return;
                    e.stopPropagation();
                    setIsModalOpen(true);
                }}
                onContextMenu={(e) => onOpenContextMenu(e, action.id)}
                className={`bg-black min-w-[280px] w-full max-w-sm mx-auto border p-5 rounded-2xl group/item relative transition-[transform,box-shadow,opacity,filter,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform select-none touch-none ${statusClass || (isSelected ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-white/20')} ${isDragging ? 'ring-2 ring-white/40 scale-[1.02] shadow-[0_30px_80px_rgba(0,0,0,0.45)] opacity-85 z-20 mx-auto' : ''} ${isDragOver && !isDragging ? 'ring-2 ring-blue-400/60 bg-blue-500/5' : ''} ${action.disabled ? 'opacity-40 grayscale' : ''}`}
                style={{ transform: transformStyle }}
            >
                <div className="flex items-center gap-3 min-w-0">
                        <div className="text-xs font-bold text-white/20 tracking-tighter shrink-0">{(index + 1).toString().padStart(2, '0')}</div>
                        <div
                            className="w-4 h-4 flex items-center justify-center shrink-0"
                            style={{ '--action-icon-color': getActionIconColor(action.type) } as React.CSSProperties}
                        >
                            {renderBlockMarker(action.type)}
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openActionPaletteWithDelay();
                            }}
                            onDoubleClick={(e) => {
                                if (!hasConfig) return;
                                if (isInteractiveTarget(e.target)) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setIsModalOpen(true);
                            }}
                            className="action-type-select text-xs font-bold text-white focus:outline-none cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-white/50 shrink-0"
                            aria-label={`Change action type: ${action.type}`}
                        >
                            {ACTION_CATALOG.find((item) => item.type === action.type)?.label || formatLabel(action.type)}
                        </button>
                    {preview && (
                        <span className="min-w-0 truncate text-xs font-mono text-white/45 pointer-events-none">
                            {preview.value}
                        </span>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <ActionConfigModal
                    action={action}
                    task={task}
                    variables={variables}
                    availableTasks={availableTasks}
                    selectorOptions={selectorOptions}
                    onUpdate={onUpdate}
                    onAutoSave={onAutoSave}
                    onClose={() => {
                        setIsModalOpen(false);
                        onCloseConfigModal?.();
                    }}
                    onStartInspect={onStartInspect}
                    onCreateVariable={onCreateVariable}
                    onDeleteVariable={onDeleteVariable}
                    testResult={testResult}
                    onTestResult={onTestResult}
                />
            )}
        </>
    );
});

export default ActionItem;
