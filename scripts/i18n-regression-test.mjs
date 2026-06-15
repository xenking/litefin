#!/usr/bin/env node

import assert from 'node:assert/strict';

const backingStore = new Map();
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
    get length() {
        return backingStore.size;
    },
    key(index) {
        return Array.from(backingStore.keys())[index] ?? null;
    },
    getItem(key) {
        return backingStore.has(key) ? backingStore.get(key) : null;
    },
    setItem(key, value) {
        backingStore.set(key, String(value));
    },
    removeItem(key) {
        backingStore.delete(key);
    }
};

const { i18n, normalizeUiLanguage } = await import('../src/utils/i18n.js');
const { availableLanguages } = await import('../src/locales/languages.js');

assert.deepEqual(
    availableLanguages.map((lang) => lang.value),
    ['en-us', 'ru'],
    'UI language picker should expose only English and Russian'
);

assert.equal(normalizeUiLanguage('en'), 'en-us', 'bare English should use bundled en-us');
assert.equal(normalizeUiLanguage('en_US'), 'en-us', 'legacy underscore English should use bundled en-us');
assert.equal(normalizeUiLanguage('en-gb'), 'en-us', 'removed English variants should use bundled en-us');
assert.equal(normalizeUiLanguage('ru-RU'), 'ru', 'Russian regional variants should use bundled ru');
assert.equal(normalizeUiLanguage('de'), 'en-us', 'removed non-English/Russian languages should fall back to en-us');
assert.equal(normalizeUiLanguage(null), 'en-us', 'missing language should fall back to en-us');

window.location = {
    href: 'file:///media/developer/apps/usr/palm/applications/org.litefin.app/index.html#/home',
    protocol: 'file:'
};
assert.equal(
    i18n._localeUrl('en-us'),
    'file:///media/developer/apps/usr/palm/applications/org.litefin.app/locales/en-us.json',
    'packaged file:// locale URL should ignore hash-router route'
);

window.location = {
    href: 'http://127.0.0.1:8080/#/home',
    protocol: 'http:',
    origin: 'http://127.0.0.1:8080',
    pathname: '/'
};
assert.equal(
    i18n._localeUrl('ru'),
    'http://127.0.0.1:8080/locales/ru.json',
    'dev-server locale URL should ignore hash-router route'
);

console.log('OK: i18n regressions passed');
