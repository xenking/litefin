import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getChapterAwareSkipAction } from '../src/pages/playerRemoteNavigation.js';

const videoItem = { Type: 'Episode', MediaType: 'Video' };
const audioItem = { Type: 'Audio', MediaType: 'Audio' };
const liveTvItem = { Type: 'TvChannel', MediaType: 'Video' };

const chapteredPlayer = {
    getChapters: () => [{ StartPositionTicks: 0 }, { StartPositionTicks: 600000000 }],
    nextChapter() {},
    previousChapter() {}
};

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: videoItem, player: chapteredPlayer }),
    'nextChapter',
    'next skip should prefer chapters when the current video exposes chapters'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'previous', item: videoItem, player: chapteredPlayer }),
    'previousChapter',
    'previous skip should prefer chapters when the current video exposes chapters'
);

assert.equal(
    getChapterAwareSkipAction({
        direction: 'next',
        item: videoItem,
        player: { getChapters: () => [], nextChapter() {} }
    }),
    'nextTrack',
    'next skip should fall back to the queue when no chapters are available'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: audioItem, player: chapteredPlayer }),
    'nextTrack',
    'audio playback should keep track skip semantics even if chapter-like metadata exists'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: liveTvItem, player: chapteredPlayer }),
    'nextChannel',
    'live TV should keep channel rocker semantics'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'previous', item: liveTvItem, player: chapteredPlayer }),
    'previousChannel',
    'live TV should keep channel rocker semantics'
);

const playerPageSource = readFileSync(new URL('../src/pages/PlayerPage.js', import.meta.url), 'utf8');
assert.match(
    playerPageSource,
    /this\.on\('key:next', \(\) => this\._onHardwareNext\(\)\)/,
    'physical next key must use chapter-aware hardware routing'
);
assert.match(
    playerPageSource,
    /this\.on\('key:previous', \(\) => this\._onHardwarePrevious\(\)\)/,
    'physical previous key must use chapter-aware hardware routing'
);
assert.match(
    playerPageSource,
    /onNext: \(\) => this\._onHardwareNext\(\)/,
    'WebOS media session next callback must use chapter-aware hardware routing'
);
assert.match(
    playerPageSource,
    /onPrevious: \(\) => this\._onHardwarePrevious\(\)/,
    'WebOS media session previous callback must use chapter-aware hardware routing'
);

const webosAdapterSource = readFileSync(new URL('../src/webos/WebOSAdapter.js', import.meta.url), 'utf8');
assert.doesNotMatch(
    webosAdapterSource,
    /case WEBOS_KEYS\.NEXT:[\s\S]*?eventBus\.emit\('key:channelUp'/,
    'WebOS NEXT must not emit a second channelUp event after key:next'
);
assert.doesNotMatch(
    webosAdapterSource,
    /case WEBOS_KEYS\.PREV:[\s\S]*?eventBus\.emit\('key:channelDown'/,
    'WebOS PREV must not emit a second channelDown event after key:previous'
);

console.log('remote skip navigation regression checks passed');
