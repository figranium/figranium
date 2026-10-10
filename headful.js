const { chromium } = require('./stealth-chromium');
const { getProxySelection } = require('./proxy-rotation');
const { selectUserAgent } = require('./user-agent-settings');
const { validateUrl, setupNavigationProtection } = require('./url-utils');
const { parseBooleanFlag } = require('./common-utils');
const { installPageTranslation } = require('./src/agent/translate');
const passwordCapture = require('./src/server/headful-password-capture');

const SEVERE_PERFORMANCE_STYLE_ID = '__figranium_severe_stream_performance';
const { Mutex } = require('./src/server/utils');
const { getCookieState, updateCookieState, resolveCookieStateId } = require('./src/server/cookie-states');

const headfulMutex = new Mutex();

const EventEmitter = require('events');
const headfulEventEmitter = new EventEmitter();

let activeSession = null;

const withTimeout = (promise, timeoutMs, message) => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

function setActiveHeadfulPage(nextPage) {
    if (!activeSession || !nextPage || nextPage.isClosed()) return;
    activeSession.page = nextPage;
}

async function isSiteCreatedPage(nextPage) {
    if (!nextPage || typeof nextPage.opener !== 'function') return false;
    try {
        return !!(await nextPage.opener());
    } catch {
        return false;
    }
}

async function rejectSiteCreatedPage(nextPage) {
    if (!(await isSiteCreatedPage(nextPage))) return false;

    const pageToRestore = activeSession?.page;
    try { await nextPage.close(); } catch { }
    if (pageToRestore && !pageToRestore.isClosed()) {
        try { await pageToRestore.bringToFront(); } catch { }
    }
    return true;
}

function navigateActiveSession(session, url) {
    if (!url || !session?.page || session.page.isClosed()) return Promise.resolve('skipped');

    session.navigationStatus = 'loading';
    const navigation = session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        .then(() => {
            if (activeSession === session) session.navigationStatus = 'complete';
            return 'complete';
        })
        .catch((error) => {
            if (activeSession === session) session.navigationStatus = 'failed';
            if (!session.stopping) console.warn('[HEADFUL] Deferred navigation failed:', error.message);
            return 'failed';
        });
    session.navigation = navigation;
    return navigation;
}

async function monitorHeadfulSession(session) {
    try {
        if (session.browser) {
            await new Promise((resolve) => session.browser.once('disconnected', resolve));
        } else if (session.context) {
            await new Promise((resolve) => session.context.once('close', resolve));
        }
    } finally {
        if (session.interval) clearInterval(session.interval);
        passwordCapture.clear(session.startedAt);
        if (!session.stopping && session.context && session.cookieStateId) {
            await updateCookieState(session.cookieStateId, await session.context.storageState({ indexedDB: true })).catch(() => {});
        }
        if (activeSession === session) activeSession = null;
    }
}

const teardownActiveSession = async () => {
    if (!activeSession) return;
    const session = activeSession;
    passwordCapture.clear(session.startedAt);
    session.stopping = true;
    try {
        if (session.interval) clearInterval(session.interval);
    } catch { }
    if (session.context && session.cookieStateId) {
        await updateCookieState(session.cookieStateId, await session.context.storageState({ indexedDB: true }));
    }
    try {
        if (session.browser) {
            await session.browser.close();
        } else if (session.context) {
            await session.context.close();
        }
    } catch { }
    if (activeSession === session) activeSession = null;
};

