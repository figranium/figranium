import { isCloud } from '../platform/runtime';
import { authorizedCloudFetch } from '../platform/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, Action } from '../types';
import { TASK_FIELD_INSPECT_PREFIX, TASK_GROUP_CONTAINER_INSPECT_PREFIX, TASK_GROUP_FIELD_INSPECT_PREFIX } from '../utils/extractionFieldIds';

// Extraction scripts run via native document.querySelector/querySelectorAll, which does not
// support Playwright-only pseudo-selectors like :has-text(...). Strip those out for extraction picks.
const stripUnsupportedForExtraction = (selectors: string[]) => {
    const filtered = selectors.filter(s => !/:has-text\(/i.test(s));
    return filtered.length > 0 ? filtered : selectors;
};

const ACTION_TARGET_INSPECT_SUFFIX = '::targetSelector';

const parseActionInspectTarget = (inspectId: string) => inspectId.endsWith(ACTION_TARGET_INSPECT_SUFFIX)
    ? { actionId: inspectId.slice(0, -ACTION_TARGET_INSPECT_SUFFIX.length), field: 'targetSelector' }
    : { actionId: inspectId, field: 'selector' };

export const useEditorHeadful = (
    _currentTask: Task,
    isHeadfulOpen: boolean | undefined,
    updateAction: (id: string, updates: Partial<Action>, saveImmediately: boolean) => void,
    onNotify: (msg: string, tone?: 'success' | 'error') => void,
    onStopHeadful?: () => void
) => {
    const [isInspectMode, setIsInspectMode] = useState(false);
    const [isInspectLoading, setIsInspectLoading] = useState(false);
    const [activeInspectActionId, setActiveInspectActionId] = useState<string | null>(null);
    const [activeInspectScopeSelector, setActiveInspectScopeSelector] = useState<string | null>(null);
    const [selectorOptionsById, setSelectorOptionsById] = useState<Record<string, string[]>>({});

    const activeInspectActionIdRef = useRef<string | null>(null);
    useEffect(() => { activeInspectActionIdRef.current = activeInspectActionId; }, [activeInspectActionId]);

    const activeInspectScopeSelectorRef = useRef<string | null>(null);
    useEffect(() => { activeInspectScopeSelectorRef.current = activeInspectScopeSelector; }, [activeInspectScopeSelector]);

    const inspectDesiredStateRef = useRef(false);
    const inspectConfirmedStateRef = useRef(false);
    const inspectRequestIdRef = useRef(0);
    const inspectAbortControllerRef = useRef<AbortController | null>(null);

    const onStopHeadfulRef = useRef(onStopHeadful);
    useEffect(() => { onStopHeadfulRef.current = onStopHeadful; }, [onStopHeadful]);

    useEffect(() => {
        if (!isHeadfulOpen) {
            inspectRequestIdRef.current += 1;
            inspectAbortControllerRef.current?.abort();
            inspectAbortControllerRef.current = null;
            inspectDesiredStateRef.current = false;
            inspectConfirmedStateRef.current = false;
            setIsInspectMode(false);
            setIsInspectLoading(false);
        } else if (activeInspectActionIdRef.current) {
            inspectDesiredStateRef.current = true;
            inspectConfirmedStateRef.current = true;
            setIsInspectMode(true);
        }
    }, [isHeadfulOpen]);

    useEffect(() => {
        if (!isCloud || !isHeadfulOpen || !activeInspectActionIdRef.current) return;
        const id = sessionStorage.getItem('figranium-cloud-headful');
        if (!id) return;
        void authorizedCloudFetch(`/api/v1/headful/sessions/${encodeURIComponent(id)}/inspect`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true, scopeSelector: activeInspectScopeSelectorRef.current })
        }).then(response => { if (!response.ok) onNotify('Could not enable Cloud element picker.', 'error'); })
          .catch(() => onNotify('Could not enable Cloud element picker.', 'error'));
    }, [isHeadfulOpen, onNotify]);

    useEffect(() => {
        let eventSource: EventSource | null = null;
        if (isHeadfulOpen && !isCloud) {
            eventSource = new EventSource('/api/headful/selector_stream');
            eventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const inspectId = activeInspectActionIdRef.current;
                    if (data.selector && inspectId) {
                        const { actionId, field } = parseActionInspectTarget(inspectId);
                        try {
                            let payload = JSON.parse(data.selector);
                            let parsed: string[] = Array.isArray(payload) ? payload : payload.selectors;
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                if (inspectId.startsWith(TASK_FIELD_INSPECT_PREFIX) || inspectId.startsWith(TASK_GROUP_CONTAINER_INSPECT_PREFIX) || inspectId.startsWith(TASK_GROUP_FIELD_INSPECT_PREFIX)) {
                                    parsed = stripUnsupportedForExtraction(parsed);
                                }
                                setSelectorOptionsById(prev => ({ ...prev, [inspectId]: parsed }));
                                updateAction(actionId, { [field]: parsed[0] }, true);
                            } else {
                                updateAction(actionId, { [field]: data.selector }, true);
                            }
                        } catch {
                            updateAction(actionId, { [field]: data.selector }, true);
                        }
                        setActiveInspectActionId(null);
                        setActiveInspectScopeSelector(null);
                        onStopHeadfulRef.current?.();
                    }
                } catch (err) { }
            };
        }
        return () => {
            if (eventSource) eventSource.close();
        };
    }, [isHeadfulOpen, updateAction]);

    useEffect(() => {
        if (!isCloud || !isHeadfulOpen) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            const id = sessionStorage.getItem('figranium-cloud-headful');
            if (!id) return;
            try {
                const response = await authorizedCloudFetch(`/api/v1/headful/sessions/${encodeURIComponent(id)}/selector`);
                if (response.status === 410 || response.status === 404) { onStopHeadfulRef.current?.(); return; }
                if (response.ok) {
                    const data = await response.json();
                    const inspectId = activeInspectActionIdRef.current;
                    if (!cancelled && typeof data.selector === 'string' && inspectId) {
                        const { actionId, field } = parseActionInspectTarget(inspectId);
                        setSelectorOptionsById(prev => ({ ...prev, [inspectId]: [data.selector] }));
                        updateAction(actionId, { [field]: data.selector }, true);
                        setActiveInspectActionId(null);
                        setActiveInspectScopeSelector(null);
                        onStopHeadfulRef.current?.();
                        return;
                    }
                }
            } catch { /* A transient polling failure does not terminate a browser. */ }
            if (!cancelled) timer = setTimeout(poll, 1000);
        };
        void poll();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [isHeadfulOpen, updateAction]);

    const handleToggleInspect = useCallback(async () => {
        const nextState = !inspectDesiredStateRef.current;
        const requestId = inspectRequestIdRef.current + 1;
        inspectRequestIdRef.current = requestId;
        inspectDesiredStateRef.current = nextState;
        setIsInspectMode(nextState);
        setIsInspectLoading(true);

        inspectAbortControllerRef.current?.abort();
        const controller = new AbortController();
        inspectAbortControllerRef.current = controller;

        try {
            const cloudId = sessionStorage.getItem('figranium-cloud-headful');
            if (isCloud && !cloudId) throw new Error('Cloud browser unavailable');
            const res = await (isCloud ? authorizedCloudFetch : fetch)(isCloud ? `/api/v1/headful/sessions/${encodeURIComponent(cloudId!)}/inspect` : '/api/headful/inspect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: nextState, scopeSelector: nextState ? activeInspectScopeSelectorRef.current : null }),
                signal: controller.signal
            });
            if (!res.ok) throw new Error('Failed to toggle inspect mode');
            const data = await res.json().catch(() => ({}));
            if (requestId !== inspectRequestIdRef.current) return;

            const acceptedState = typeof data.enabled === 'boolean' ? data.enabled : nextState;
            inspectConfirmedStateRef.current = acceptedState;
            inspectDesiredStateRef.current = acceptedState;
            setIsInspectMode(acceptedState);
            onNotify(`Inspect mode ${acceptedState ? 'enabled' : 'disabled'}`, 'success');
        } catch (e) {
            if (controller.signal.aborted || requestId !== inspectRequestIdRef.current) return;
            inspectDesiredStateRef.current = inspectConfirmedStateRef.current;
            setIsInspectMode(inspectConfirmedStateRef.current);
            onNotify('Failed to toggle inspect mode', 'error');
        } finally {
            if (requestId === inspectRequestIdRef.current) {
                inspectAbortControllerRef.current = null;
                setIsInspectLoading(false);
            }
        }
    }, [onNotify]);

    return {
        isInspectMode,
        isInspectLoading,
        activeInspectActionId,
        setActiveInspectActionId,
        activeInspectScopeSelector,
        setActiveInspectScopeSelector,
        selectorOptionsById,
        handleToggleInspect
    };
};

export const useEditorProxies = () => {
    const [proxyList, setProxyList] = useState<{ id: string }[]>([]);
    const [proxyListLoaded, setProxyListLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const loadProxies = async () => {
            try {
                const res = await fetch('/api/settings/proxies', { credentials: 'include' });
                if (!res.ok) throw new Error('Failed to load proxies');
                const data = await res.json();
                if (cancelled) return;
                setProxyList(Array.isArray(data.proxies) ? data.proxies : []);
            } catch {
                if (!cancelled) setProxyList([]);
            } finally {
                if (!cancelled) setProxyListLoaded(true);
            }
        };
        loadProxies();
        return () => { cancelled = true; };
    }, []);

    return { proxyList, proxyListLoaded };
};
