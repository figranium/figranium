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
    taskVariables = {}
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
    };

    return (
        <div className="flex flex-col h-full flex-grow w-full bg-[var(--app-card-bg, #1e1e24)] border border-[var(--app-border, #2a2a32)] rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border, #2a2a32)] bg-[var(--app-card-header, rgba(255,255,255,0.02))]">
                <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-[var(--app-accent-subtle, rgba(255,255,255,0.05))] flex items-center justify-center text-[var(--app-accent, #fff)]">
                        <TablerIcon name="code" className="text-sm" />
                    </div>
                    <span className="text-xs font-bold tracking-wide text-white">Extraction Script</span>
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
            <div className="flex flex-col flex-grow p-4 w-full h-full min-h-[400px]">
                {localMode === 'javascript' ? (
                    <div className="flex flex-col flex-grow w-full h-full relative">
                        <textarea
                            value={script}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="return () => { return document.title; }"
                            className="w-full h-full flex-grow bg-[var(--app-input-bg, #121216)] text-white font-mono text-xs p-3 rounded-lg border border-[var(--app-border, #2a2a32)] focus:outline-none focus:border-[var(--app-accent, #fff)] resize-none"
                            spellCheck={false}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col flex-grow w-full h-full space-y-4">
                        <div className="text-xs text-[var(--app-text-muted, #aaa)]">
                            Map your extraction fields visually. The script is automatically generated and synchronized.
                        </div>
                        <div className="flex flex-col flex-grow w-full h-full overflow-y-auto space-y-2 pr-1">
                            {fields.map((field, index) => (
                                <div key={field.id || index} className="flex items-center space-x-2 bg-[var(--app-input-bg, #121216)] p-2 rounded-lg border border-[var(--app-border, #2a2a32)]">
                                    <input
                                        type="text"
                                        value={field.name}
                                        onChange={(e) => {
                                            const updated = [...fields];
                                            updated[index] = { ...field, name: e.target.value };
                                            onFieldsChange?.(updated);
                                        }}
                                        placeholder="Field name"
                                        className="bg-transparent text-xs text-white px-2 py-1 flex-1 border-r border-[var(--app-border, #2a2a32)] focus:outline-none"
                                    />
                                    <input
                                        type="text"
                                        value={field.selector}
                                        onChange={(e) => {
                                            const updated = [...fields];
                                            updated[index] = { ...field, selector: e.target.value };
                                            onFieldsChange?.(updated);
                                        }}
                                        placeholder="CSS Selector"
                                        className="bg-transparent text-xs text-[var(--app-text-muted, #ccc)] px-2 py-1 flex-2 focus:outline-none font-mono"
                                    />
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => {
                                    const newField = { id: Math.random().toString(36).substring(2, 9), name: '', selector: '', type: 'text' as const };
                                    onFieldsChange?.([...fields, newField]);
                                }}
                                className="self-start px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--app-accent-subtle, rgba(255,255,255,0.05))] text-[var(--app-accent, #fff)] hover:bg-[var(--app-accent-subtle-hover, rgba(255,255,255,0.1))] transition-colors flex items-center space-x-1"
                            >
                                <TablerIcon name="add" className="text-sm" />
                                <span>Add Field</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
