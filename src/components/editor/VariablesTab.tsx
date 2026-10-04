import React from 'react';
import TablerIcon from '../TablerIcon';
import { Task, VarType } from '../../types';
import CustomSelect from '../common/CustomSelect';

interface VariablesTabProps {
    currentTask: Task;
    addVariable: () => void;
    updateVariable: (oldName: string, newName: string, type: VarType, value: any) => void;
    removeVariable: (name: string) => void;
}

const VariablesTab: React.FC<VariablesTabProps> = ({ currentTask, addVariable, updateVariable, removeVariable }) => (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Task Variables</label>
                                    <button
                                        onClick={addVariable}
                                        className="px-3 py-1 rounded-lg bg-[var(--app-surface-3)] text-[var(--app-text)] text-xs font-bold tracking-wider hover:bg-[var(--app-surface-2)] transition-all border border-[var(--app-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    >
                                        + Add Var
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {Object.entries(currentTask.variables || {}).map(([name, def]) => (
                                        <div key={name} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4 space-y-3">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    defaultValue={name}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== name) updateVariable(name, e.target.value, def.type, def.value);
                                                    }}
                                                    placeholder="Name"
                                                    className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-faint)]"
                                                />
                                                <CustomSelect
                                                    value={def.type}
                                                    onChange={(type) => updateVariable(name, name, type, def.value)}
                                                    options={[
                                                        { value: 'string' as VarType, label: 'String', icon: 'text_fields' },
                                                        { value: 'number' as VarType, label: 'Number', icon: 'numbers' },
                                                        { value: 'boolean' as VarType, label: 'Bool', icon: 'toggle_on' },
                                                    ]}
                                                    className="w-[112px] !min-h-9"
                                                    ariaLabel={`${name} variable type`}
                                                />
                                                <button
                                                    onClick={() => removeVariable(name)}
                                                    className="text-red-500/70 hover:text-red-500 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
                                                    aria-label="Remove variable"
                                                    title="Remove variable"
                                                >
                                                    <TablerIcon name="delete" className="text-sm" />
                                                </button>
                                            </div>
                                            <div className="pl-1">
                                                {def.type === 'boolean' ? (
                                                    <CustomSelect
                                                        value={String(def.value)}
                                                        onChange={(value) => updateVariable(name, name, def.type, value === 'true')}
                                                        options={[
                                                            { value: 'true', label: 'True', icon: 'check_circle', iconClassName: 'text-green-400' },
                                                            { value: 'false', label: 'False', icon: 'cancel', iconClassName: 'theme-text-faint' },
                                                        ]}
                                                        ariaLabel={`${name} boolean value`}
                                                    />
                                                ) : (
                                                    <input
                                                        type={def.type === 'number' ? 'number' : 'text'}
                                                        value={def.value}
                                                        onChange={(e) => updateVariable(name, name, def.type, def.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                                        placeholder="Default Value"
                                                        className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-xs text-[var(--app-text)]"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(currentTask.variables || {}).length === 0 && (
                                        <div className="text-center py-12 border border-dashed border-[var(--app-border)] rounded-3xl">
                                            <p className="text-xs text-[var(--app-text-faint)] tracking-widest">No variables defined</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );

export default VariablesTab;
