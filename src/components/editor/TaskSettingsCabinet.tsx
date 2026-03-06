import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { Task, VarType } from '../../types';
import CodeEditor from '../CodeEditor';

interface TaskSettingsCabinetProps {
    isOpen: boolean;
    onClose: () => void;
    currentTask: Task;
    onUpdateTask: (updates: Partial<Task>) => void;
    proxyListLoaded: boolean;
    proxyList: { id: string }[];
}

const TaskSettingsCabinet: React.FC<TaskSettingsCabinetProps> = ({
    isOpen,
    onClose,
    currentTask,
    onUpdateTask,
    proxyListLoaded,
    proxyList,
}) => {
    const [activeTab, setActiveTab] = React.useState<'mode' | 'variables' | 'behavior' | 'extraction' | 'api'>('mode');

    if (!isOpen) return null;

    const rotateProxiesDisabled = proxyListLoaded && proxyList.length === 1 && proxyList[0]?.id === 'host';

    const updateVariable = (oldName: string, name: string, type: VarType, value: any) => {
        const nextVars = { ...currentTask.variables };
        if (oldName !== name) delete nextVars[oldName];
        nextVars[name] = { type, value };
        onUpdateTask({ variables: nextVars });
    };

    const removeVariable = (name: string) => {
        const nextVars = { ...currentTask.variables };
        delete nextVars[name];
        onUpdateTask({ variables: nextVars });
    };

    const addVariable = () => {
        const name = `var_${Object.keys(currentTask.variables || {}).length + 1}`;
        updateVariable(name, name, 'string', '');
    };

    const toggleStealth = (key: keyof Task['stealth']) => {
        onUpdateTask({
            stealth: {
                ...currentTask.stealth,
                [key]: !currentTask.stealth[key]
            }
        });
    };

    const renderTabButton = (id: typeof activeTab, label: string, icon: string) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === id
                ? 'bg-white text-black shadow-lg shadow-white/10'
                : 'text-gray-500 hover:text-white hover:bg-white/5'
                }`}
        >
            <MaterialIcon name={icon} className="text-sm" />
            {label}
        </button>
    );

    return (
        <div className="fixed inset-y-0 right-0 w-[450px] z-[100] flex">
            {/* Backdrop for closing */}
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

            {/* The Cabinet */}
            <div className="relative h-full w-full bg-[#080808]/90 border-l border-white/10 backdrop-blur-2xl shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-300 ease-out p-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Task Settings</h2>
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mt-1">{currentTask.name || 'Untitled Task'}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                    >
                        <MaterialIcon name="close" />
                    </button>
                </div>

                {/* Tabs Nav */}
                <div className="flex flex-wrap gap-2 mb-8 bg-black/40 p-1 rounded-2xl border border-white/5">
                    {renderTabButton('mode', 'Mode', 'settings_input_component')}
                    {renderTabButton('variables', 'Vars', 'data_object')}
                    {renderTabButton('behavior', 'Behavior', 'psychology')}
                    {renderTabButton('extraction', 'Extract', 'terminal')}
                    {renderTabButton('api', 'API', 'api')}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                    {activeTab === 'mode' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Execution Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => onUpdateTask({ mode: 'agent' })}
                                        className={`p-4 rounded-2xl border transition-all text-left space-y-2 ${currentTask.mode === 'agent'
                                            ? 'bg-white/10 border-white/30 ring-1 ring-white/20'
                                            : 'bg-white/5 border-white/5 opacity-50 hover:opacity-100 hover:border-white/10'
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                            <MaterialIcon name="smart_toy" className="text-white/60" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white">Agent Mode</div>
                                            <div className="text-[9px] text-gray-500">Autonomous decision making</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => onUpdateTask({ mode: 'scrape' })}
                                        className={`p-4 rounded-2xl border transition-all text-left space-y-2 ${currentTask.mode === 'scrape'
                                            ? 'bg-white/10 border-white/30 ring-1 ring-white/20'
                                            : 'bg-white/5 border-white/5 opacity-50 hover:opacity-100 hover:border-white/10'
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                            <MaterialIcon name="api" className="text-white/60" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-white">Scrape Mode</div>
                                            <div className="text-[9px] text-gray-500">Fixed data extraction flow</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'variables' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Task Variables</label>
                                <button
                                    onClick={addVariable}
                                    className="px-3 py-1 rounded-lg bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-white/20 transition-all border border-white/10"
                                >
                                    + Add Var
                                </button>
                            </div>

                            <div className="space-y-3">
                                {Object.entries(currentTask.variables || {}).map(([name, def]) => (
                                    <div key={name} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                defaultValue={name}
                                                onBlur={(e) => {
                                                    if (e.target.value !== name) updateVariable(name, e.target.value, def.type, def.value);
                                                }}
                                                placeholder="Name"
                                                className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-700"
                                            />
                                            <select
                                                value={def.type}
                                                onChange={(e) => updateVariable(name, name, e.target.value as VarType, def.value)}
                                                className="bg-black/40 border border-white/5 rounded-xl px-2 py-2 text-[10px] font-bold uppercase text-gray-500"
                                            >
                                                <option value="string">String</option>
                                                <option value="number">Number</option>
                                                <option value="boolean">Bool</option>
                                            </select>
                                            <button onClick={() => removeVariable(name)} className="text-red-500/50 hover:text-red-500 p-2">
                                                <MaterialIcon name="delete" className="text-sm" />
                                            </button>
                                        </div>
                                        <div className="pl-1">
                                            {def.type === 'boolean' ? (
                                                <select
                                                    value={String(def.value)}
                                                    onChange={(e) => updateVariable(name, name, def.type, e.target.value === 'true')}
                                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white"
                                                >
                                                    <option value="true">True</option>
                                                    <option value="false">False</option>
                                                </select>
                                            ) : (
                                                <input
                                                    type={def.type === 'number' ? 'number' : 'text'}
                                                    value={def.value}
                                                    onChange={(e) => updateVariable(name, name, def.type, def.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                                    placeholder="Default Value"
                                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white"
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(currentTask.variables || {}).length === 0 && (
                                    <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl">
                                        <p className="text-[10px] text-gray-600 uppercase tracking-widest">No variables defined</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'behavior' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Runtime Flags</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {[
                                        { label: 'Stateless Execution', key: 'statelessExecution', icon: 'auto_delete' },
                                        { label: 'Disable Recording', key: 'disableRecording', icon: 'videocam_off' },
                                        { label: 'Rotate Proxies', key: 'rotateProxies', icon: 'vpn_lock', disabled: rotateProxiesDisabled },
                                        { label: 'Rotate User Agents', key: 'rotateUserAgents', icon: 'person_search' },
                                        { label: 'Rotate Viewport', key: 'rotateViewport', icon: 'screenshot_monitor' },
                                        { label: 'Include Shadow DOM', key: 'includeShadowDom', icon: 'layers' },
                                    ].map((item) => (
                                        <button
                                            key={item.key}
                                            disabled={item.disabled}
                                            onClick={() => onUpdateTask({ [item.key]: !currentTask[item.key as keyof Task] })}
                                            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${currentTask[item.key as keyof Task]
                                                ? 'bg-white/10 border-white/30 text-white'
                                                : 'bg-white/5 border-white/5 text-gray-400 opacity-60 hover:opacity-100'
                                                } ${item.disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <MaterialIcon name={item.icon} className="text-sm opacity-70" />
                                                <span className="text-xs font-medium">{item.label}</span>
                                            </div>
                                            <div className={`w-8 h-4 rounded-full relative transition-colors ${currentTask[item.key as keyof Task] ? 'bg-white' : 'bg-white/10'}`}>
                                                <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask[item.key as keyof Task] ? 'right-1 bg-black' : 'left-1 bg-white/20'}`} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Stealth & Behavior</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: 'Human Typing', key: 'naturalTyping', icon: 'keyboard' },
                                        { label: 'Cursor Glide', key: 'cursorGlide', icon: 'near_me' },
                                        { label: 'Idle Moves', key: 'idleMovements', icon: 'mouse' },
                                        { label: 'Dead Clicks', key: 'deadClicks', icon: 'ads_click' },
                                        { label: 'Fatigue Sim', key: 'fatigue', icon: 'hourglass_empty' },
                                        { label: 'Allow Typos', key: 'allowTypos', icon: 'spellcheck' },
                                        { label: 'Random Clicks', key: 'randomizeClicks', icon: 'shuffle' },
                                        { label: 'Overscroll', key: 'overscroll', icon: 'unfold_more' },
                                    ].map((item) => (
                                        <button
                                            key={item.key}
                                            onClick={() => toggleStealth(item.key as keyof Task['stealth'])}
                                            className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all text-left ${currentTask.stealth[item.key as keyof Task['stealth']]
                                                ? 'bg-white/15 border-white/40 text-white'
                                                : 'bg-white/5 border-white/5 text-gray-500 opacity-60 hover:opacity-100'
                                                }`}
                                        >
                                            <MaterialIcon name={item.icon} className="text-sm opacity-70" />
                                            <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'extraction' && (
                        <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-4 flex-1 flex flex-col">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Post-Execution Script</label>
                                    <select
                                        value={currentTask.extractionFormat || 'json'}
                                        onChange={(e) => onUpdateTask({ extractionFormat: e.target.value as any })}
                                        className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[8px] font-bold uppercase text-gray-500"
                                    >
                                        <option value="json">JSON</option>
                                        <option value="csv">CSV</option>
                                    </select>
                                </div>
                                <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl overflow-hidden min-h-[300px]">
                                    <CodeEditor
                                        language="javascript"
                                        value={currentTask.extractionScript || ''}
                                        onChange={(val) => onUpdateTask({ extractionScript: val })}
                                        placeholder="// Example: return { title: document.title };"
                                        className="h-full text-[11px]"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'api' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Trigger via API</label>
                                <div className="space-y-2">
                                    <p className="text-[10px] text-gray-500">Run this task from external tools using the endpoint below:</p>
                                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-[10px] text-white/80 break-all border-dashed">
                                        POST /api/tasks/{currentTask.id}/api
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Passing Variables</label>
                                <div className="space-y-2">
                                    <p className="text-[10px] text-gray-500">You can override task variables in the request body:</p>
                                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-[10px] text-white/60">
                                        <pre>{JSON.stringify({
                                            variables: Object.fromEntries(
                                                Object.entries(currentTask.variables || {}).slice(0, 2).map(([k, v]) => [k, v.value])
                                            )
                                        }, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TaskSettingsCabinet;
