#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const focusManager = read('src/ui/FocusManager.js');
assert.match(
    focusManager,
    /document\.querySelector\('\.page\.loading \.page-loading'\)/,
    'FocusManager should treat only visible loading overlays as active loading'
);
assert.doesNotMatch(
    focusManager,
    /document\.querySelector\('\.page-loading'\)/,
    'FocusManager should not block focusin because a hidden loader node remains in DOM'
);

const virtualCardRow = read('src/components/VirtualCardRow.js');
const scaledExpandedWidthMatches =
    virtualCardRow.match(
        /canExpand \? Math\.round\(600 \* \(this\.modernMultiplier \|\| 1\.0\)\) : this\.itemWidth/g
    ) || [];
assert.ok(
    scaledExpandedWidthMatches.length >= 2,
    'VirtualCardRow centering paths should use scaled expanded width, not fixed 600px'
);
assert.match(
    virtualCardRow,
    /centerOnIndex\(index\) \{[\s\S]*document\.documentElement\.getAttribute\('data-layout-media-rows'\) === 'modern'/,
    'VirtualCardRow centerOnIndex should use the active media rows layout flag'
);
assert.doesNotMatch(
    virtualCardRow,
    /centerOnIndex\(index\) \{[\s\S]*document\.documentElement\.getAttribute\('data-layout'\) === 'modern'/,
    'VirtualCardRow centerOnIndex should not use the stale compatibility layout flag'
);

const scrollController = read('src/ui/ScrollController.js');
assert.match(
    scrollController,
    /elementWidth = canExpand\s*\?\s*Math\.round\(600 \* \(track\.__virtualRow\.modernMultiplier \|\| 1\.0\)\)\s*:\s*track\.__virtualRow\.itemWidth/s,
    'ScrollController should center expanded virtual cards using VirtualCardRow modernMultiplier'
);

const tizenProfile = read('src/api/profiles/TizenProfile.js');
assert.doesNotMatch(
    tizenProfile,
    /const tsCompatibleVideoCodecs = \['h264', 'vc1', 'mpeg2video'\]/,
    'Tizen TS HLS codecs should not advertise VC-1 unconditionally'
);
assert.match(
    tizenProfile,
    /if \(caps\.vc1\) tsCompatibleVideoCodecs\.push\('vc1'\);/,
    'Tizen TS HLS codecs should add VC-1 only when caps.vc1 is true'
);

const jellyfinPlayer = read('src/player/core/JellyfinPlayer.js');
assert.match(
    jellyfinPlayer,
    /enableDts: PlayerSettings\.resolveCompatibilitySetting\('enableDts', caps\?\.dts\)/,
    'JellyfinPlayer should resolve auto DTS settings against device capabilities before boolean use'
);
assert.match(
    jellyfinPlayer,
    /enableTrueHd: PlayerSettings\.resolveCompatibilitySetting\('enableTrueHd', caps\?\.truehd\)/,
    'JellyfinPlayer should resolve auto TrueHD settings against device capabilities before boolean use'
);

const playerPage = read('src/pages/PlayerPage.js');
assert.match(
    playerPage,
    /onBack\(\) \{[\s\S]*if \(this\._osd\?\.hasBackMenu\?\.?\.?\(\)\) \{[\s\S]*this\._osd\.handleBack\(\);[\s\S]*return true;[\s\S]*this\._stopAndExit\(true, 'remoteBack'\);/s,
    'PlayerPage physical Back should close OSD menus first, then route playback exit through remoteBack'
);
assert.doesNotMatch(
    playerPage,
    /if \(clearChain && reason === 'userStop'\)\s*{\s*router\.reset\('\/home'\);\s*return;\s*}/s,
    'PlayerPage userStop should preserve the existing details/slideshow return path'
);
assert.match(
    playerPage,
    /_onRemoteChannelUp\(\) \{[\s\S]*if \(PlayerSettings\.get\('channelRockerJumpsChapters'\)\) \{/,
    'PlayerPage ChannelUp should gate chapter jumps on channelRockerJumpsChapters'
);
assert.match(
    playerPage,
    /_onRemoteChannelDown\(\) \{[\s\S]*if \(PlayerSettings\.get\('channelRockerJumpsChapters'\)\) \{/,
    'PlayerPage ChannelDown should gate chapter jumps on channelRockerJumpsChapters'
);

const webosPlayer = read('src/player/core/WebOSPlayer.js');
assert.match(
    webosPlayer,
    /const retryDelay = Math\.max\(1000, RECOVERY_COOLDOWN_MS - timeSinceLastKick\);/,
    'WebOSPlayer stall cooldown should keep a delayed retry timer'
);
assert.match(
    webosPlayer,
    /if \(inCooldown\) \{[\s\S]*this\._stallTimer = setTimeout\([\s\S]*kickStuckDecoder\('still stalled after recovery cooldown'\);[\s\S]*retryDelay\);[\s\S]*return;/,
    'WebOSPlayer stall cooldown should retry recovery if the decoder remains frozen'
);

const baseCss = read('src/styles/base.css');
assert.doesNotMatch(
    baseCss,
    /:not\([^)]*\s+[^)]*\)/,
    'base.css should not use descendant combinators inside :not() for legacy TV selector engines'
);
assert.match(
    baseCss,
    /html\[data-card-label-align="start"\] \.media-card:not\(\.list-skeleton\) \.card-title/,
    'card label alignment should use legacy-safe simple selectors'
);
assert.match(
    baseCss,
    /\.view-list \.media-card \.card-title,[\s\S]*\.view-list \.media-card \.card-subtitle \{[\s\S]*text-align: start !important;/,
    'list views should override card label alignment without complex :not() selectors'
);

const layoutManager = read('src/ui/LayoutManager.js');
assert.match(
    layoutManager,
    /_resolveBadgeStyle\(style\) \{[\s\S]*this\._mediaRowsLayout === 'modern' \? 'dark' : 'tinted'/,
    'LayoutManager auto badge style should resolve from the active media rows layout'
);
assert.doesNotMatch(
    layoutManager,
    /resolvedStyle = this\._layout === 'modern' \? 'dark' : 'tinted';/,
    'LayoutManager auto badge style should not use stale compatibility layout state'
);

console.log('OK: PR review regressions passed');
