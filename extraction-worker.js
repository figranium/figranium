const { JSDOM } = require('jsdom');
const vm = require('vm');

// Safe Proxy Implementation
const proxyMap = new WeakMap();
const targetMap = new WeakMap();

const unwrap = (obj) => {
    return proxyMap.get(obj) || obj;
};

const createSafeProxy = (target) => {
    if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
        return target;
    }
    // ⚡ Bolt: Prevent redundant nested proxying to ensure identity consistency
    if (proxyMap.has(target)) {
        return target;
    }
    if (targetMap.has(target)) {
        return targetMap.get(target);
    }

    const proxy = new Proxy(target, {
        get: (obj, prop) => {
            if (prop === 'constructor' || prop === '__proto__') {
                return undefined;
            }
            const value = obj[prop];
            return createSafeProxy(value);
        },
        apply: (target, thisArg, args) => {
            const unproxiedArgs = args.map(arg => {
                const raw = unwrap(arg);
                if (typeof raw === 'function') {
                    return function (...hostArgs) {
                        const proxiedCbArgs = hostArgs.map(hostArg => createSafeProxy(hostArg));
                        const proxiedThis = createSafeProxy(this);
                        return raw.apply(proxiedThis, proxiedCbArgs);
                    };
                }
                return raw;
            });
            const result = target.apply(unwrap(thisArg), unproxiedArgs);
            return createSafeProxy(result);
        },
        construct: (target, args) => {
            const unproxiedArgs = args.map(arg => {
                const raw = unwrap(arg);
                if (typeof raw === 'function') {
                    return function (...hostArgs) {
                        const proxiedCbArgs = hostArgs.map(hostArg => createSafeProxy(hostArg));
                        const proxiedThis = createSafeProxy(this);
                        return raw.apply(proxiedThis, proxiedCbArgs);
                    };
                }
                return raw;
            });
            const result = new target(...unproxiedArgs);
            return createSafeProxy(result);
        },
        has: (target, prop) => {
            if (prop === 'constructor' || prop === '__proto__') return false;
            return prop in target;
        },
        getOwnPropertyDescriptor: (target, prop) => {
            if (prop === 'constructor' || prop === '__proto__') {
                return undefined;
            }
            const descriptor = Object.getOwnPropertyDescriptor(target, prop);
            if (!descriptor) return undefined;

            if (descriptor.configurable === false && 'value' in descriptor && typeof descriptor.value === 'object') {
                 return descriptor;
            }

            if (descriptor.value) {
                descriptor.value = createSafeProxy(descriptor.value);
            }
            if (descriptor.get) {
                descriptor.get = createSafeProxy(descriptor.get);
            }
            if (descriptor.set) {
                descriptor.set = createSafeProxy(descriptor.set);
            }
            return descriptor;
        },
        getPrototypeOf: (target) => {
            // Security: Returning a null prototype prevents sandbox escape via Object.getPrototypeOf()
            // while still allowing the script to function for most data access patterns.
            return null;
        },
        set: (target, prop, value) => {
            // Security: Sandboxed scripts should not be able to modify the host data objects.
            return false;
        },
        defineProperty: (target, prop, descriptor) => {
            // Security: Prevent defining new properties on proxied objects.
            return false;
        },
        deleteProperty: (target, prop) => {
            // Security: Prevent deleting properties from proxied objects.
            return false;
        }
    });

    targetMap.set(target, proxy);
    proxyMap.set(proxy, target);
    return proxy;
};

const runExtraction = async (data) => {
    const { script, html, url, includeShadowDom } = data;
    if (!script || typeof script !== 'string') return { result: undefined, logs: [] };

    try {
        const dom = new JSDOM(html || '');
        const { window } = dom;
        const logBuffer = [];
        const consoleProxy = {
            log: (...args) => logBuffer.push(args.join(' ')),
            info: (...args) => logBuffer.push(args.join(' ')),
            debug: (...args) => logBuffer.push(args.join(' ')),
            warn: (...args) => logBuffer.push(args.join(' ')),
            error: (...args) => logBuffer.push(args.join(' '))
        };

        const shadowHelpers = (() => {
            const shadowQueryAll = (selector, root = window.document) => {
                const results = [];
                if (!root || !selector) return results;

                // ⚡ Bolt: Use querySelectorAll for the current root level to leverage optimized engine matching.
                // This replaces the manual recursive DOM walk, significantly improving performance for large trees.
                if (root.querySelectorAll) {
                    const matches = root.querySelectorAll(selector);
                    for (let i = 0; i < matches.length; i++) results.push(matches[i]);

                    // ⚡ Bolt: Find shadow roots efficiently using querySelectorAll to skip non-shadow elements.
                    const templates = root.querySelectorAll('template[data-shadowroot]');
                    for (let i = 0; i < templates.length; i++) {
                        const shadowMatches = shadowQueryAll(selector, templates[i].content);
                        for (let j = 0; j < shadowMatches.length; j++) results.push(shadowMatches[j]);
                    }
                }

                return results;
            };

            const shadowText = (root = window.document) => {
                const texts = [];
                const walk = (node) => {
                    if (!node) return;
                    if (node.nodeType === 3) {
                        const text = node.nodeValue ? node.nodeValue.trim() : '';
                        if (text) texts.push(text);
                        return;
                    }
                    if (node.nodeType === 1) {
                        const el = node;
                        if (el.tagName === 'TEMPLATE' && el.hasAttribute('data-shadowroot')) {
                            walk(el.content);
                        }
                    }
                    // ⚡ Bolt: Use a while loop with firstChild/nextSibling for significantly better performance in JSDOM environments
                    // compared to node.childNodes.forEach() which creates a static NodeList.
                    let child = node.firstChild;
                    while (child) {
                        walk(child);
                        child = child.nextSibling;
                    }
                };
                walk(root);
                return texts;
            };

            return { shadowQueryAll, shadowText };
        })();

        const proxiedData = createSafeProxy({
            html: () => html || '',
            url: () => url || '',
            window,
            document: window.document,
            shadowQueryAll: includeShadowDom ? shadowHelpers.shadowQueryAll : undefined,
            shadowText: includeShadowDom ? shadowHelpers.shadowText : undefined
        });

        const sandbox = Object.create(null);
        Object.assign(sandbox, {
            data: proxiedData,
            $$data: proxiedData,
            window: createSafeProxy(window),
            document: createSafeProxy(window.document),
            DOMParser: createSafeProxy(window.DOMParser),
            console: createSafeProxy(consoleProxy)
        });

        sandbox.$$userScript = script;
        const context = vm.createContext(sandbox);
        const scriptCode = `
            "use strict";
            (async () => {
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                const fn = new AsyncFunction('data', '$$data', 'window', 'document', 'DOMParser', 'console', $$userScript);
                return fn(data, $$data, window, document, DOMParser, console);
            })();
        `;

        const result = await vm.runInContext(scriptCode, context, { timeout: 1000 });

        return { result, logs: logBuffer };
    } catch (e) {
        return { result: `Extraction script error: ${e.message}`, logs: [] };
    }
};

let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    inputData += chunk;
});
process.stdin.on('end', async () => {
    try {
        const data = JSON.parse(inputData);
        const output = await runExtraction(data);
        console.log(JSON.stringify(output));
    } catch (e) {
        console.log(JSON.stringify({ result: `Worker error: ${e.message}`, logs: [] }));
    }
});
