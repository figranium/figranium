import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import TablerIcon from '../TablerIcon';
import RichInput from '../RichInput';
import CodeEditor from '../CodeEditor';
import { Task, ExtractionField, ExtractionGroup } from '../../types';
import { generateExtractionScript } from '../../utils/extractionScriptGen';
import { taskFieldInspectId, taskGroupContainerInspectId, taskGroupFieldInspectId } from '../../utils/extractionFieldIds';
import CustomSelect from '../common/CustomSelect';
import { EXTRACTION_ATTRIBUTE_OPTIONS } from './extractionOptions';
import ConfigModalShell from './ConfigModalShell';
import ConfigVariableList from './ConfigVariableList';
import useVariableInsertion from './useVariableInsertion';

// ── Extraction Script Block (scrape mode) ────────────────────────────────────

interface ExtractionScriptBlockProps {
    task: Task;
    onUpdate: (updates: Partial<Task>) => void;
    onAutoSave: () => void;
    onDelete: () => void;
    onStartInspect?: (id: string) => void;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    selectorOptionsById?: Record<string, string[]>;
}

const ExtractionScriptBlock: React.FC<ExtractionScriptBlockProps> = ({ task, onUpdate, onAutoSave, onDelete, onStartInspect, onStartGroupContainerInspect, onStartGroupFieldInspect, selectorOptionsById }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const { canInsertVariable, captureInsertionSelection, insertVariable } = useVariableInsertion();

    const scriptPreview = (task.extractionScript || '').split('\n').find(l => l.trim()) || '';

    const extractionMode: 'visual' | 'javascript' = task.extractionMode
        || (task.extractionScript && !(task.extractionFields && task.extractionFields.length) ? 'javascript' : 'visual');
    const fields = task.extractionFields || [];
    const groups = task.extractionGroups || [];
    const setFields = (next: ExtractionField[]) => {
        onUpdate({ extractionFields: next, extractionScript: generateExtractionScript(next, groups) });
    };
    const addField = () => {
        setFields([...fields, { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' }]);
    };
    const updateField = (id: string, updates: Partial<ExtractionField>) => {
        setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    };
    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
    };
    const switchExtractionMode = (mode: 'visual' | 'javascript') => {
        onUpdate({ extractionMode: mode });
    };

    const setGroups = (next: ExtractionGroup[]) => {
        onUpdate({ extractionGroups: next, extractionScript: generateExtractionScript(fields, next) });
    };
    const addGroup = () => {
        setGroups([...groups, { id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', containerSelector: '', fields: [] }]);
    };
    const updateGroup = (id: string, updates: Partial<ExtractionGroup>) => {
        setGroups(groups.map(g => g.id === id ? { ...g, ...updates } : g));
    };
    const removeGroup = (id: string) => {
        setGroups(groups.filter(g => g.id !== id));
    };
    const addGroupField = (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        updateGroup(groupId, { fields: [...group.fields, { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' }] });
    };
    const updateGroupField = (groupId: string, fieldId: string, updates: Partial<ExtractionField>) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        updateGroup(groupId, { fields: group.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) });
    };
    const removeGroupField = (groupId: string, fieldId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        updateGroup(groupId, { fields: group.fields.filter(f => f.id !== fieldId) });
    };

    const closeConfig = useCallback(() => {
        setIsOpen(false);
        onAutoSave();
    }, [onAutoSave]);

    const modal = isOpen ? (
        <ConfigModalShell icon="data_object" title="Extraction Script" onClose={closeConfig}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)] lg:gap-8">
                <div
                    className="min-w-0 space-y-6"
                    onFocusCapture={(event) => captureInsertionSelection(event.target)}
                    onSelectCapture={(event) => captureInsertionSelection(event.target)}
                    onKeyUpCapture={(event) => captureInsertionSelection(event.target)}
                    onPointerUpCapture={(event) => captureInsertionSelection(event.target)}
                >
                    {/* Script */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-gray-600 tracking-widest pl-1">Script</label>
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                                {(['visual', 'javascript'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => switchExtractionMode(mode)}
                                        className={`px-2.5 py-0.5 rounded-md text-xs font-bold tracking-tight transition-all ${extractionMode === mode
                                            ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)]'
                                            : 'text-white/50 hover:text-white'
                                            }`}
                                    >
                                        {mode === 'visual' ? 'Visual' : 'JavaScript'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {extractionMode === 'visual' ? (
                            <div className="space-y-2">
                                {fields.length === 0 && (
                                    <div className="text-xs text-white/40 bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-4 text-center">
                                        No fields yet. Add a field, then use the target icon to pick its selector from the page.
                                    </div>
                                )}
                                {fields.map(extractionField => (
                                    <div key={extractionField.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={extractionField.name}
                                                onChange={(e) => updateField(extractionField.id, { name: e.target.value })}
                                                placeholder="fieldName"
                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                                            />
                                            <button
                                                onClick={() => removeField(extractionField.id)}
                                                className="text-white/40 hover:text-red-400 transition-colors shrink-0"
                                                title="Remove field"
                                                aria-label="Remove field"
                                            >
                                                <TablerIcon name="close" className="text-base" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-white/25">
                                                <RichInput
                                                    value={extractionField.selector}
                                                    onChange={(v) => updateField(extractionField.id, { selector: v })}
                                                    variables={task.variables}
                                                    placeholder=".price, h1.title, ..."
                                                    className="text-xs"
                                                />
                                            </div>
                                            {onStartInspect && (
                                                <button
                                                    onClick={() => { setIsOpen(false); onStartInspect(taskFieldInspectId(extractionField.id)); }}
                                                    className="text-white opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                    title="Pick Selector in Browser"
                                                    aria-label="Pick Selector in Browser"
                                                >
                                                    <TablerIcon name="my_location" className="text-lg" />
                                                </button>
                                            )}
                                        </div>
                                        {selectorOptionsById?.[taskFieldInspectId(extractionField.id)] && selectorOptionsById[taskFieldInspectId(extractionField.id)].length > 1 && (
                                            <div className="flex flex-wrap gap-1">
                                                {selectorOptionsById[taskFieldInspectId(extractionField.id)].map((opt, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => updateField(extractionField.id, { selector: opt })}
                                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${extractionField.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <CustomSelect
                                                value={extractionField.attribute}
                                                onChange={(attribute) => updateField(extractionField.id, { attribute })}
                                                options={EXTRACTION_ATTRIBUTE_OPTIONS}
                                                className="w-[170px] !min-h-8"
                                                ariaLabel={`${extractionField.name || 'Field'} attribute`}
                                            />
                                            {extractionField.attribute === 'attr' && (
                                                <input
                                                    value={extractionField.attrName || ''}
                                                    onChange={(e) => updateField(extractionField.id, { attrName: e.target.value })}
                                                    placeholder="href"
                                                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white"
                                                />
                                            )}
                                            {extractionField.attribute !== 'exists' && (
                                                <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer ml-auto">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!extractionField.multiple}
                                                        onChange={(e) => updateField(extractionField.id, { multiple: e.target.checked })}
                                                        className="accent-current"
                                                    />
                                                    Multiple (list)
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={addField}
                                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/10 text-xs font-bold tracking-tight text-white/50 hover:text-white hover:border-white/25 transition-colors"
                                >
                                    <TablerIcon name="add" className="text-base" />
                                    Add Field
                                </button>

                                <div className="pt-2 mt-2 border-t border-dashed border-white/10 space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 tracking-widest pl-1">Repeating Groups</label>
                                        <p className="text-xs text-gray-500 mt-0.5">One row per matched container — e.g. every product card on a search results page — with a column per sub-field. Produces a multi-row CSV.</p>
                                    </div>
                                    {groups.map(group => (
                                        <div key={group.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={group.name}
                                                    onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                                                    placeholder="groupName (e.g. products)"
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                                                />
                                                <button
                                                    onClick={() => removeGroup(group.id)}
                                                    className="text-white/40 hover:text-red-400 transition-colors shrink-0"
                                                    title="Remove group"
                                                    aria-label="Remove group"
                                                >
                                                    <TablerIcon name="close" className="text-base" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-white/25">
                                                    <RichInput
                                                        value={group.containerSelector}
                                                        onChange={(v) => updateGroup(group.id, { containerSelector: v })}
                                                        variables={task.variables}
                                                        placeholder="Row container, e.g. [data-component-type='s-search-result']"
                                                        className="text-xs"
                                                    />
                                                </div>
                                                {onStartGroupContainerInspect && (
                                                    <button
                                                        onClick={() => { setIsOpen(false); onStartGroupContainerInspect(group.id); }}
                                                        className="text-white opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                        title="Pick Row Container in Browser"
                                                        aria-label="Pick Row Container in Browser"
                                                    >
                                                        <TablerIcon name="my_location" className="text-lg" />
                                                    </button>
                                                )}
                                            </div>
                                            {selectorOptionsById?.[taskGroupContainerInspectId(group.id)] && selectorOptionsById[taskGroupContainerInspectId(group.id)].length > 1 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {selectorOptionsById[taskGroupContainerInspectId(group.id)].map((opt, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => updateGroup(group.id, { containerSelector: opt })}
                                                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${group.containerSelector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                        >
                                                            {opt}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="pl-3 border-l-2 border-white/10 space-y-2">
                                                {group.fields.length === 0 && (
                                                    <p className="text-xs text-gray-500">No columns yet. Add one for each piece of data to pull from every row (e.g. title, price).</p>
                                                )}
                                                {group.fields.map(field => (
                                                    <div key={field.id} className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                value={field.name}
                                                                onChange={(e) => updateGroupField(group.id, field.id, { name: e.target.value })}
                                                                placeholder="columnName"
                                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                                                            />
                                                            <button
                                                                onClick={() => removeGroupField(group.id, field.id)}
                                                                className="text-white/40 hover:text-red-400 transition-colors shrink-0"
                                                                title="Remove column"
                                                                aria-label="Remove column"
                                                            >
                                                                <TablerIcon name="close" className="text-base" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-white/25">
                                                                <RichInput
                                                                    value={field.selector}
                                                                    onChange={(v) => updateGroupField(group.id, field.id, { selector: v })}
                                                                    variables={task.variables}
                                                                    placeholder="Selector relative to row, e.g. h2 span"
                                                                    className="text-xs"
                                                                />
                                                            </div>
                                                            {onStartGroupFieldInspect && (
                                                                <button
                                                                    onClick={() => { setIsOpen(false); onStartGroupFieldInspect(group.id, field.id); }}
                                                                    className="text-white opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                    title="Pick Selector in Browser (within row)"
                                                                    aria-label="Pick Selector in Browser (within row)"
                                                                >
                                                                    <TablerIcon name="my_location" className="text-lg" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {selectorOptionsById?.[taskGroupFieldInspectId(group.id, field.id)] && selectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].length > 1 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {selectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].map((opt, i) => (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => updateGroupField(group.id, field.id, { selector: opt })}
                                                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${field.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <CustomSelect
                                                                value={field.attribute}
                                                                onChange={(attribute) => updateGroupField(group.id, field.id, { attribute })}
                                                                options={EXTRACTION_ATTRIBUTE_OPTIONS}
                                                                className="w-[170px] !min-h-8"
                                                                ariaLabel={`${field.name || 'Group field'} attribute`}
                                                            />
                                                            {field.attribute === 'attr' && (
                                                                <input
                                                                    value={field.attrName || ''}
                                                                    onChange={(e) => updateGroupField(group.id, field.id, { attrName: e.target.value })}
                                                                    placeholder="href"
                                                                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addGroupField(group.id)}
                                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-white/10 text-xs font-bold tracking-tight text-white/50 hover:text-white hover:border-white/25 transition-colors"
                                                >
                                                    <TablerIcon name="add" className="text-sm" />
                                                    Add Column
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={addGroup}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/10 text-xs font-bold tracking-tight text-white/50 hover:text-white hover:border-white/25 transition-colors"
                                    >
                                        <TablerIcon name="add" className="text-base" />
                                        Add Group
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 focus-within:border-white/20 transition-all">
                                    <CodeEditor
                                        value={task.extractionScript || ''}
                                        onChange={v => onUpdate({ extractionScript: v })}
                                        onBlur={onAutoSave}
                                        language="javascript"
                                        className="min-h-[180px]"
                                        placeholder="// Example: return { title: document.title };"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Format */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 tracking-widest pl-1">Output Format</label>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 focus-within:border-white/20 transition-all">
                            <CustomSelect
                                value={task.extractionFormat || 'json'}
                                onChange={(extractionFormat) => onUpdate({ extractionFormat })}
                                options={[
                                    { value: 'json', label: 'JSON', icon: 'json', iconClassName: '!text-[7px] leading-none' },
                                    { value: 'csv', label: 'CSV', icon: 'csv' },
                                ]}
                                className="!min-h-0 !border-0 !bg-transparent !p-0"
                                ariaLabel="Extraction format"
                            />
                        </div>
                    </div>
                </div>
                <aside className="min-w-0" aria-label="Extraction context">
                    <ConfigVariableList variables={task.variables} canInsertVariable={canInsertVariable} onInsertVariable={insertVariable} />
                </aside>
            </div>
        </ConfigModalShell>
    ) : null;

    const contextMenuPortal = contextMenu ? createPortal(
        <div
            className="fixed inset-0 z-[200]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
            <div
                className="absolute bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px]"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => { setContextMenu(null); onDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition-colors"
                >
                    <TablerIcon name="delete" className="text-sm" />
                    Remove extraction script
                </button>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <div
                onClick={() => setIsOpen(true)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
                data-interactive-target="true"
                className="bg-black min-w-[280px] w-full max-w-sm mx-auto border border-white/20 p-5 rounded-2xl group/item relative transition-all duration-150 select-none touch-none cursor-pointer hover:border-white/40 hover:bg-white/[0.02]"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        <TablerIcon name="data_object" className="text-[12px] text-white" />
                    </div>
                    <span className="text-xs font-bold tracking-[0.2em] text-white shrink-0">Extraction Script</span>
                    {scriptPreview && (
                        <span className="text-white/40 text-xs font-mono truncate min-w-0 pointer-events-none">
                            {scriptPreview.trim()}
                        </span>
                    )}
                </div>
            </div>
            {modal}
            {contextMenuPortal}
        </>
    );
};

export default ExtractionScriptBlock;
