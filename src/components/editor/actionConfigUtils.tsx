import React from 'react';
import { Action, VarType, BlockTestResult, Task, Variable } from '../../types';

const PRESS_MODIFIERS = [
    { value: 'Control', label: 'Ctrl' },
    { value: 'Shift', label: 'Shift' },
    { value: 'Alt', label: 'Alt' },
    { value: 'Meta', label: 'Meta' }
];

const PRESS_BASE_KEYS = [
    'Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5'
]
    .concat([...Array(10)].map((_, i) => `${i}`))
    .concat(Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)));

const TYPE_MODE_OPTIONS = [
    { value: 'replace', label: 'Replace Text' },
    { value: 'append', label: 'Append Text' }
] as const;

const CLICK_TYPE_OPTIONS = [
    { value: 'single', label: 'Single Click' },
    { value: 'double', label: 'Double Click' },
    { value: 'right', label: 'Right Click' }
] as const;

const parsePressKey = (key?: string) => {
    if (!key) return { modifiers: [] as string[], baseKey: '' };
    const parts = key.split('+');
    const baseKey = parts.pop() || '';
    return { modifiers: parts, baseKey };
};

const buildPressKey = (modifiers: string[], baseKey: string) => {
    const filtered = modifiers.filter(Boolean);
    return [...filtered, baseKey].filter(Boolean).join('+');
};

const normalizeVarName = (raw: string) => {
    const trimmed = (raw || '').trim();
    const match = trimmed.match(/^\{\$([\w.]+)\}$/);
    return match ? match[1] : trimmed;
};

const conditionOps: Record<VarType, { value: string; label: string }[]> = {
    string: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not equal' },
        { value: 'contains', label: 'Contains' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'matches', label: 'Matches regex' }
    ],
    number: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not equal' },
        { value: 'gt', label: 'Greater than' },
        { value: 'gte', label: 'Greater or equal' },
        { value: 'lt', label: 'Less than' },
        { value: 'lte', label: 'Less or equal' }
    ],
    boolean: [
        { value: 'is_true', label: 'Is true' },
        { value: 'is_false', label: 'Is false' }
    ],
    selector: [
        { value: 'exists', label: 'Exists' },
        { value: 'not_exists', label: 'Does not exist' }
    ]
};

const NO_CONFIG_TYPES: Action['type'][] = ['else', 'end', 'on_error', 'do_nothing', 'reload', 'finalize_uploads'];

interface ActionConfigModalProps {
    action: Action;
    task: Task;
    variables: Record<string, Variable>;
    availableTasks: Task[];
    selectorOptions?: string[];
    onUpdate: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    onAutoSave: () => void;
    onClose: () => void;
    onStartInspect?: (id: string, field?: 'selector' | 'targetSelector') => void;
    onCreateVariable?: (name: string) => void;
    onDeleteVariable?: (name: string) => void;
    testResult?: BlockTestResult;
    onTestResult: (result: BlockTestResult) => void;
}


export { PRESS_MODIFIERS, PRESS_BASE_KEYS, TYPE_MODE_OPTIONS, CLICK_TYPE_OPTIONS, parsePressKey, buildPressKey, normalizeVarName, conditionOps, NO_CONFIG_TYPES };
export type { ActionConfigModalProps };

export const field = (labelText: string, children: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1.5 self-stretch">
        <label className="text-xs font-bold text-gray-600 tracking-widest pl-1 block">{labelText}</label>
        {children}
    </div>
);

export const inputWrap = (children: React.ReactNode) => (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs focus-within:border-white/20 transition-all">
        {children}
    </div>
);
