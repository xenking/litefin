#!/usr/bin/env node

import assert from 'node:assert/strict';

const backingStore = new Map();

globalThis.window = globalThis.window || {};
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

globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
};

const noop = () => {};
globalThis.window.addEventListener = noop;
globalThis.window.removeEventListener = noop;
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

const CardRenderer = (await import('../src/utils/CardRenderer.js')).default;
const DetailsPage = (await import('../src/pages/DetailsPage.js')).default;

const episodeHtml = CardRenderer.createCardHtml(
    {
        Id: 'episode-3',
        Type: 'Episode',
        Name: 'The Fireworks',
        SeriesName: 'Kaguya-sama: Love Is War',
        ParentIndexNumber: 2,
        IndexNumber: 3
    },
    {
        isLandscape: true,
        type: 'episode',
        contextType: 'latest'
    }
);

assert.match(episodeHtml, /class="episode-badge">S02E03</, 'episode badge should remain visible');
assert.match(
    episodeHtml,
    /S02E03 - The Fireworks/,
    'landscape episode text should also include SxxExx next to the episode title'
);

let capturedRowOptions = null;
let playCount = 0;
const fakeDetailsPage = {
    _itemId: 'episode-current',
    _item: { SeasonName: 'Season 1' },
    _virtualRows: {
        'more-from-season-section': {
            centerOnIndex: noop
        }
    },
    _renderMediaCard: (episode) => `<button class="media-card" data-item-id="${episode.Id}"></button>`,
    _renderVirtualRow: (options) => {
        capturedRowOptions = options;
    },
    _play: () => {
        playCount += 1;
    }
};

DetailsPage.prototype._renderMoreFromSeason.call(fakeDetailsPage, [
    { Id: 'episode-previous', Type: 'Episode', Name: 'Previous', IndexNumber: 1 },
    { Id: 'episode-current', Type: 'Episode', Name: 'Current', IndexNumber: 2 }
]);

assert.equal(typeof capturedRowOptions?.onClick, 'function', 'More from Season should handle current-card clicks');

capturedRowOptions.onClick({ dataset: { itemId: 'episode-current' } });
assert.equal(playCount, 1, 'clicking the current More from Season card should start playback');

console.log('OK: details/card regressions passed');
