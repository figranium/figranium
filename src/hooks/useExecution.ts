import { requireLocalExecution, authorizedCloudFetch } from '../platform/api';
import { isCloud } from '../platform/runtime';
import { useState, useRef, useEffect } from 'react';
import { Task, Results } from '../types';
import { formatExecutionError, isDisplayUnavailable } from '../utils/executionUtils';
import { ensureActionIds } from '../utils/taskUtils';
import { useHeadfulStatus } from './useHeadfulStatus';

export function useExecution(showAlert: (msg: string, tone?: 'success' | 'error') => void) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [isHeadfulOpen, setIsHeadfulOpen] = useState(false);
    const [isHeadfulStarting, setIsHeadfulStarting] = useState(false);
    const [results, setResults] = useState<Results | null>(null);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const useNovnc = useHeadfulStatus();
    const executeAbortRef = useRef<AbortController | null>(null);
    const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const headfulBusyRef = useRef(false);

    // A Cloud POST acknowledges queue acceptance, not execution completion.
    // Keep the editor bound to the authenticated execution record until terminal.
    useEffect(() => {
        if (!isCloud || !activeRunId) return;
        const executionId = activeRunId;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let failures = 0;
        const poll = async () => {
            try {
                const response = await authorizedCloudFetch(`/api/v1/executions/${encodeURIComponent(executionId)}`);
                if (!response.ok) throw new Error(`Execution status HTTP ${response.status}`);
                const { execution } = await response.json();
                if (cancelled || !execution) return;
                failures = 0;
                if (execution.phase === 'finished') {
                    const output = execution.result || {};
                    const outcome = execution.outcome || 'error';
                    setResults({
                        url: execution.url || '',
                        finalUrl: output.final_url || output.finalUrl,
                        html: output.html,
                        data: output.data ?? output.html ?? null,
                        screenshotUrl: output.screenshot_url || output.screenshotUrl,
                        logs: output.logs || (output.error ? [String(output.error)] : []),
                        timestamp: new Date().toLocaleTimeString(),
                        outcome
                    });
                    setIsExecuting(false);
                    setActiveRunId(null);
                    setActiveTaskId(null);
                    return;
                }
                setResults(current => ({
                    ...(current || { url: execution.url || '', logs: [] }),
                    timestamp: execution.phase === 'running' ? 'Running...' : 'Queued...'
                }));
            } catch (error) {
                if (cancelled) return;
                failures++;
                if (failures >= 5) {
                    setResults(current => ({
                        url: current?.url || '',
                        logs: [],
                        timestamp: new Date().toLocaleTimeString(),
                        outcome: 'error',
                        error: { message: 'Could not retrieve Cloud execution status.' }
                    }));
                    setIsExecuting(false);
                    setActiveRunId(null);
                    setActiveTaskId(null);
                    return;
                }
            }
            if (!cancelled) timer = setTimeout(poll, 2000);
        };
        void poll();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }, [activeRunId]);

    const reportExecutionFailure = (task: Task, runId: string, endpoint: string, error: any) => {
        const rawMessage = error?.message || String(error);
        const message = formatExecutionError(rawMessage, task.mode);
        const isNetworkFailure = error instanceof TypeError && /failed to fetch|networkerror/i.test(rawMessage);
        const displayMessage = isNetworkFailure
            ? 'The browser could not reach the execution service. No HTTP response was received.'
            : message;

        setResults({
            url: task.url,
            logs: [],
            timestamp: new Date().toLocaleTimeString(),
            outcome: 'error',
            error: {
                message: displayMessage,
                endpoint,
                status: Number.isInteger(error?.status) ? error.status : undefined,
                code: typeof error?.code === 'string' ? error.code : undefined,
                runId,
            },
        });
        showAlert(`Execution failed: ${displayMessage}`, 'error');
    };

    const stopHeadful = async () => {
        requireLocalExecution();
        if (headfulBusyRef.current) return;
        headfulBusyRef.current = true;
        try {
            await fetch('/headful/stop', { method: 'POST' });
        } catch (e) {
            console.error('Failed to stop headful session', e);
        } finally {
            setIsHeadfulOpen(false);
            headfulBusyRef.current = false;
        }
    };

    const openHeadful = async (url: string, targetActionId?: string, taskSnapshot?: Task, variables?: any) => {
        requireLocalExecution();
        if (headfulBusyRef.current) return;
        if (isHeadfulOpen) {
            await stopHeadful();
            return;
        }
        headfulBusyRef.current = true;
        setIsHeadfulStarting(true);
        try {
            const res = await fetch('/headful', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, targetActionId, taskSnapshot, variables })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg = data?.details || data?.error || 'Failed to start headful session';
                showAlert(msg, 'error');
                setIsHeadfulOpen(false);
            } else {
                setIsHeadfulOpen(true);
            }
        } catch (e: any) {
            showAlert('Failed to start headful session', 'error');
            setIsHeadfulOpen(false);
        } finally {
            setIsHeadfulStarting(false);
            headfulBusyRef.current = false;
        }
    };

    const stopTask = async () => {
        if (!activeRunId || isStopping) return;
        setIsStopping(true);

        if (isCloud) {
            try {
                const response = await authorizedCloudFetch(`/api/v1/executions/${encodeURIComponent(activeRunId)}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not cancel Cloud execution.');
                setResults((current) => current ? { ...current, outcome: 'stopped', timestamp: new Date().toLocaleTimeString() } : current);
                showAlert('Cloud execution cancellation requested.', 'success');
            } catch (error: any) { showAlert(error?.message || 'Could not cancel Cloud execution.', 'error'); }
            finally { setIsExecuting(false); setIsStopping(false); setActiveRunId(null); setActiveTaskId(null); }
            return;
        }
        requireLocalExecution();

        if (activeRunId) {
            try {
                const response = await fetch('/api/executions/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ runId: activeRunId })
                });
                if (response.ok) {
                    setResults((current) => current ? {
                        ...current,
                        outcome: 'stopped',
                        timestamp: new Date().toLocaleTimeString(),
                    } : current);
                }
            } catch (e) {
                console.error('Failed to request stop', e);
            }
        }

        if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = setTimeout(() => {
            if (executeAbortRef.current) {
                executeAbortRef.current.abort();
            }
            setIsExecuting(false);
            setIsStopping(false);
            setActiveTaskId(null);
            showAlert('Execution stopped.', 'success');
        }, 3000);
    };

    const runTaskWithSnapshot = async (taskToRunRaw: Task | null, currentTask: Task | null, setCurrentTask: (t: Task) => void) => {
        if (!taskToRunRaw || !taskToRunRaw.url) return;
        if (isCloud) {
            // Cloud never sends execution payloads to self-hosted /agent or
            // /scrape endpoints. The Worker alone authorizes Task ownership,
            // workspace limits and (eventually) queued Modal execution.
            const task = taskToRunRaw;
            const runId = `run_${Date.now()}`;
            const endpoint = '/api/v1/executions';
            if (!task.id || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(task.id)) {
                reportExecutionFailure(task, runId, endpoint,
                    new Error('Save this Task before running it on Cloud.'));
                return;
            }
            if (isExecuting) return;
            setIsExecuting(true);
            let accepted = false;
            try {
                const response = await authorizedCloudFetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: task.id, source: 'editor' })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const message = data?.error === 'EXECUTION_CONTROL_PLANE_NOT_READY'
                        ? 'Cloud execution is not enabled yet. The Modal runner and usage reservation must be configured before Tasks can run.'
                        : (data?.error || `Cloud execution HTTP ${response.status}`);
                    const error = Object.assign(new Error(message), {
                        status: response.status,
                        code: data?.error
                    });
                    reportExecutionFailure(task, runId, endpoint, error);
                    return;
                }
                // Successful acceptance is an async queue acknowledgement, not
                // execution completion. Never report a finished run here.
                if (typeof data?.id !== 'string') throw new Error('Cloud did not return an execution ID.');
                accepted = true;
                setResults({ url: task.url, logs: [], timestamp: 'Queued...' });
                setActiveRunId(data.id);
                setActiveTaskId(task.id);
                showAlert('Task accepted by Cloud.', 'success');
            } catch (error) {
                reportExecutionFailure(task, runId, endpoint, error);
            } finally {
                if (!accepted) setIsExecuting(false);
            }
            return;
        }
        requireLocalExecution();
        const taskToRun = ensureActionIds(taskToRunRaw);
        if (isExecuting) return;
        if (currentTask && taskToRun !== currentTask) {
            setCurrentTask(taskToRun);
        }

        const runId = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        setActiveRunId(runId);
        setActiveTaskId(taskToRun.id ? String(taskToRun.id) : 'new');

        setIsExecuting(true);
        setIsStopping(false);
        setResults({
            url: taskToRun.url,
            logs: [],
            timestamp: 'Running...',
        });

        let payload: any = null;

        try {
            const cleanedVars: Record<string, any> = {};
            Object.entries(taskToRun.variables).forEach(([name, def]) => {
                cleanedVars[name] = def.value;
            });

            const resolveTemplate = (input: string) => {
                return input.replace(/\\{\$(\w+)\\}/g, (_match, name) => {
                    if (name === 'now') return new Date().toISOString();
                    const value = cleanedVars[name];
                    if (value === undefined || value === null || value === '') return '';
                    return String(value);
                });
            };

            const resolvedTask = {
                ...taskToRun,
                // URLs are known before the run and scrape mode needs a concrete URL.
                // Action inputs must stay templated: their values can be produced by a
                // preceding block (for example {$block.output} -> {$adjective}).
                url: resolveTemplate(taskToRun.url || ''),
                actions: taskToRun.actions
            };

            payload = {
                ...resolvedTask,
                taskVariables: cleanedVars,
                variables: cleanedVars,
                runSource: 'editor',
                taskId: taskToRun.id,
                taskName: taskToRun.name,
                taskSnapshot: taskToRun,
                runId
            };

            const executeTask = async (mode: 'scrape' | 'agent') => {
                const endpoint = `/${mode}`;
                const controller = new AbortController();
                executeAbortRef.current = controller;
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                if (!res.ok) {
                    let errorData: any = null;
                    try {
                        errorData = await res.json();
                    } catch {
                        errorData = null;
                    }
                    const error = new Error(errorData?.details || errorData?.error || "Request failed");
                    (error as any).code = errorData?.error;
                    (error as any).status = res.status;
                    (error as any).endpoint = endpoint;
                    throw error;
                }

                return res.json();
            };

            const effectiveMode = taskToRun.mode === 'headful' ? 'scrape' : taskToRun.mode;
            const data = await executeTask(effectiveMode);

            setResults({
                url: taskToRun.url,
                finalUrl: data.final_url,
                html: data.html,
                data: data.data ?? data.html ?? null,
                screenshotUrl: data.screenshot_url,
                downloads: data.downloads,
                logs: data.logs || [],
                timestamp: new Date().toLocaleTimeString(),
                outcome: data.outcome,
            });
            if (data.outcome === 'stopped') showAlert('Execution stopped.', 'success');
        } catch (e: any) {
            if (e?.name === 'AbortError') {
                setResults((current) => current ? {
                    ...current,
                    outcome: 'stopped',
                    timestamp: new Date().toLocaleTimeString(),
                } : current);
                showAlert('Execution stopped.', 'success');
                setIsExecuting(false);
                return;
            }
            if (
                taskToRun?.mode === 'headful'
                && payload
                && (e?.code === 'HEADFUL_DISPLAY_UNAVAILABLE' || isDisplayUnavailable(e?.message || String(e)))
            ) {
                try {
                    const data = await (async () => {
                        const controller = new AbortController();
                        executeAbortRef.current = controller;
                        const res = await fetch(`/scrape`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            signal: controller.signal
                        });
                        if (!res.ok) {
                            const errorData = await res.json().catch(() => ({}));
                            const error = new Error(errorData.details || errorData.error || "Request failed");
                            (error as any).code = errorData?.error;
                            (error as any).status = res.status;
                            throw error;
                        }
                        return res.json();
                    })();
                    data.logs = [`Headful display unavailable; ran headless instead.`, ...(data.logs || [])];
                    setResults({
                        url: taskToRun.url,
                        finalUrl: data.final_url,
                        html: data.html,
                        data: data.data ?? data.html ?? null,
                        screenshotUrl: data.screenshot_url,
                        downloads: data.downloads,
                        logs: data.logs || [],
                        timestamp: new Date().toLocaleTimeString(),
                        outcome: data.outcome,
                    });
                    setIsExecuting(false);
                    return;
                } catch (fallbackError: any) {
                    reportExecutionFailure(taskToRun, runId, '/scrape', fallbackError);
                    setIsExecuting(false);
                    return;
                }
            }
            const effectiveMode = taskToRun.mode === 'headful' ? 'scrape' : taskToRun.mode;
            reportExecutionFailure(taskToRun, runId, e?.endpoint || `/${effectiveMode}`, e);
            if (taskToRun?.mode === 'headful') {
                setIsExecuting(false);
            }
        } finally {
            if (stopTimeoutRef.current) {
                clearTimeout(stopTimeoutRef.current);
                stopTimeoutRef.current = null;
            }
            executeAbortRef.current = null;
            setIsExecuting(false);
            setIsStopping(false);
            setActiveTaskId(null);
        }
    };

    return {
        isExecuting,
        isStopping,
        isHeadfulOpen,
        isHeadfulStarting,
        results,
        setResults,
        activeRunId,
        activeTaskId,
        useNovnc,
        runTaskWithSnapshot,
        stopTask,
        openHeadful,
        stopHeadful
    };
}
