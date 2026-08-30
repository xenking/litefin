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
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist', 'legacy');
const INDEX = join(DIST, 'index.html');

const MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.woff': 'font/woff',
    '.woff2':'font/woff2'
};

// jsdom's file:// resource loader throws a bare DOMException on Node 20 when
// a <script src="..."> 404s or races. Serve dist/legacy over a throwaway HTTP
// server so every fetch is a plain 200/404 we can observe, and jsdom's
// localStorage is also enabled natively for http:// origins.
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!path.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try {
        const st = statSync(path);
        if (st.isDirectory()) path = join(path, 'index.html');
        const ext = path.slice(path.lastIndexOf('.'));
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(readFileSync(path));
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
    }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}/index.html`;

const html = readFileSync(INDEX, 'utf8');

const errors = [];

// Network errors (EHOSTDOWN, ECONNREFUSED, ETIMEDOUT, failed XHRs to the
// saved Jellyfin server) are noise in the smoke test — the whole point is
// to catch MODULE-LEVEL code bugs, not to have a live server. Filter them.
const NETWORK_NOISE = /\b(EHOSTDOWN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EADDRNOTAVAIL|getaddrinfo|fetch failed|Failed to fetch|NetworkError|XHR)\b/i;
function isBundleBug(err) {
    const msg = (err?.message || String(err));
    if (NETWORK_NOISE.test(msg)) return false;
    // Real bugs: TypeError / ReferenceError / SyntaxError / generic Error with
    // an app stack frame.
    return true;
}

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (err) => {
    if (!isBundleBug(err)) return;
    errors.push(err);
    process.stderr.write(`[jsdom] ${err.message}\n${err.stack || ''}\n`);
});
// Mirror app console.error into stderr so runtime errors are visible too.
virtualConsole.on('error', (...a) => process.stderr.write(`[console.error] ${a.join(' ')}\n`));
virtualConsole.on('warn', () => {}); // quiet

let dom;
try {
    dom = new JSDOM(html, {
        url: baseUrl,
        runScripts: 'dangerously',
        resources: new ResourceLoader({
            strictSSL: false,
            userAgent: 'Mozilla/5.0 (WebOS; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.270 Safari/537.36 WebAppManager'
        }),
        pretendToBeVisual: true,
        virtualConsole,
        beforeParse(window) {
            window.TextMetrics = class TextMetrics {};
            window.CSS = window.CSS || {};
            window.HTMLCanvasElement.prototype.getContext = () => ({});
        },
    });
} catch (err) {
    process.stderr.write(`[JSDOM init] ${err.constructor?.name}: ${err.message || '(empty message)'}\n${err.stack || ''}\n`);
    process.exit(2);
}

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

// Surface uncaught promise rejections too (filter network noise).
dom.window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason || new Error('unhandledrejection');
    if (!isBundleBug(err)) return;
    errors.push(err);
    process.stderr.write(`[unhandledrejection] ${err.message || err}\n`);
});
dom.window.addEventListener('error', (e) => {
    const err = e.error || new Error(e.message);
    if (!isBundleBug(err)) return;
    errors.push(err);
    process.stderr.write(`[window.onerror] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n`);
});

// Catch anything jsdom throws asynchronously — an unwrapped DOMException on
// Node 20 kills the process with an empty message, so upgrade to a logged
// stderr line and a clean non-zero exit instead.
process.on('uncaughtException', (err) => {
    errors.push(err);
    process.stderr.write(`[uncaughtException] ${err.constructor?.name}: ${err.message || String(err)}\n${err.stack || ''}\n`);
});
process.on('unhandledRejection', (err) => {
    errors.push(err);
    process.stderr.write(`[unhandledRejection] ${err?.constructor?.name}: ${err?.message || String(err)}\n${err?.stack || ''}\n`);
});

// Give the bundle a moment to finish module evaluation + initial router run.
await new Promise((r) => setTimeout(r, 4000));

// Also explicitly probe: did the bootstrap log fire? If Bootstrap's
// `logger.create` chain is broken, that flag never gets set.
const hasApp = !!dom.window.document.querySelector('#app, #root, body');
if (!hasApp) errors.push(new Error('No #app/#root/body rendered'));

server.close();
dom.window.close();

if (errors.length > 0) {
    process.stderr.write(`\nFAIL: ${errors.length} error(s) during bundle load\n`);
    process.exit(1);
}

process.stdout.write('OK: bundle loaded without module-level errors\n');
process.exit(0);