async function runHeadful(data, options = {}) {
    const { res } = options;
    if (activeSession) {
        if (data.url) {
            await validateUrl(data.url);
            navigateActiveSession(activeSession, data.url);
        }
        const responseData = {
            message: 'Headful session already active.',
            reused: true,
            ready: true,
            navigation: activeSession.navigationStatus || 'skipped'
        };
        if (res && !res.headersSent) res.json(responseData);
        return activeSession;
    }

    const url = data.url || 'https://www.google.com';
    const cookieStateId = resolveCookieStateId(data);
    const [, selectedUA, attachedCookieState] = await Promise.all([
        validateUrl(url),
        selectUserAgent(false),
        cookieStateId ? getCookieState(String(cookieStateId)) : Promise.resolve(null)
    ]);

    const rotateProxiesRaw = data.rotateProxies;
    const rotateProxies = String(rotateProxiesRaw).toLowerCase() === 'true' || rotateProxiesRaw === true;
    const inspectModeEnabled = !!(data.targetActionId);

    const startingSession = {
        status: 'starting',
        startedAt: Date.now(),
        inspectModeEnabled,
        inspectScopeSelector: null,
        inspectRevision: 0
    };
    activeSession = startingSession;

    let browser;
    let context;
    let page;
    let navigated = false;

    try {
        if (data.targetActionId && data.taskSnapshot) {
            const { runFigranite } = require('./src/agent/figranite');
            try {
                const { statelessExecution: _legacyStatelessExecution, ...taskScope } = data.taskSnapshot;
                const reqScope = { ...taskScope, variables: data.variables || data.taskVariables || {}, cookieStateId, disableRecording: true };
                if (data.url) reqScope.url = data.url;

                const result = await runFigranite(reqScope, {
                    headless: false,
                    handoffContext: true,
                    stopAtActionId: data.targetActionId
                });
                if (result && result._handoff) {
                    browser = result._handoff.browser;
                    context = result._handoff.context;
                    page = result._handoff.page;
                    navigated = true;
                }
            } catch (e) {
                console.error("Agent handoff failed:", e);
            }
        }

        if (!browser) {
            const selection = getProxySelection(rotateProxies);
            const hasProxy = !!selection.proxy;

            const args = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080',
                '--dns-prefetch-disable',
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
            ];
            if (process.platform !== 'darwin') {
                args.push('--disable-gpu', '--window-position=0,0', '--start-maximized');
            }
            if (!hasProxy) {
                args.push(
                    '--enable-features=DnsOverHttps',
                    '--dns-over-https-mode=secure',
                    '--dns-over-https-templates=https://cloudflare-dns.com/dns-query'
                );
            }

            let cleanProxy = undefined;
            if (selection.proxy) {
                cleanProxy = { server: selection.proxy.server };
                if (selection.proxy.username) cleanProxy.username = selection.proxy.username;
                if (selection.proxy.password) cleanProxy.password = selection.proxy.password;
            }

            const contextOptions = {
                viewport: null,
                userAgent: selectedUA,
                locale: 'en-US',
                timezoneId: 'America/New_York',
                permissions: ['clipboard-read', 'clipboard-write'],
                ...(cleanProxy ? { proxy: cleanProxy } : {})
            };

            const isHeadless = parseBooleanFlag(data.headless) || parseBooleanFlag(process.env.HEADLESS);

            if (attachedCookieState) contextOptions.storageState = attachedCookieState.state;

            // A persistent Chromium profile also restores tab/session and service-worker
            // state. Authenticated sites can consequently reopen background tabs, which
            // then fight the popup guard and visibly flash open and closed. A fresh
            // context preserves the explicit web storage above without reviving tabs.
            browser = await chromium.launch({ headless: isHeadless, args, ...(cleanProxy ? { proxy: cleanProxy } : {}) });
            context = await browser.newContext(contextOptions);
        }

        const passwordCaptureInit = passwordCapture.installPageCapture;
        await Promise.all([
            context.exposeBinding('__figraniumOfferPassword', (source, candidate) => {
                if (activeSession?.startedAt !== startingSession.startedAt) return;
                passwordCapture.offer(startingSession.startedAt, source.frame.url(), candidate);
            }),
            context.addInitScript(passwordCaptureInit)
        ]);

        const inspectInitFn = () => {
            Object.defineProperty(window, 'open', { writable: true, configurable: true, value: () => null });
            const handleLinkClick = (event) => {
                const path = event.composedPath ? event.composedPath() : [];
                const anchor = path.find(el => el.tagName === 'A');
                if (anchor && anchor.target === '_blank') {
                    event.preventDefault();
                    return;
                }
                if (event.type === 'auxclick' && event.button === 1 && anchor) {
                    event.preventDefault();
                }
            };
            document.addEventListener('click', handleLinkClick, true);
            document.addEventListener('auxclick', handleLinkClick, true);

            window.__figraniumInspectInit = () => {
                if (window._figraniumInspectHandler) return;

                const overlay = document.createElement('div');
                overlay.id = 'figranium-inspect-overlay';
                overlay.style.position = 'fixed';
                overlay.style.pointerEvents = 'none';
                overlay.style.zIndex = '2147483646';
                overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                overlay.style.border = '1px solid rgb(96, 165, 250)';
                overlay.style.boxSizing = 'border-box';
                overlay.style.transition = 'all 0.1s ease';
                overlay.style.display = 'none';
                document.body.appendChild(overlay);

                const tooltip = document.createElement('div');
                tooltip.id = 'figranium-inspect-tooltip';
                tooltip.style.position = 'fixed';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.zIndex = '2147483647';
                tooltip.style.backgroundColor = '#1e293b';
                tooltip.style.color = '#f8fafc';
                tooltip.style.padding = '4px 8px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.fontSize = '12px';
                tooltip.style.fontFamily = 'monospace';
                tooltip.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                tooltip.style.display = 'none';
                tooltip.style.whiteSpace = 'nowrap';
                tooltip.style.lineHeight = '1.4';
                document.body.appendChild(tooltip);

                window._figraniumGetSelectors = (el, root) => {
                    root = root || document;
                    const isRandomId = (id) => {
                        if (!id) return true;
                        // Long numbers, UUIDs, explicit long strings
                        if (/\d{4,}/.test(id) || /^[0-9a-f]{8}-/i.test(id) || id.length > 30 || /[0-9]{3,}/.test(id)) return true;
                        // Google-style obfuscated classes (e.g. gLFyf, APjFqb) — mixed-case letters that don't follow camelCase/PascalCase (with common acronyms allowed)
                        if (/^[a-zA-Z]{4,8}$/.test(id) && /[A-Z]/.test(id) && /[a-z]/.test(id)) {
                            const acr = '(?:UI|UX|ID|DB|IO|IP|OS|QA|AI|ML|API|URL|CSS|DOM|RGB|SVG|XML|SQL|SDK|CLI|SSH|DNS|TCP|UDP|HTTP|JSON|HTML)';
                            const validCamelCase = new RegExp('^(?:' + acr + '|[A-Z]?[a-z]+)(?:' + acr + '|[A-Z][a-z]+)*$');
                            if (!validCamelCase.test(id)) return true;
                        }
                        // Short mixed-case alphanumeric with digits (e.g. A7sPV, tX61Ub, gL3fY)
                        if (id.length <= 10 && /^[a-zA-Z0-9]+$/.test(id) && /[A-Z]/.test(id) && /[a-z]/.test(id) && /[0-9]/.test(id)) return true;
                        // Styled-components or CSS modules with hashes like css-1n7jcv, style_module__1xyz
                        if (/^css-[a-zA-Z0-9]+/.test(id) || /^sc-[a-zA-Z0-9]+/.test(id) || /_[a-zA-Z0-9]{5,}$/.test(id) || /-[a-zA-Z0-9]{5,}$/.test(id)) return true;
                        // Tailwind arbitrary values or very complex utility classes
                        if (id.includes('[') || id.includes(']')) return true;
                        return false;
                    };
                    const tag = el.tagName ? el.tagName.toLowerCase() : '';
                    if (!tag || tag === 'html' || tag === 'body') return [tag];

                    const selectors = new Set();

                    const isUnique = (sel) => {
                        try {
                            const nodes = root.querySelectorAll(sel);
                            return nodes.length === 1 && nodes[0] === el;
                        } catch (e) { return false; }
                    };

                    const addIfUnique = (sel) => {
                        if (isUnique(sel)) selectors.add(sel);
                    };

                    // 1. Name & placeholder (highest priority — most human-readable)
                    const topAttrs = ['name', 'placeholder'];
                    for (const attr of topAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.length < 50 && !val.includes('"') && !val.includes('\n')) {
                            addIfUnique(`[${attr}="${val}"]`);
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 2. Text content (:has-text — very readable)
                    if ((tag === 'button' || tag === 'a' || tag === 'span' || tag === 'div' || tag === 'label' || tag === 'li' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3') && el.textContent) {
                        const text = el.textContent.trim().substring(0, 40);
                        if (text && !text.includes('\n') && !text.includes('"') && text.length > 1) {
                            const allTags = Array.from(root.querySelectorAll(tag));
                            const matches = allTags.filter(t => t.textContent.trim() === text);
                            if (matches.length === 1 && matches[0] === el) {
                                selectors.add(`${tag}:has-text("${text}")`);
                            }
                        }
                    }

                    // 3. Other semantic attributes
                    const semanticAttrs = ['aria-label', 'title', 'alt'];
                    for (const attr of semanticAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.length < 50 && !val.includes('"') && !val.includes('\n')) {
                            addIfUnique(`[${attr}="${val}"]`);
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 4. Data attributes
                    const dataAttrs = ['data-testid', 'data-test-id', 'data-qa', 'data-cy'];
                    for (const attr of dataAttrs) {
                        const val = el.getAttribute(attr);
                        if (val) {
                            addIfUnique(`[${attr}="${val}"]`);
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 5. IDs
                    const id = el.id;
                    if (id && !isRandomId(id)) {
                        addIfUnique(`#${id}`);
                        addIfUnique(`${tag}#${id}`);
                    }

                    // 6. Other basic attributes
                    const otherAttrs = ['type', 'value', 'href', 'src'];
                    for (const attr of otherAttrs) {
                        const val = el.getAttribute(attr);
                        if (val && val.length < 50 && !val.includes('"') && !val.includes('\n') && !val.startsWith('data:')) {
                            addIfUnique(`${tag}[${attr}="${val}"]`);
                        }
                    }

                    // 7. Classes
                    const classes = el.className && typeof el.className === 'string' ?
                        el.className.trim().split(/\s+/).filter(c => c && !isRandomId(c)) : [];
                    const classStr = classes.length > 0 ? '.' + classes.join('.') : '';

                    if (classStr) {
                        addIfUnique(`${tag}${classStr}`);
                        if (classes.length === 1) addIfUnique(`${classStr}`);
                        if (classes.length > 1) {
                            for (let c of classes) addIfUnique(`${tag}.${c}`);
                        }
                    }

                    addIfUnique(tag);

                    // 7. Structural
                    if (el.parentElement) {
                        const siblings = Array.from(el.parentElement.children).filter(c => c.tagName === el.tagName);
                        const index = siblings.indexOf(el) + 1;
                        addIfUnique(`${tag}:nth-of-type(${index})`);
                        if (classStr) addIfUnique(`${tag}${classStr}:nth-of-type(${index})`);
                    }

                    // 8. Combinations with parents (Basic Path generation fallback)
                    if (selectors.size < 3) {
                        let path = '';
                        let current = el;
                        while (current && current !== root && current !== document.body && current !== document.documentElement) {
                            let step = current.tagName.toLowerCase();

                            // add id if good
                            if (current.id && !isRandomId(current.id)) {
                                step += `#${current.id}`;
                            } else {
                                // Add nth-of-type if no id and has siblings of same tag
                                if (current.parentElement) {
                                    const sibs = Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName);
                                    if (sibs.length > 1) step += `:nth-of-type(${sibs.indexOf(current) + 1})`;
                                }
                            }

                            path = path ? `${step} > ${path}` : step;
                            if (isUnique(path)) {
                                selectors.add(path);
                                break; // Stop as soon as we found a unique path
                            }

                            // Try ID anchor
                            if (current.id && !isRandomId(current.id) && isUnique(`#${current.id}`)) {
                                break; // We anchored on a unique ID
                            }

                            current = current.parentElement;
                        }
                    }

                    return Array.from(selectors).slice(0, 5);
                };

                window._figraniumInspectHandler = (e) => {
                    const element = e.composedPath ? e.composedPath()[0] : e.target;
                    if (!element || element === document || element === document.body) {
                        overlay.style.display = 'none';
                        tooltip.style.display = 'none';
                        return;
                    }

                    const rect = element.getBoundingClientRect();
                    overlay.style.display = 'block';
                    overlay.style.top = rect.top + 'px';
                    overlay.style.left = rect.left + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';

                    const selectors = window._figraniumGetSelectors(element);
                    tooltip.style.display = 'block';
                    tooltip.innerHTML = selectors.map((s, i) => i === 0 ? `<strong>${s}</strong>` : `<span style="opacity:0.7">${s}</span>`).join('<br/>');

                    let tipTop = e.clientY + 15;
                    let tipLeft = e.clientX + 15;

                    const tooltipRect = tooltip.getBoundingClientRect();
                    if (tipLeft + tooltipRect.width > window.innerWidth) {
                        tipLeft = e.clientX - tooltipRect.width - 15;
                    }
                    if (tipTop + tooltipRect.height > window.innerHeight) {
                        tipTop = e.clientY - tooltipRect.height - 15;
                    }

                    tooltip.style.top = tipTop + 'px';
                    tooltip.style.left = tipLeft + 'px';
                };

                window._figraniumInspectClickHandler = async (e) => {
                    if (!window._figraniumInspectHandler) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const element = e.composedPath ? e.composedPath()[0] : e.target;

                    const scopeSelector = window.__figraniumInspectScopeSelector;
                    let scopeRoot = null;
                    if (scopeSelector) {
                        try {
                            const container = element.closest(scopeSelector);
                            if (container && container !== element) scopeRoot = container;
                        } catch (err) { }
                    }

                    const selectors = window._figraniumGetSelectors(element, scopeRoot || undefined);
                    const bestSelector = selectors[0] || '';

                    // Push to backend via Playwright binding
                    if (window.__figraniumOnElementSelected && selectors.length > 0) {
                        try {
                            await window.__figraniumOnElementSelected(JSON.stringify({ selectors }));
                        } catch (err) { }
                    }

                    try {
                        if (bestSelector && navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(bestSelector);
                        }
                    } catch (err) { }
                };

                document.addEventListener('mousemove', window._figraniumInspectHandler, true);
                document.addEventListener('click', window._figraniumInspectClickHandler, true);
            };

            window.__figraniumInspectDestroy = () => {
                const overlay = document.getElementById('figranium-inspect-overlay');
                if (overlay) overlay.remove();
                const tooltip = document.getElementById('figranium-inspect-tooltip');
                if (tooltip) tooltip.remove();
                if (window._figraniumInspectHandler) {
                    document.removeEventListener('mousemove', window._figraniumInspectHandler, true);
                    delete window._figraniumInspectHandler;
                }
                if (window._figraniumInspectClickHandler) {
                    document.removeEventListener('click', window._figraniumInspectClickHandler, true);
                    delete window._figraniumInspectClickHandler;
                }
            };

            window.__figraniumApplyInspectState = (state) => {
                if (!state) return false;
                const revision = Number(state.revision) || 0;
                const appliedRevision = Number(window.__figraniumInspectRevision) || 0;
                if (revision < appliedRevision) return false;

                window.__figraniumInspectRevision = revision;
                window.__figraniumInspectScopeSelector = state.scopeSelector || null;
                if (state.enabled) {
                    window.__figraniumInspectInit();
                } else {
                    window.__figraniumInspectDestroy();
                }
                return true;
            };

            window.addEventListener('DOMContentLoaded', async () => {
                if (window.__figraniumGetInspectState) {
                    const state = await window.__figraniumGetInspectState();
                    window.__figraniumApplyInspectState(state);
                }
            });
        };

        await Promise.all([
            setupNavigationProtection(context),
            context.addInitScript(inspectInitFn),
            context.exposeBinding('__figraniumIsInspectEnabled', () => {
                return activeSession ? !!activeSession.inspectModeEnabled : false;
            }),
            context.exposeBinding('__figraniumGetInspectState', () => {
                if (!activeSession) return { enabled: false, scopeSelector: null, revision: 0 };
                return {
                    enabled: !!activeSession.inspectModeEnabled,
                    scopeSelector: activeSession.inspectScopeSelector || null,
                    revision: Number(activeSession.inspectRevision) || 0
                };
            }),
            context.exposeBinding('__figraniumOnElementSelected', (source, selector) => {
                headfulEventEmitter.emit('selectorSelected', selector);
            })
        ]);

        if (!page) {
            // Persistent context auto-creates a blank page; reuse it or open a new one
            const existingPages = context.pages();
            page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
            if (process.platform !== 'darwin') {
                try {
                    const cdp = await context.newCDPSession(page);
                    const { windowId } = await cdp.send('Browser.getWindowForTarget');
                    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
                } catch (e) { }
            }
        } else {
            try { await page.evaluate(inspectInitFn); } catch (e) { }
            try { await page.evaluate(passwordCaptureInit); } catch (e) { }
            try {
                await page.evaluate(() => {
                    if (window.__figraniumInspectInit) window.__figraniumInspectInit();
                });
            } catch (e) { }
        }

        const trackedPages = new WeakSet();
        const attachPageTracking = (trackedPage) => {
            if (!trackedPage || trackedPages.has(trackedPage)) return;
            trackedPages.add(trackedPage);

            trackedPage.on('close', () => {
                if (!activeSession || activeSession.page !== trackedPage) return;
                const remainingPage = activeSession.context?.pages().find((candidate) => candidate !== trackedPage && !candidate.isClosed());
                if (remainingPage) {
                    setActiveHeadfulPage(remainingPage);
                }
            });
        };

        context.on('page', async (newPage) => {
            if (await rejectSiteCreatedPage(newPage)) return;
            setActiveHeadfulPage(newPage);
            attachPageTracking(newPage);
        });
        attachPageTracking(page);

        const session = {
            browser,
            context,
            page,
            status: 'running',
            startedAt: startingSession.startedAt,
            inspectModeEnabled: startingSession.inspectModeEnabled,
            inspectScopeSelector: startingSession.inspectScopeSelector || null,
            inspectRevision: Number(startingSession.inspectRevision) || 0,
            viewerProfile: 'full',
            interval: null,
            cookieStateId,
            isolatedCookies: true,
            navigationStatus: navigated ? 'complete' : (url ? 'loading' : 'skipped')
        };
        const syncInterval = cookieStateId ? setInterval(() => {
            if (activeSession === session && session.context && session.cookieStateId) {
                updateCookieState(session.cookieStateId, session.context.storageState({ indexedDB: true })).catch(() => {});
            }
        }, 30000) : null;
        session.interval = syncInterval;
        activeSession = session;

        const readyInMs = Date.now() - session.startedAt;
        console.info(`[HEADFUL] Session ready in ${readyInMs}ms.`);

        page.on('domcontentloaded', () => {
            if (activeSession?.page === page && activeSession.viewerProfile === 'severe') {
                applyViewerPerformanceProfile('severe').catch(() => {});
            }
        });

        const responseData = {
            message: 'Headful session started.',
            userAgentUsed: selectedUA,
            ready: true,
            navigation: session.navigationStatus
        };

        if (res && !res.headersSent) {
            res.json(responseData);
        }

        if (!navigated && url) navigateActiveSession(session, url);

        // Translation is optional presentation work. Register it after the session
        // is ready so a remote translation script never delays the live viewer.
        installPageTranslation(page, data.translation || data.taskSnapshot?.translation)
            .catch((error) => console.warn('[HEADFUL] Deferred translation setup failed:', error.message));

        monitorHeadfulSession(session).catch((error) => console.warn('[HEADFUL] Session monitor failed:', error.message));
        return responseData;
    } catch (error) {
        if (browser) await browser.close();
        else if (context) await context.close().catch(() => {});
        if (activeSession === startingSession) activeSession = null;
        throw error;
    }
}

function isDisplayUnavailableError(err) {
    const message = String(err && err.message ? err.message : err).toLowerCase();
    return message.includes('missing x server')
        || message.includes('$display')
        || message.includes('platform failed to initialize')
        || message.includes('no display server')
        || message.includes('target page, context or browser has been closed')
        || message.includes('target closed')
        || message.includes('x11 connection failed')
        || message.includes('cannot open display');
}

async function handleHeadful(req, res) {
    await headfulMutex.lock();
    try {
        const data = { ...req.body, ...req.query };
        await runHeadful(data, { res });
    } catch (error) {
        const message = String(error && error.message ? error.message : error);
        if (!res.headersSent && isDisplayUnavailableError(message)) {
            return res.status(409).json({ error: 'HEADFUL_DISPLAY_UNAVAILABLE', details: message });
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to start headful session', details: message });
        }
    } finally {
        headfulMutex.unlock();
    }
}

async function stopHeadful(req, res) {
    if (!activeSession) {
        return res.status(200).json({ message: 'No active headful session.' });
    }

    await teardownActiveSession();
    if (res) res.json({ message: 'Headful session stopped.' });
}

function getActiveSession() {
    return activeSession;
}

function getPendingPasswordCapture() {
    return activeSession?.status === 'running' ? passwordCapture.peek(activeSession.startedAt) : null;
}

function takePendingPasswordCapture(id) {
    return activeSession?.status === 'running' ? passwordCapture.take(activeSession.startedAt, id) : null;
}

function readPendingPasswordCapture(id) {
    return activeSession?.status === 'running' ? passwordCapture.get(activeSession.startedAt, id) : null;
}

const { setHeadfulViewerProfile, toggleInspectMode } = require('./src/server/headful-control-handlers')({
    getActiveSession, withTimeout, severePerformanceStyleId: SEVERE_PERFORMANCE_STYLE_ID
});

/**
 * Launch (or reattach) a managed headful browser session for API/MCP use.
 * Unlike runHeadful/handleHeadful, this does not block until disconnect and
 * does not write to an Express response; it returns the session handle.
 */
async function launchApiSession(data = {}) {
    if (activeSession) {
        // Reuse existing session
        if (data.url) {
            await validateUrl(data.url);
            navigateActiveSession(activeSession, data.url);
        }
        return activeSession;
    }

    const fakeRes = { headersSent: true, json: () => {}, status: () => fakeRes };
    let launchError = null;

    const startSession = (sessionData) => {
        runHeadful(sessionData, { res: fakeRes }).catch((e) => {
            launchError = e;
            console.error('[HEADFUL] launchApiSession error:', e && e.message ? e.message : e);
        });
    };

    startSession(data);

    // Poll until activeSession becomes 'running' or error occurs
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (activeSession && activeSession.status === 'running') return activeSession;
        if (launchError) break;
        await new Promise(r => setTimeout(r, 100));
    }

    // If initial launch failed due to display unavailable, automatically retry in headless mode
    if (launchError && isDisplayUnavailableError(launchError)) {
        console.log('[HEADFUL] Display unavailable during API browser launch. Retrying in headless mode...');
        launchError = null;
        startSession({ ...data, headless: true });
        const fallbackDeadline = Date.now() + 30000;
        while (Date.now() < fallbackDeadline) {
            if (activeSession && activeSession.status === 'running') return activeSession;
            if (launchError) break;
            await new Promise(r => setTimeout(r, 100));
        }
    }

    if (launchError) {
        throw launchError;
    }

    return activeSession;
}

function ensureSessionId(session) {
    if (!session) return null;
    if (!session.sessionId) {
        session.sessionId = 'sess_' + session.startedAt;
    }
    return session.sessionId;
}

module.exports = {
    runHeadful,
    handleHeadful,
    stopHeadful,
    toggleInspectMode,
    headfulEventEmitter,
    getActiveSession,
    getPendingPasswordCapture,
    readPendingPasswordCapture,
    takePendingPasswordCapture,
    launchApiSession,
    setHeadfulViewerProfile,
    ensureSessionId
};
