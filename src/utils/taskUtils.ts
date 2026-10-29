import { Task } from '../types';

export const serializeTaskSnapshot = (task?: Task | null) => {
    // ⚡ Bolt: Use object destructuring to exclude 'last_opened' and 'versions' BEFORE serialization.
    // This avoids O(N) overhead of stringifying potentially large version histories on every change.
    if (!task) return '';
    const { last_opened, versions, ...rest } = task;
    return JSON.stringify(rest);
};

export const parseBooleanFlag = (value: any) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return false;
    const normalized = String(value).toLowerCase();
    return normalized === 'true' || normalized === '1';
};

const DISPLAY_TERMS: Record<string, string> = {
    api: 'API',
    csv: 'CSV',
    dns: 'DNS',
    dom: 'DOM',
    html: 'HTML',
    http: 'HTTP',
    https: 'HTTPS',
    id: 'ID',
    javascript: 'JavaScript',
    json: 'JSON',
    ui: 'UI',
    url: 'URL',
};

export const formatLabel = (value: string) => value
    ? value
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b[a-z]/g, character => character.toUpperCase())
        .replace(/\b[A-Za-z]+\b/g, term => DISPLAY_TERMS[term.toLowerCase()] || term)
    : value;

export const formatExecutionSource = (source?: string | null) => {
    if (source === 'api') return 'API';
    if (source === 'scheduler') return 'Schedule';
    return formatLabel(source || 'editor');
};

export const ensureActionIds = (task: Task) => {
    if (!task.actions || !Array.isArray(task.actions)) return task;
    let changed = false;
    const nextActions = task.actions.map((action, index) => {
        if (action.id) return action;
        changed = true;
        return { ...action, id: `act_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}` };
    });
    return changed ? { ...task, actions: nextActions } : task;
};

export const makeDefaultTask = (): Task => ({
    name: "Imported Task",
    url: "",
    mode: "scrape",
    wait: 0,
    selector: "",
    rotateUserAgents: false,
    rotateProxies: false,
    rotateViewport: false,
    humanTyping: false,
    stealth: {
        allowTypos: false,
        idleMovements: false,
        overscroll: false,
        deadClicks: false,
        fatigue: false,
        naturalTyping: false,
        cursorGlide: false,
        randomizeClicks: false
    },
    actions: [],
    variables: {},
    includeShadowDom: true,
    disableRecording: false,
    translation: { enabled: false, targetLanguage: 'english' }
} as Task);

export const normalizeImportedTask = (raw: any, index: number): Task | null => {
    if (!raw || typeof raw !== 'object') return null;
    const base = makeDefaultTask();
    const { statelessExecution, ...taskFields } = raw;
    const merged: Task = { ...base, ...taskFields };
    if (!merged.name || typeof merged.name !== 'string') {
        merged.name = `Imported Task ${index + 1}`;
    }
    if (!merged.mode || !['scrape', 'agent', 'headful'].includes(merged.mode)) {
        merged.mode = 'scrape';
    }
    if (typeof merged.wait !== 'number') merged.wait = 0;
    if (!merged.stealth) merged.stealth = base.stealth;
    if (!merged.variables || Array.isArray(merged.variables)) merged.variables = {};
    if (!Array.isArray(merged.actions)) merged.actions = [];
    if (merged.rotateProxies === undefined) merged.rotateProxies = false;
    if (merged.disableRecording === undefined) merged.disableRecording = false;
    merged.disableRecording = parseBooleanFlag(merged.disableRecording);
    if (parseBooleanFlag(statelessExecution)) merged.cookieStateId = null;
    if (!merged.translation || typeof merged.translation !== 'object') {
        merged.translation = { enabled: false, targetLanguage: 'english' };
    } else {
        merged.translation = {
            enabled: parseBooleanFlag(merged.translation.enabled),
            targetLanguage: typeof merged.translation.targetLanguage === 'string' && merged.translation.targetLanguage.trim()
                ? merged.translation.targetLanguage.trim()
                : 'english'
        };
    }
    delete merged.versions;
    delete merged.last_opened;
    return merged;
};

export const buildNewTask = (downloadCabinetId = 'cab_basic'): Task => {
    return {
        name: "Task " + Math.floor(Math.random() * 100),
        url: "",
        mode: "agent",
        wait: 0,
        selector: "",
        rotateUserAgents: false,
        rotateProxies: false,
        rotateViewport: false,
        humanTyping: false,
        stealth: {
            allowTypos: false,
            idleMovements: false,
            overscroll: false,
            deadClicks: false,
            fatigue: false,
            naturalTyping: false,
            cursorGlide: false,
            randomizeClicks: false
        },
        actions: [],
        variables: {},
        extractionFormat: 'json',
        includeHtml: false,
        includeShadowDom: true,
        disableRecording: false,
        translation: { enabled: false, targetLanguage: 'english' },
        downloadCabinetId
    };
};

/**
 * Import requests are independent. A rejected fetch or a non-2xx HTTP
 * response must not be counted as a successfully imported Task.
 */
export const createImportedTasks = async (
    tasks: Task[],
    createTask: (task: Task) => Promise<Response>
): Promise<{ imported: number; failed: number; firstError?: string }> => {
    const settled = await Promise.allSettled(tasks.map(async (task) => {
        const response = await createTask(task);
        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`);
        }
    }));
    const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    const firstReason = failures[0]?.reason;
    return {
        imported: tasks.length - failures.length,
        failed: failures.length,
        firstError: failures.length ? (firstReason instanceof Error ? firstReason.message : String(firstReason)) : undefined
    };
};
