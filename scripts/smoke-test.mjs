#!/usr/bin/env node
/*
 * smoke-test.mjs — load the legacy webpack bundle in jsdom and confirm it
 * evaluates without throwing a module-level error (the class of bug that
 * broke the v1.0.4 build: `logger.child` called at module top level).
 *
 * This doesn't exercise UI flows — it only executes every module's
 * initialiser code. That's enough to catch typos against helper APIs,
 * missing imports, wrong method names, and top-level throws that currently
 * only surface on the TV.
 *
 * Usage: node scripts/smoke-test.mjs
 * Exits 0 if the bundle loads cleanly, 1 on any window error or uncaught
 * throw.
 */

import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(__dirname, '..', 'dist', 'legacy', 'index.html');

const html = readFileSync(INDEX, 'utf8');
const baseUrl = pathToFileURL(INDEX).toString();

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (err) => {
    errors.push(err);
    process.stderr.write(`[jsdom] ${err.message}\n${err.stack || ''}\n`);
});
// Mirror app console.error into stderr so runtime errors are visible too.
virtualConsole.on('error', (...a) => process.stderr.write(`[console.error] ${a.join(' ')}\n`));
virtualConsole.on('warn', () => {}); // quiet

const dom = new JSDOM(html, {
    url: baseUrl,
    runScripts: 'dangerously',
    resources: new ResourceLoader({
        strictSSL: false,
        userAgent: 'Mozilla/5.0 (WebOS; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.270 Safari/537.36 WebAppManager'
    }),
    pretendToBeVisual: true,
    virtualConsole
});

// Stub webOS global so the webOSTV.js polyfill path doesn't blow up.
dom.window.webOS = dom.window.webOS || { platform: 'tv' };

// jsdom doesn't expose Storage on file:// origins. The app touches
// localStorage during very early bootstrap (theme restore, settings load),
// so provide a minimal in-memory shim so those paths don't early-exit and
// mask other errors we actually care about.
if (typeof dom.window.localStorage === 'undefined') {
    const mem = new Map();
    const shim = {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => { mem.set(k, String(v)); },
        removeItem: (k) => { mem.delete(k); },
        clear: () => { mem.clear(); },
        key: (i) => Array.from(mem.keys())[i] ?? null,
        get length() { return mem.size; }
    };
    Object.defineProperty(dom.window, 'localStorage', { value: shim, configurable: true });
    Object.defineProperty(dom.window, 'sessionStorage', { value: shim, configurable: true });
}

// Surface uncaught promise rejections too.
dom.window.addEventListener('unhandledrejection', (e) => {
    errors.push(e.reason || new Error('unhandledrejection'));
    process.stderr.write(`[unhandledrejection] ${e.reason}\n`);
});
dom.window.addEventListener('error', (e) => {
    errors.push(e.error || new Error(e.message));
    process.stderr.write(`[window.onerror] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n`);
});

// Give the bundle a moment to finish module evaluation + initial router run.
await new Promise((r) => setTimeout(r, 4000));

// Also explicitly probe: did the bootstrap log fire? If Bootstrap's
// `logger.create` chain is broken, that flag never gets set.
const hasApp = !!dom.window.document.querySelector('#app, #root, body');
if (!hasApp) errors.push(new Error('No #app/#root/body rendered'));

if (errors.length > 0) {
    process.stderr.write(`\nFAIL: ${errors.length} error(s) during bundle load\n`);
    process.exit(1);
}

process.stdout.write('OK: bundle loaded without module-level errors\n');
process.exit(0);
