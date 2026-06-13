#!/usr/bin/env node

import assert from 'node:assert/strict';

const backingStore = new Map();

globalThis.window = globalThis.window || {};
globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
globalThis.window.removeEventListener = globalThis.window.removeEventListener || (() => {});
globalThis.__APP_VERSION__ = 'test';
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
    },
    clear() {
        backingStore.clear();
    }
};

const noop = () => {};
const fakeClassList = {
    add: noop,
    remove: noop,
    contains: () => false,
    toggle: () => false
};

globalThis.document = {
    documentElement: {
        getAttribute: () => '',
        setAttribute: noop,
        style: { setProperty: noop }
    },
    body: {
        classList: fakeClassList,
        appendChild: noop,
        removeChild: noop
    },
    createElement: () => ({
        style: {},
        classList: fakeClassList,
        dataset: {},
        appendChild: noop,
        remove: noop,
        setAttribute: noop,
        addEventListener: noop,
        removeEventListener: noop,
        querySelector: () => null,
        querySelectorAll: () => []
    }),
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => []
};

const HomePage = (await import('../src/pages/HomePage.js')).default;
const { api } = await import('../src/api/index.js');
const { storage } = await import('../src/utils/StorageService.js');

storage.setItem('pref:mergeResumeNextUp', 'true');

const originalApi = {
    getResumeItems: api.getResumeItems,
    getNextUp: api.getNextUp,
    getItems: api.getItems
};

api.getResumeItems = async () => ({
    Items: [
        {
            Id: 'miraculous-resume-id',
            Type: 'Episode',
            Name: 'Stormy Weather',
            SeriesId: 'series-miraculous',
            SeriesName: 'Miraculous: Tales of Ladybug & Cat Noir',
            ParentIndexNumber: 1,
            IndexNumber: 1,
            UserData: {
                PlaybackPositionTicks: 600000000,
                LastPlayedDate: '2026-06-12T10:00:00.000Z'
            }
        }
    ]
});

api.getNextUp = async () => ({
    Items: [
        {
            Id: 'miraculous-nextup-duplicate-id',
            Type: 'Episode',
            Name: 'Stormy Weather',
            SeriesId: 'series-miraculous',
            SeriesName: 'Miraculous: Tales of Ladybug & Cat Noir',
            ParentIndexNumber: 1,
            IndexNumber: 1,
            UserData: {
                PlaybackPositionTicks: 0
            },
            DateCreated: '2026-06-01T00:00:00.000Z'
        },
        {
            Id: 'miraculous-nextup-episode-2',
            Type: 'Episode',
            Name: 'The Bubbler',
            SeriesId: 'series-miraculous',
            SeriesName: 'Miraculous: Tales of Ladybug & Cat Noir',
            ParentIndexNumber: 1,
            IndexNumber: 2,
            UserData: {
                PlaybackPositionTicks: 0
            },
            DateCreated: '2026-06-01T00:00:00.000Z'
        }
    ]
});

api.getItems = async () => ({ Items: [] });

try {
    const descriptors = HomePage.prototype._getRowDescriptors.call({ _libraries: [] });
    const resumeDescriptor = descriptors.find((descriptor) => descriptor.id === 'resume');
    assert.ok(resumeDescriptor, 'Home should expose a Continue Watching descriptor');

    const items = await resumeDescriptor.fetchFn();

    assert.deepEqual(
        items.map((item) => item.Id),
        ['miraculous-resume-id', 'miraculous-nextup-episode-2'],
        'merged Continue Watching should dedupe the same logical episode while keeping the next episode'
    );
} finally {
    Object.assign(api, originalApi);
}

console.log('OK: home resume regressions passed');
