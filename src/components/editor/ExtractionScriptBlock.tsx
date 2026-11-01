import React, { useState, useEffect } from 'react';
import TablerIcon from '../TablerIcon';
import { generateExtractionScript } from '../../utils/extractionScriptGen';
import { ExtractionField, ExtractionGroup } from '../../types';

interface ExtractionScriptBlockProps {
    script: string;
    onChange: (script: string) => void;
    fields?: ExtractionField[];
    groups?: ExtractionGroup[];
    onFieldsChange?: (fields: ExtractionField[]) => void;
    onGroupsChange?: (groups: ExtractionGroup[]) => void;
    mode?: 'visual' | 'javascript';
    onModeChange?: (mode: 'visual' | 'javascript') => void;
    onRequestPick?: (targetId: string) => void;
    taskVariables?: Record<string, any>;
    onAutoSave?: () => void;
}

export const ExtractionScriptBlock: React.FC<ExtractionScriptBlockProps> = ({
    script,
    onChange,
    fields = [],
    groups = [],
    onFieldsChange,
    onGroupsChange,
    mode = 'visual',
    onModeChange,
    onRequestPick,
    taskVariables = {},
    onAutoSave
}) => {
    const [localMode, setLocalMode] = useState<'visual' | 'javascript'>(mode);

    useEffect(() => {
        setLocalMode(mode);
    }, [mode]);

    const handleModeSwitch = (newMode: 'visual' | 'javascript') => {
        setLocalMode(newMode);
        onModeChange?.(newMode);
        if (newMode === 'javascript' && (!script || script.trim() === '')) {
            const generated = generateExtractionScript(fields, groups);
            onChange(generated);
        }
        onAutoSave?.();
    };

    return (
        <div className="flex flex-col h-full flex-grow w-full bg-[var(--app-card-bg, #1e1e24)] border border-[var(--app-border, #2a2a32)] rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border, #2a2a32)] bg-[var(--app-card-header, rgba(255,255,255,0.02))]">
                <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-[var(--app-accent-subtle, rgba(255,255,255,0.05))] flex items-center justify-center text-[var(--app-accent, #fff)]">
                        <TablerIcon name="code" className="text-sm" />
                    </div>
                    <span className="text-xs font-bold tracking-wide text-white">Extraction Script & Fields</span>
                </div>
                
                {/* Visual / JS Toggle */}
                <div className="flex items-center bg-[var(--app-bg, #141418)] p-0.5 rounded-lg border border-[var(--app-border, #2a2a32)]">
                    <button
                        type="button"
                        onClick={() => handleModeSwitch('visual')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                            localMode === 'visual'
                                ? 'bg-[var(--app-accent, #fff)] text-[var(--app-accent-text, #000)] shadow-sm'
                                : 'text-[var(--app-text-muted, #888)] hover:text-white'
                        }`}
                    >
                        Visual
                    </button>
                    <button
                        type="button"
                        onClick={() => handleModeSwitch('javascript')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                            localMode === 'javascript'
                                ? 'bg-[var(--app-accent, #fff)] text-[var(--app-accent-text, #000)] shadow-sm'
                                : 'text-[var(--app-text-muted, #888)] hover:text-white'
                        }`}
                    >
                        JavaScript
                    </button>
                </div>
            </div>

            {/* Content Body - Expanded to fill vertical space */}
            <div className="flex flex-col flex-grow p-4 w-full h-full min-h-[420px] overflow-y-auto">
                {localMode === 'javascript' ? (
                    <div className="flex flex-col flex-grow w-full h-full relative space-y-2">
                        <div className="text-xs text-[var(--app-text-muted, #aaa)]">
                            Custom JavaScript execution script returning extracted data.
                        </div>
                        <textarea
                            value={script}
                            onChange={(e) => {
                                onChange(e.target.value);
                                onAutoSave?.();
                            }}
                            placeholder="return () => { return document.title; }"
                            className="w-full h-full flex-grow min-h-[350px] bg-[var(--app-input-bg, #121216)] text-white font-mono text-xs p-3 rounded-lg border border-[var(--app-border, #2a2a32)] focus:outline-none focus:border-[var(--app-accent, #fff)] resize-none"
                            spellCheck={false}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col flex-grow w-full h-full space-y-4">
                        <div className="text-xs text-[var(--app-text-muted, #aaa)]">
                            Map your extraction fields and groups visually. The script is automatically synchronized.
                        </div>
                        <div className="flex flex-col flex-grow w-full h-full space-y-3 pr-1">
                            {fields.map((field, index) => (
                                <div key={field.id || index} className="flex flex-col space-y-2 bg-[var(--app-input-bg, #121216)] p-3 rounded-lg border border-[var(--app-border, #2a2a32)]">
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={field.name}
                                            onChange={(e) => {
                                                const updated = [...fields];
                                                updated[index] = { ...field, name: e.target.value };
                                                onFieldsChange?.(updated);
                                                onChange(generateExtractionScript(updated, groups));
                                                onAutoSave?.();
                                            }}
                                            placeholder="Field name (e.g. title)"
                                            className="bg-[var(--app-card-bg, #1e1e24)] text-xs text-white px-3 py-1.5 flex-1 border border-[var(--app-border, #2a2a32)] rounded-md focus:outline-none focus:border-[var(--app-accent, #fff)] font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated = fields.filter((_, i) => i !== index);
                                                onFieldsChange?.(updated);
                                                onChange(generateExtractionScript(updated, groups));
                                                onAutoSave?.();
                                            }}
                                            className="text-[var(--app-text-muted, #888)] hover:text-red-400 p-1 transition-colors"
                                            title="Delete Field"
                                        >
                                            <TablerIcon name="close" className="text-sm" />
                                        </button>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={field.selector}
                                            onChange={(e) => {
                                                const updated = [...fields];
                                                updated[index] = { ...field, selector: e.target.value };
                                                onFieldsChange?.(updated);
                                                onChange(generateExtractionScript(updated, groups));
                                                onAutoSave?.();
                                            }}
                                            placeholder="CSS Selector (e.g. h1.title)"
                                            className="bg-[var(--app-card-bg, #1e1e24)] text-xs text-white px-3 py-1.5 flex-1 border border-[var(--app-border, #2a2a32)] rounded-md focus:outline-none focus:border-[var(--app-accent, #fff)] font-mono"
                                        />
                                        {onRequestPick && (
                                            <button
                                                type="button"
                                                onClick={() => onRequestPick(field.id)}
                                                className="px-2 py-1.5 bg-[var(--app-accent-subtle, rgba(255,255,255,0.05))] text-white hover:bg-[var(--app-accent-subtle-hover, rgba(255,255,255,0.1))] border border-[var(--app-border, #2a2a32)] rounded-md text-xs flex items-center space-x-1"
                                                title="Pick in browser"
                                            >
                                                <TablerIcon name="color-picker" className="text-sm" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => {
                                    const newField = { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' as const };
                                    const updated = [...fields, newField];
                                    onFieldsChange?.(updated);
                                    onChange(generateExtractionScript(updated, groups));
                                    onAutoSave?.();
                                }}
                                className="self-start px-3 py-2 text-xs font-medium rounded-lg bg-[var(--app-accent-subtle, rgba(255,255,255,0.05))] text-[var(--app-accent, #fff)] hover:bg-[var(--app-accent-subtle-hover, rgba(255,255,255,0.1))] transition-colors flex items-center space-x-1 border border-[var(--app-border, #2a2a32)]"
                            >
                                <TablerIcon name="add" className="text-sm" />
                                <span>Add Field</span>
                            </button>

                            {/* Repeating Groups Section */}
                            <div className="pt-4 mt-2 border-t border-[var(--app-border, #2a2a32)] space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xs font-bold text-white tracking-wide">Repeating Groups</h4>
                                        <p className="text-[11px] text-[var(--app-text-muted, #aaa)]">Extract table rows or list cards matching a container selector.</p>
                                    </div>
                                </div>
                                {groups.map((group, groupIndex) => (
                                    <div key={group.id || groupIndex} className="bg-[var(--app-input-bg, #121216)] p-3 rounded-lg border border-[var(--app-border, #2a2a32)] space-y-3">
                                        <div className="flex items-center space-x-2">
                                            <input
                                                type="text"
                                                value={group.name}
                                                onChange={(e) => {
                                                    const updated = [...groups];
                                                    updated[groupIndex] = { ...group, name: e.target.value };
                                                    onGroupsChange?.(updated);
                                                    onChange(generateExtractionScript(fields, updated));
                                                    onAutoSave?.();
                                                }}
                                                placeholder="Group name (e.g. products)"
                                                className="bg-[var(--app-card-bg, #1e1e24)] text-xs text-white px-3 py-1.5 flex-1 border border-[var(--app-border, #2a2a32)] rounded-md font-mono"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = groups.filter((_, i) => i !== groupIndex);
                                                    onGroupsChange?.(updated);
                                                    onChange(generateExtractionScript(fields, updated));
                                                    onAutoSave?.();
                                                }}
                                                className="text-[var(--app-text-muted, #888)] hover:text-red-400 p-1"
                                                title="Remove group"
                                            >
                                                <TablerIcon name="close" className="text-sm" />
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={group.containerSelector}
                                            onChange={(e) => {
                                                const updated = [...groups];
                                                updated[groupIndex] = { ...group, containerSelector: e.target.value };
                                                onGroupsChange?.(updated);
                                                onChange(generateExtractionScript(fields, updated));
                                                onAutoSave?.();
                                            }}
                                            placeholder="Container selector (e.g. .product-card)"
                                            className="bg-[var(--app-card-bg, #1e1e24)] text-xs text-white px-3 py-1.5 w-full border border-[var(--app-border, #2a2a32)] rounded-md font-mono"
                                        />
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newGroup = { id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', containerSelector: '', fields: [] };
                                        const updated = [...groups, newGroup];
                                        onGroupsChange?.(updated);
                                        onChange(generateExtractionScript(fields, updated));
                                        onAutoSave?.();
                                    }}
                                    className="self-start px-3 py-2 text-xs font-medium rounded-lg bg-[var(--app-accent-subtle, rgba(255,255,255,0.05))] text-[var(--app-accent, #fff)] hover:bg-[var(--app-accent-subtle-hover, rgba(255,255,255,0.1))] transition-colors flex items-center space-x-1 border border-[var(--app-border, #2a2a32)]"
                                >
                                    <TablerIcon name="add" className="text-sm" />
                                    <span>Add Group</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExtractionScriptBlock;
