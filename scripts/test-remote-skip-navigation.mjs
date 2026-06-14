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
    /_onRemoteChannelUp\(\) \{[\s\S]*if \(PlayerSettings\.get\('channelRockerJumpsChapters'\)\) \{[\s\S]*direction: 'next'[\s\S]*if \(action === 'nextChapter'\) \{[\s\S]*this\._handleHardwareSkip\('next'\)[\s\S]*if \(action !== 'nextChannel'\)/,
    'channel up rocker must prefer chapters for VOD only when the channel-rocker chapter setting is enabled'
);
assert.match(
    playerPageSource,
    /_onRemoteChannelDown\(\) \{[\s\S]*if \(PlayerSettings\.get\('channelRockerJumpsChapters'\)\) \{[\s\S]*direction: 'previous'[\s\S]*if \(action === 'previousChapter'\) \{[\s\S]*this\._handleHardwareSkip\('previous'\)[\s\S]*if \(action !== 'previousChannel'\)/,
    'channel down rocker must prefer chapters for VOD only when the channel-rocker chapter setting is enabled'
);
assert.match(
    playerPageSource,
    /_onRemoteChannelUp\(\) \{[\s\S]*else if \(this\._item\?\.Type !== 'TvChannel'\) \{[\s\S]*chapter rocker disabled[\s\S]*return;[\s\S]*this\._handleChannelChange\(1\)/,
    'channel up rocker must ignore VOD when the chapter setting is disabled while keeping Live TV channel switching'
);
assert.match(
    playerPageSource,
    /_onRemoteChannelDown\(\) \{[\s\S]*else if \(this\._item\?\.Type !== 'TvChannel'\) \{[\s\S]*chapter rocker disabled[\s\S]*return;[\s\S]*this\._handleChannelChange\(-1\)/,
    'channel down rocker must ignore VOD when the chapter setting is disabled while keeping Live TV channel switching'
);
assert.doesNotMatch(
    playerPageSource,
    /eventBus\.on\('key:channel(?:Up|Down)'/,
    'channel rocker keys must have a single auto-cleaned PlayerPage subscription'
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
assert.match(
    playerPageSource,
    /handleBack\?\.\(\{ exitWhenOsdVisible: true \}\)/,
    'physical Back on the player must exit instead of only hiding visible OSD controls'
);
assert.match(
    playerPageSource,
    /router\.reset\('\/home'\)/,
    'user-stop Back flow must reset navigation to the home screen'
);

const osdControllerSource = readFileSync(new URL('../src/player/osd/OSDController.js', import.meta.url), 'utf8');
assert.match(
    osdControllerSource,
    /exitWhenOsdVisible/,
    'OSD back handling must expose a physical-back mode distinct from internal OSD back'
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
