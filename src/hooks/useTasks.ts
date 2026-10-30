import { taskFetch, deleteTaskRequest, localTaskStreamUrl } from '../platform/api';
import { isCloud } from '../platform/runtime';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task } from '../types';
import { normalizeImportedTask, buildNewTask, parseBooleanFlag, ensureActionIds, createImportedTasks } from '../utils/taskUtils';

export function useTasks(
    navigate: (path: string, options?: any) => void,
    showAlert: (msg: string, tone?: 'success' | 'error') => void,
    requestConfirm: (msg: string) => Promise<boolean>
) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoaded, setTasksLoaded] = useState(false);
    const [tasksError, setTasksError] = useState<string | null>(null);
    const [currentTask, setCurrentTask] = useState<Task | null>(null);
    const currentTaskRef = useRef<Task | null>(null);
    const latestSaveRequestRef = useRef(0);

    useEffect(() => {
        currentTaskRef.current = currentTask;
    }, [currentTask]);

    const loadTasks = useCallback(async () => {
        if (isCloud) { setTasksLoaded(false); setTasksError(null); }
        try {
            const response = await taskFetch('/api/tasks', { credentials: 'include' });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                const code = data && typeof data.error === 'string' ? data.error : 'UNKNOWN_ERROR';
                throw new Error(`Task API HTTP ${response.status} (${code})`);
            }
            if (!Array.isArray(data)) throw new Error('Unexpected Task API response format');
            const sorted = [...data].sort((a: Task, b: Task) => (b.last_opened || 0) - (a.last_opened || 0));
            setTasks(sorted);
            setTasksError(null);
            return sorted;
        } catch (error) {
            console.error('Failed to load Tasks', error);
            if (isCloud) setTasksError(error instanceof Error ? error.message : 'Unable to load Tasks');
            return [];
        } finally {
            // Never leave Cloud stuck in a spinner after a rejected request.
            setTasksLoaded(true);
        }
    }, []);
    const touchTask = useCallback(async (id: string) => {
        // Cloud has no tenant-scoped touch endpoint; never call the local one.
        if (isCloud) return;
        try {
            await taskFetch(`/api/tasks/${id}/touch`, { method: 'POST' });
            loadTasks();
        } catch (e) {
            console.error("Failed to touch task", e);
        }
    }, [loadTasks]);

    const createNewTask = useCallback((setResults: (val: any) => void, setHasUnsavedChanges: (val: boolean) => void) => {
        const newTask = buildNewTask();
        setHasUnsavedChanges(true);
        setCurrentTask(newTask);
        setResults(null);
        navigate('/tasks/new');
    }, [navigate]);

    const editTask = useCallback((task: Task, markTaskAsSaved: (task: Task | null) => void, setResults: (val: any) => void) => {
        const { statelessExecution, ...taskFields } = task as Task & { statelessExecution?: boolean };
        const migratedTask = { ...taskFields };
        if (parseBooleanFlag(statelessExecution)) migratedTask.cookieStateId = null;
        if (!migratedTask.variables || Array.isArray(migratedTask.variables)) migratedTask.variables = {};
        if (!migratedTask.stealth) {
            migratedTask.stealth = {
                allowTypos: false,
                idleMovements: false,
                overscroll: false,
                deadClicks: false,
                fatigue: false,
                naturalTyping: false,
                cursorGlide: false,
                randomizeClicks: false
            };
        }
        if (migratedTask.stealth.cursorGlide === undefined) migratedTask.stealth.cursorGlide = (migratedTask.stealth as any).humanCursor ?? false;
        delete (migratedTask.stealth as any).humanCursor;
        if (migratedTask.stealth.randomizeClicks === undefined) migratedTask.stealth.randomizeClicks = false;
        if (migratedTask.rotateProxies === undefined) migratedTask.rotateProxies = false;
        if (migratedTask.rotateViewport === undefined) migratedTask.rotateViewport = false;
        if (!migratedTask.extractionFormat) migratedTask.extractionFormat = 'json';
        if (migratedTask.includeHtml === undefined) migratedTask.includeHtml = false;
        if (migratedTask.includeShadowDom === undefined) migratedTask.includeShadowDom = true;
        if (migratedTask.disableRecording === undefined) migratedTask.disableRecording = false;
        migratedTask.disableRecording = parseBooleanFlag(migratedTask.disableRecording);
        const normalized = ensureActionIds(migratedTask);
        setCurrentTask(normalized);
        markTaskAsSaved(normalized);
        setResults(null);
        navigate(`/tasks/${task.id}`);
        if (task.id) touchTask(task.id);
    }, [navigate, touchTask]);

    const deleteTask = useCallback(async (id: string, currentPath: string) => {
        if (!await requestConfirm('Are you sure you want to delete this task?')) return;
        try {
            await deleteTaskRequest(id);
        } catch (error) {
            showAlert(error instanceof Error ? error.message : 'Failed to delete task.', 'error');
            return;
        }
        await loadTasks();
        if (currentPath.includes(id)) {
            navigate('/dashboard');
        }
    }, [requestConfirm, loadTasks, navigate, showAlert]);

    const saveTask = useCallback(async (markTaskAsSaved: (task: Task | null) => void, currentPath: string, taskOverride?: Task, createVersion: boolean = false) => {
        const taskToUpdate = taskOverride || currentTaskRef.current;
        if (!taskToUpdate) return;
        const requestId = ++latestSaveRequestRef.current;
        const taskToSave = { ...taskToUpdate, last_opened: Date.now() };
        const params = new URLSearchParams();
        params.set(currentPath.includes('new') ? 'create' : 'update', 'true');
        if (createVersion) params.set('version', 'true');
        const res = await taskFetch(`/api/tasks?${params.toString()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskToSave)
        });
        const saved = await res.json();
        if (!res.ok) {
            if (res.status === 404 && saved?.error === 'TASK_NOT_FOUND') {
                currentTaskRef.current = null;
                setCurrentTask(null);
                setTasks((previous) => previous.filter((task) => task.id !== taskToSave.id));
                navigate('/dashboard', { replace: true });
                return;
            }
            throw new Error(saved?.error || 'Failed to save task');
        }

        // Autosaves can overlap. Never let an older response replace newer editor state.
        if (requestId !== latestSaveRequestRef.current) return;

        currentTaskRef.current = saved;
        setCurrentTask(saved);
        markTaskAsSaved(saved);
        loadTasks();
        if (currentPath.includes('new')) {
            navigate(`/tasks/${saved.id}`, { replace: true });
        }
    }, [navigate, loadTasks]);

    const exportTasks = useCallback((taskIds?: string[]) => {
        let tasksToExport = tasks;
        if (taskIds && taskIds.length > 0) {
            tasksToExport = tasks.filter(t => t.id && taskIds.includes(t.id));
        }

        if (tasksToExport.length === 0) {
            showAlert('No tasks selected to export.', 'error');
            return;
        }

        const payload = {
            exportedAt: new Date().toISOString(),
            tasks: tasksToExport
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `figranium-tasks-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showAlert(`Exported ${tasksToExport.length} task(s).`, 'success');
    }, [tasks, showAlert]);

    const importTasks = useCallback(async (file: File) => {
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            let list: any[] = [];
            if (Array.isArray(parsed)) {
                list = parsed;
            } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.tasks)) {
                    list = parsed.tasks;
                } else if (parsed.name || parsed.actions) {
                    // Looks like a single task object
                    list = [parsed];
                }
            }

            if (list.length === 0) {
                showAlert('Invalid import file.', 'error');
                return;
            }

            const stamp = Date.now();
            const prepared = list
                .map((raw, index) => normalizeImportedTask(raw, index))
                .filter((task): task is Task => !!task)
                .map((task, index) => (task.id ? task : { ...task, id: `task_${stamp}_${index}` }));

            if (prepared.length === 0) {
                showAlert('No tasks to import.', 'error');
                return;
            }

            const result = await createImportedTasks(prepared, (task) => (
                taskFetch('/api/tasks?create=true', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(task)
                })
            ));
            // Some requests may succeed even if others fail. Refresh the list
            // before reporting the actual result, never a false full success.
            await loadTasks();
            if (result.failed > 0) {
                const detail = result.firstError ? ` (${result.firstError})` : '';
                if (result.imported === 0) {
                    showAlert(`Import failed: ${result.failed} task(s) rejected${detail}.`, 'error');
                } else {
                    showAlert(`Imported ${result.imported} of ${prepared.length} task(s); ${result.failed} failed${detail}.`, 'error');
                }
                return;
            }
            showAlert(`Imported ${result.imported} task(s).`, 'success');
        } catch (e: any) {
            showAlert(`Import failed: ${e.message || 'Unknown error'}`, 'error');
        }
    }, [showAlert, loadTasks]);

    const importTemplate = useCallback(async (configuration: unknown) => {
        const normalized = normalizeImportedTask(configuration, 0);
        if (!normalized) throw new Error('Invalid template configuration');

        // A marketplace preset is always imported as an independent local copy.
        const taskToCreate: Task = {
            ...normalized,
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        };
        const response = await taskFetch('/api/tasks?create=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskToCreate)
        });
        const saved = await response.json();
        if (!response.ok) throw new Error(saved?.error || 'Failed to import template');
        setTasks((previous) => [saved, ...previous.filter((task) => task.id !== saved.id)]);
        return saved as Task;
    }, []);

    useEffect(() => {
        // Cloud must wait for a verified Neon Auth session before fetching.
        // App triggers loadTasks when authStatus becomes authenticated.
        if (!isCloud) void loadTasks();
    }, [loadTasks]);

    useEffect(() => {
        const taskId = currentTask?.id;
        const streamUrl = localTaskStreamUrl(taskId);
        if (!taskId || !streamUrl) return;
        const source = new EventSource(streamUrl, { withCredentials: true });
        source.onmessage = (event) => {
            if (!event.data) return;
            try {
                const payload = JSON.parse(event.data);
                if (payload?.type === 'deleted' && payload.taskId === taskId) {
                    source.close();
                    currentTaskRef.current = null;
                    setCurrentTask(null);
                    setTasks((previous) => previous.filter((task) => task.id !== taskId));
                    navigate('/dashboard', { replace: true });
                    return;
                }
                const remoteTask = payload?.task;
                if (!remoteTask || remoteTask.id !== taskId) return;
                const normalized = ensureActionIds(remoteTask);
                currentTaskRef.current = normalized;
                setCurrentTask(normalized);
                setTasks((previous) => previous.map((task) => task.id === taskId ? normalized : task));
            } catch (error) {
                console.error('Failed to apply live task update', error);
            }
        };
        return () => source.close();
    }, [currentTask?.id, navigate]);

    return {
        tasks,
        tasksLoaded,
        tasksError,
        setTasks,
        currentTask,
        setCurrentTask,
        loadTasks,
        touchTask,
        createNewTask,
        editTask,
        deleteTask,
        saveTask,
        exportTasks,
        importTasks,
        importTemplate
    };
}
