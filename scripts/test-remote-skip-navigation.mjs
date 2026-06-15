import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getChapterAwareSkipAction } from '../src/pages/playerRemoteNavigation.js';

const videoItem = { Type: 'Episode', MediaType: 'Video' };
const audioItem = { Type: 'Audio', MediaType: 'Audio' };
const liveTvItem = { Type: 'TvChannel', MediaType: 'Video' };

const makeChapteredPlayer = (currentPositionTicks) => ({
    getChapters: () => [{ StartPositionTicks: 0 }, { StartPositionTicks: 600000000 }],
    getCurrentPositionTicks: () => currentPositionTicks,
    nextChapter() {},
    previousChapter() {}
});

const firstChapterPlayer = makeChapteredPlayer(300000000);
const lastChapterPlayer = makeChapteredPlayer(700000000);
const tizenEffectiveLastChapterPlayer = {
    getChapters: () => [{ StartPositionTicks: 0 }, { StartPositionTicks: 600000000 }],
    getCurrentPositionTicks: () => 575000000,
    getCurrentChapterIndex(timeTicks) {
        const currentTicks = timeTicks ?? this.getCurrentPositionTicks();
        return currentTicks >= 600000000 ? 1 : 0;
    },
    backendType: 'tizen',
    nextChapter() {},
    previousChapter() {}
};

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: videoItem, player: firstChapterPlayer }),
    'nextChapter',
    'next skip should prefer chapters when a later chapter exists'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: videoItem, player: lastChapterPlayer }),
    'nextTrack',
    'next skip should fall back to the queue at the final chapter'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: videoItem, player: tizenEffectiveLastChapterPlayer }),
    'nextTrack',
    'Tizen next skip should use the effective 3s lookahead before falling back from final chapter to queue'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'previous', item: videoItem, player: lastChapterPlayer }),
    'previousChapter',
    'previous skip should prefer chapters when an earlier chapter exists'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'previous', item: videoItem, player: firstChapterPlayer }),
    'previousChapter',
    'previous skip should keep chapter restart semantics at the first chapter'
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
    getChapterAwareSkipAction({ direction: 'next', item: audioItem, player: firstChapterPlayer }),
    'nextTrack',
    'audio playback should keep track skip semantics even if chapter-like metadata exists'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'next', item: liveTvItem, player: firstChapterPlayer }),
    'nextChannel',
    'live TV should keep channel rocker semantics'
);

assert.equal(
    getChapterAwareSkipAction({ direction: 'previous', item: liveTvItem, player: firstChapterPlayer }),
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
    /onBack\(\) \{[\s\S]*this\._osd\?\.hasBackMenu\?\.\(\)[\s\S]*this\._osd\.handleBack\(\)[\s\S]*this\._stopAndExit\(true, 'remoteBack'\)/,
    'physical Back should close OSD menus first, then exit playback through remoteBack'
);
assert.doesNotMatch(
    playerPageSource,
    /handleBack\?\.\(\{ exitWhenOsdVisible: true \}\)/,
    'physical Back should not route playback exit through the generic OSD exit action'
);
assert.match(
    playerPageSource,
    /router\.reset\('\/home'\)/,
    'user-stop Back flow must reset navigation to the home screen'
);
assert.match(
    playerPageSource,
    /if \(this\.params\.fromSlideshow === 'true'\) \{[\s\S]*router\.back\(\);[\s\S]*return;[\s\S]*if \(clearChain && reason === 'remoteBack'\) \{/,
    'slideshow playback should return to slideshow before physical Back resets normal playback to home'
);

const osdControllerSource = readFileSync(new URL('../src/player/osd/OSDController.js', import.meta.url), 'utf8');
assert.match(
    osdControllerSource,
    /hasBackMenu\(\) \{[\s\S]*return Boolean\(this\.activeMenu && this\.activeMenu\.isVisible\);/,
    'OSDController should expose whether Back can be consumed by an open menu'
);

const webosAdapterSource = readFileSync(new URL('../src/webos/WebOSAdapter.js', import.meta.url), 'utf8');
const webosCaseBody = (key) =>
    webosAdapterSource.match(new RegExp(`case WEBOS_KEYS\\.${key}:([\\s\\S]*?)break;`))?.[1] || '';
const webosNextCase = webosCaseBody('NEXT');
const webosPrevCase = webosCaseBody('PREV');

assert.match(
    webosNextCase,
    /eventBus\.emit\('key:channelUp'/,
    'WebOS NEXT/PageUp must use the channel rocker handler so channelRockerJumpsChapters gates VOD chapter jumps'
);
assert.doesNotMatch(
    webosNextCase,
    /eventBus\.emit\('key:next'/,
    'WebOS NEXT/PageUp must not bypass channelRockerJumpsChapters through key:next'
);
assert.match(
    webosPrevCase,
    /eventBus\.emit\('key:channelDown'/,
    'WebOS PREV/PageDown must use the channel rocker handler so channelRockerJumpsChapters gates VOD chapter jumps'
);
assert.doesNotMatch(
    webosPrevCase,
    /eventBus\.emit\('key:previous'/,
    'WebOS PREV/PageDown must not bypass channelRockerJumpsChapters through key:previous'
);

console.log('remote skip navigation regression checks passed');
