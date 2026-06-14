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

const playerPage = read('src/pages/PlayerPage.js');
assert.doesNotMatch(
    playerPage,
    /if \(clearChain && reason === 'userStop'\)\s*{\s*router\.reset\('\/home'\);\s*return;\s*}/s,
    'PlayerPage userStop should preserve the existing details/slideshow return path'
);

console.log('OK: PR review regressions passed');
