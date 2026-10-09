import React from 'react';
import TablerIcon from '../TablerIcon';
import { Task, ExtractionField, ExtractionGroup } from '../../types';
import CodeEditor from '../CodeEditor';
import RichInput from '../RichInput';
import { generateExtractionScript } from '../../utils/extractionScriptGen';
import { taskFieldInspectId, taskGroupContainerInspectId, taskGroupFieldInspectId } from '../../utils/extractionFieldIds';
import CustomSelect from '../common/CustomSelect';
import { EXTRACTION_ATTRIBUTE_OPTIONS } from './extractionOptions';

interface ExtractionTabProps {
    currentTask: Task;
    onUpdateTask: (updates: Partial<Task>) => void;
    onStartFieldInspect?: (fieldId: string) => void;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    fieldSelectorOptionsById?: Record<string, string[]>;
}

const ExtractionTab: React.FC<ExtractionTabProps> = ({ currentTask, onUpdateTask, onStartFieldInspect, onStartGroupContainerInspect, onStartGroupFieldInspect, fieldSelectorOptionsById }) => {
                            const extractionMode: 'visual' | 'javascript' = currentTask.extractionMode
                                || (currentTask.extractionScript && !(currentTask.extractionFields && currentTask.extractionFields.length) ? 'javascript' : 'visual');
                            const fields = currentTask.extractionFields || [];
                            const groups = currentTask.extractionGroups || [];

                            const setFields = (next: ExtractionField[]) => {
                                onUpdateTask({ extractionFields: next, extractionScript: generateExtractionScript(next, groups) });
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
                            const switchMode = (mode: 'visual' | 'javascript') => {
                                onUpdateTask({ extractionMode: mode });
                            };

                            const setGroups = (next: ExtractionGroup[]) => {
                                onUpdateTask({ extractionGroups: next, extractionScript: generateExtractionScript(fields, next) });
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

                            return (
                                <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1 bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-lg p-1">
                                                {(['visual', 'javascript'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        onClick={() => switchMode(mode)}
                                                        className={`px-3 py-1 rounded-md text-xs font-bold tracking-tight transition-all ${extractionMode === mode
                                                            ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] shadow-sm'
                                                            : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                                                            }`}
                                                    >
                                                        {mode === 'visual' ? 'Visual' : 'JavaScript'}
                                                    </button>
                                                ))}
                                            </div>
                                            <CustomSelect
                                                value={currentTask.extractionFormat || 'json'}
                                                onChange={(extractionFormat) => onUpdateTask({ extractionFormat })}
                                                options={[
                                                    { value: 'json', label: 'JSON', icon: 'json', iconClassName: '!text-[7px] leading-none' },
                                                    { value: 'csv', label: 'CSV', icon: 'csv' },
                                                ]}
                                                className="w-[110px] !min-h-8"
                                                ariaLabel="Extraction format"
                                            />
                                        </div>

                                        {extractionMode === 'visual' ? (
                                            <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0">
                                                {fields.length === 0 && (
                                                    <div className="text-xs text-[var(--app-text-muted)] bg-[var(--app-surface-3)] border border-dashed border-[var(--app-border)] rounded-2xl p-6 text-center">
                                                        No fields yet. Add a field, then use the target icon to pick its selector from the page.
                                                    </div>
                                                )}
                                                {fields.map(field => (
                                                    <div key={field.id} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-3 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                value={field.name}
                                                                onChange={(e) => updateField(field.id, { name: e.target.value })}
                                                                placeholder="fieldName"
                                                                className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                            />
                                                            <button
                                                                onClick={() => removeField(field.id)}
                                                                className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors shrink-0"
                                                                title="Remove field"
                                                                aria-label="Remove field"
                                                            >
                                                                <TablerIcon name="close" className="text-base" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--app-border-strong)]">
                                                                <RichInput
                                                                    value={field.selector}
                                                                    onChange={(v) => updateField(field.id, { selector: v })}
                                                                    variables={currentTask.variables}
                                                                    placeholder=".price, h1.title, ..."
                                                                    className="text-xs"
                                                                />
                                                            </div>
                                                            {onStartFieldInspect && (
                                                                <button
                                                                    onClick={() => onStartFieldInspect(field.id)}
                                                                    className="text-[var(--app-text)] opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                    title="Pick Selector in Browser"
                                                                    aria-label="Pick Selector in Browser"
                                                                >
                                                                    <TablerIcon name="color-picker" className="text-lg" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {fieldSelectorOptionsById?.[taskFieldInspectId(field.id)] && fieldSelectorOptionsById[taskFieldInspectId(field.id)].length > 1 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {fieldSelectorOptionsById[taskFieldInspectId(field.id)].map((opt, i) => (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => updateField(field.id, { selector: opt })}
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
                                                                onChange={(attribute) => updateField(field.id, { attribute })}
                                                                options={EXTRACTION_ATTRIBUTE_OPTIONS}
                                                                className="w-[170px] !min-h-8"
                                                                ariaLabel={`${field.name || 'Field'} attribute`}
                                                            />
                                                            {field.attribute === 'attr' && (
                                                                <input
                                                                    value={field.attrName || ''}
                                                                    onChange={(e) => updateField(field.id, { attrName: e.target.value })}
                                                                    placeholder="href"
                                                                    className="w-24 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs font-mono text-[var(--app-text)]"
                                                                />
                                                            )}
                                                            {field.attribute !== 'exists' && (
                                                                <label className="flex items-center gap-1.5 text-xs text-[var(--app-text-muted)] cursor-pointer ml-auto">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!field.multiple}
                                                                        onChange={(e) => updateField(field.id, { multiple: e.target.checked })}
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
                                                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[var(--app-border)] text-xs font-bold tracking-tight text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] transition-colors"
                                                >
                                                    <TablerIcon name="add" className="text-base" />
                                                    Add Field
                                                </button>

                                                <div className="pt-2 mt-2 border-t border-dashed border-[var(--app-border)] space-y-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Repeating Groups</label>
                                                        <p className="text-xs text-[var(--app-text-faint)] mt-0.5">One row per matched container — e.g. every product card on a search results page — with a column per sub-field. Produces a multi-row CSV.</p>
                                                    </div>
                                                    {groups.map(group => (
                                                        <div key={group.id} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-3 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    value={group.name}
                                                                    onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                                                                    placeholder="groupName (e.g. products)"
                                                                    className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                                />
                                                                <button
                                                                    onClick={() => removeGroup(group.id)}
                                                                    className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors shrink-0"
                                                                    title="Remove group"
                                                                    aria-label="Remove group"
                                                                >
                                                                    <TablerIcon name="close" className="text-base" />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--app-border-strong)]">
                                                                    <RichInput
                                                                        value={group.containerSelector}
                                                                        onChange={(v) => updateGroup(group.id, { containerSelector: v })}
                                                                        variables={currentTask.variables}
                                                                        placeholder="Row container, e.g. [data-component-type='s-search-result']"
                                                                        className="text-xs"
                                                                    />
                                                                </div>
                                                                {onStartGroupContainerInspect && (
                                                                    <button
                                                                        onClick={() => onStartGroupContainerInspect(group.id)}
                                                                        className="text-[var(--app-text)] opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                        title="Pick Row Container in Browser"
                                                                        aria-label="Pick Row Container in Browser"
                                                                    >
                                                                        <TablerIcon name="color-picker" className="text-lg" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {fieldSelectorOptionsById?.[taskGroupContainerInspectId(group.id)] && fieldSelectorOptionsById[taskGroupContainerInspectId(group.id)].length > 1 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {fieldSelectorOptionsById[taskGroupContainerInspectId(group.id)].map((opt, i) => (
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

                                                            <div className="pl-3 border-l-2 border-[var(--app-border)] space-y-2">
                                                                {group.fields.length === 0 && (
                                                                    <p className="text-xs text-[var(--app-text-faint)]">No columns yet. Add one for each piece of data to pull from every row (e.g. title, price).</p>
                                                                )}
                                                                {group.fields.map(field => (
                                                                    <div key={field.id} className="space-y-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <input
                                                                                value={field.name}
                                                                                onChange={(e) => updateGroupField(group.id, field.id, { name: e.target.value })}
                                                                                placeholder="columnName"
                                                                                className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                                            />
                                                                            <button
                                                                                onClick={() => removeGroupField(group.id, field.id)}
                                                                                className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors shrink-0"
                                                                                title="Remove column"
                                                                                aria-label="Remove column"
                                                                            >
                                                                                <TablerIcon name="close" className="text-base" />
                                                                            </button>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--app-border-strong)]">
                                                                                <RichInput
                                                                                    value={field.selector}
                                                                                    onChange={(v) => updateGroupField(group.id, field.id, { selector: v })}
                                                                                    variables={currentTask.variables}
                                                                                    placeholder="Selector relative to row, e.g. h2 span"
                                                                                    className="text-xs"
                                                                                />
                                                                            </div>
                                                                            {onStartGroupFieldInspect && (
                                                                                <button
                                                                                    onClick={() => onStartGroupFieldInspect(group.id, field.id)}
                                                                                    className="text-[var(--app-text)] opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                                    title="Pick Selector in Browser (within row)"
                                                                                    aria-label="Pick Selector in Browser (within row)"
                                                                                >
                                                                                    <TablerIcon name="color-picker" className="text-lg" />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        {fieldSelectorOptionsById?.[taskGroupFieldInspectId(group.id, field.id)] && fieldSelectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].length > 1 && (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {fieldSelectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].map((opt, i) => (
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
                                                                                    className="w-24 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs font-mono text-[var(--app-text)]"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                <button
                                                                    onClick={() => addGroupField(group.id)}
                                                                    className="flex items-center justify-center gap-1.5 py-1.5 w-full rounded-lg border border-dashed border-[var(--app-border)] text-xs font-bold tracking-tight text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] transition-colors"
                                                                >
                                                                    <TablerIcon name="add" className="text-sm" />
                                                                    Add Column
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button
                                                        onClick={addGroup}
                                                        className="flex items-center justify-center gap-1.5 py-2 w-full rounded-xl border border-dashed border-[var(--app-border)] text-xs font-bold tracking-tight text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] transition-colors"
                                                    >
                                                        <TablerIcon name="add" className="text-base" />
                                                        Add Group
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 bg-[var(--app-code-bg)] border border-[var(--app-border)] rounded-2xl overflow-hidden min-h-[300px]">
                                                <CodeEditor
                                                    language="javascript"
                                                    value={currentTask.extractionScript || ''}
                                                    onChange={(val) => onUpdateTask({ extractionScript: val })}
                                                    placeholder="// Example: return { title: document.title };"
                                                    className="h-full text-xs"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        
};

export default ExtractionTab;
