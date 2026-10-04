import React from 'react';
import { Task } from '../../types';
import CopyButton from '../CopyButton';

const ApiTab: React.FC<{ currentTask: Task; onUpdateTask: (updates: Partial<Task>) => void }> = ({ currentTask, onUpdateTask }) => (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Trigger via API</label>
                                    <div className="space-y-2">
                                        <p className="text-xs text-[var(--app-text-muted)]">Send a <span className="font-mono font-bold text-[var(--app-text)]">POST</span> request from external tools to the endpoint below:</p>
                                        <div className="relative group">
                                            <div className="flex items-center gap-2 bg-[var(--app-code-bg)] border border-[var(--app-border)] rounded-xl p-4 pr-12 border-dashed">
                                                <span className="flex-shrink-0 text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-[var(--app-accent)] text-[var(--app-accent-text)]">POST</span>
                                                <span className="font-mono text-xs text-[var(--app-text-muted)] break-all">
                                                    {`${window.location.origin}/api/tasks/${currentTask.id}/api`}
                                                </span>
                                            </div>
                                            <CopyButton
                                                text={`${window.location.origin}/api/tasks/${currentTask.id}/api`}
                                                className="absolute right-2 top-2 p-2 rounded-lg bg-[var(--app-surface-3)] border border-[var(--app-border)] text-[var(--app-text)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                iconClassName="text-xs"
                                                title="Copy Endpoint"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Response Options</label>
                                    <button
                                        role="switch"
                                        aria-checked={currentTask.includeHtml}
                                        onClick={() => onUpdateTask({ includeHtml: !currentTask.includeHtml })}
                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--app-surface-3)] border border-[var(--app-border)] hover:bg-[var(--app-surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    >
                                        <div className="text-left">
                                            <span className="text-xs font-medium text-[var(--app-text)]">Include HTML in response</span>
                                            <p className="text-xs text-[var(--app-text-faint)] mt-0.5">When an extraction script is set, also return the raw HTML</p>
                                        </div>
                                        <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${currentTask.includeHtml ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}>
                                            <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask.includeHtml ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                        </div>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] tracking-[0.2em]">Passing Variables</label>
                                    <div className="space-y-2">
                                        <p className="text-xs text-[var(--app-text-muted)]">You can override task variables in the request body:</p>
                                        <div className="relative group">
                                            <div className="bg-[var(--app-code-bg)] border border-[var(--app-border)] rounded-xl p-4 pr-12 font-mono text-xs text-[var(--app-text-faint)]">
                                                <pre>{JSON.stringify({
                                                    variables: Object.fromEntries(
                                                        Object.entries(currentTask.variables || {}).slice(0, 2).map(([k, v]) => [k, v.value])
                                                    )
                                                }, null, 2)}</pre>
                                            </div>
                                            <CopyButton
                                                text={JSON.stringify({
                                                    variables: Object.fromEntries(
                                                        Object.entries(currentTask.variables || {}).slice(0, 2).map(([k, v]) => [k, v.value])
                                                    )
                                                }, null, 2)}
                                                className="absolute right-2 top-2 p-2 rounded-lg bg-[var(--app-surface-3)] border border-[var(--app-border)] text-[var(--app-text)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                iconClassName="text-xs"
                                                title="Copy Payload"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );

export default ApiTab;
