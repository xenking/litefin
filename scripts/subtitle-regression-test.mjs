#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SubtitleParser } from '../src/player/core/SubtitleParser.js';
import { buildActiveCuePayload } from '../src/player/core/SubtitleCueUtils.js';
import {
    filterSecondarySubtitleTracks,
    isSecondarySubtitleTrackRenderable
} from '../src/player/core/SubtitleTrackPolicy.js';
import { installSvgPathSegListPolyfill } from '../src/player/core/SvgPathSegPolyfill.js';
import { preProcessAssContent } from '../src/player/core/AssStylePreprocessor.js';

const oregairuLikeVtt = `WEBVTT

00:02:32.840 --> 00:02:34.840
{\\fax0.07\\shad0\\blur4\\bord0\\an1\\p1\\c&H2839A0&\\frz330.637\\fscx823.25\\fscy129.25\\pos(-38,87)\\clip(m 2 114 l 725 488 721 368 97 0 5 1)}m 0 0 l 100 0 100 100 0 100{\\p0}

00:02:32.840 --> 00:02:34.840
{\\blur1.1\\fax0.55\\an1\\pos(12,82)}Подготовительные занятия
`;

const kaguyaOverlapVtt = `WEBVTT

08:03.290 --> 08:06.040
Больше мне не помогай.
И вообще не говори со мной.

08:06.170 --> 08:08.880
Мико, это розыгрыш! Розыгрыш, ясно?!

08:06.220 --> 08:08.680
m 1490 15 l 1910 15 1910 195 1490 195

08:06.220 --> 08:08.680
Розыгрыш
удался!

08:06.220 --> 08:08.680
Розыгрыш
удался!
`;

const oregairuLikeAss = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main-Yahari,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,1
Style: Window Sign,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,40,1
Style: Yahari-OP,Arial,44,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:02:32.84,0:02:34.84,Main-Yahari,,0000,0000,0000,,{\\bord4\\shad2}Подготовительные занятия
Dialogue: 0,0:02:32.84,0:02:34.84,Window Sign,,0000,0000,0000,,{\\an1\\p1\\pos(-38,87)}m 0 0 l 100 0 100 100 0 100{\\p0}
Dialogue: 0,0:02:21.41,0:02:26.00,Yahari-OP,,0000,0000,0000,,Хочу я помечтать...
`;

const denseAnimatedSignAss = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Window Sign,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:02:39.84,0:02:39.88,Window Sign,,0000,0000,0000,,{\\pos(472,234)\\fscx50}Летние курсы\\NЙойоги
Dialogue: 0,0:02:39.88,0:02:39.93,Window Sign,,0000,0000,0000,,{\\pos(472.39,234.01)\\fscx50.06}Летние курсы\\NЙойоги
Dialogue: 0,0:02:39.93,0:02:39.97,Window Sign,,0000,0000,0000,,{\\pos(472.77,234.08)\\fscx50.12}Летние курсы\\NЙойоги
Dialogue: 0,0:02:39.97,0:02:40.01,Window Sign,,0000,0000,0000,,{\\pos(473.1,234.17)\\fscx50.21}Летние курсы\\NЙойоги
Dialogue: 0,0:02:40.01,0:02:40.05,Window Sign,,0000,0000,0000,,{\\pos(473.49,234.22)\\fscx50.28}Летние курсы\\NЙойоги
Dialogue: 0,0:02:40.05,0:02:40.09,Window Sign,,0000,0000,0000,,{\\pos(473.83,234.34)\\fscx50.37}Летние курсы\\NЙойоги
Dialogue: 0,0:02:40.09,0:02:40.13,Window Sign,,0000,0000,0000,,{\\pos(474.23,234.39)\\fscx50.44}Летние курсы\\NЙойоги
Dialogue: 0,0:02:40.13,0:02:40.18,Window Sign,,0000,0000,0000,,{\\pos(474.62,234.45)\\fscx50.5}Летние курсы\\NЙойоги
`;

const mixedDialogueSizeAss = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: MainSmall,Arial,36,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,1
Style: MainLarge,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,1
Style: Screen Sign,Arial,80,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,MainSmall,,0000,0000,0000,,{\\fs24}маленькая строка
Dialogue: 0,0:00:04.00,0:00:06.00,MainLarge,,0000,0000,0000,,большая строка
Dialogue: 0,0:00:07.00,0:00:09.00,Screen Sign,,0000,0000,0000,,{\\pos(100,100)\\fs70}надпись
`;

const missingPlayResAss = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Main,,0000,0000,0000,,hello
`;

function styleLine(content, name) {
    return content.split(/\r?\n/).find((line) => line.startsWith(`Style: ${name},`));
}

function marginV(content, name) {
    return styleLine(content, name).split(',')[21];
}

function alignment(content, name) {
    return styleLine(content, name).split(',')[18];
}

function dialogueLine(content, text) {
    return content.split(/\r?\n/).find((line) => line.includes(text));
}

function dialogueLines(content) {
    return content.split(/\r?\n/).filter((line) => line.startsWith('Dialogue:'));
}

{
    const cues = SubtitleParser.parse(oregairuLikeVtt);
    assert.equal(cues.length, 1, 'pure ASS vector drawing VTT cue should be dropped');
    assert.equal(cues[0].text, 'Подготовительные занятия');
}

{
    const cues = SubtitleParser.parse(kaguyaOverlapVtt);
    assert.equal(
        cues.some((cue) => /^m 1490\b/.test(cue.text)),
        false,
        'ffmpeg/Jellyfin ASS vector path text should be dropped even when \\p tags are gone'
    );

    const active = buildActiveCuePayload(cues, 486.3);
    assert.ok(active, 'overlap window should have active fallback subtitle text');
    assert.equal(
        active.text,
        'Мико, это розыгрыш! Розыгрыш, ясно?!<br>Розыгрыш<br>удался!',
        'text fallback should preserve main dialogue and one deduped sign cue at the same time'
    );
}

{
    const tracks = [
        { Index: 3, Type: 'Subtitle', Codec: 'ass', DisplayTitle: 'Надписи' },
        { Index: 4, Type: 'Subtitle', Codec: 'ass', DisplayTitle: 'Crunchyroll' },
        { Index: 5, Type: 'Subtitle', Codec: 'vtt', DisplayTitle: 'Simple VTT' },
        { Index: 6, Type: 'Subtitle', Codec: 'pgs', DisplayTitle: 'PGS' }
    ];

    assert.equal(
        isSecondarySubtitleTrackRenderable(tracks[0]),
        false,
        'secondary ASS must not silently convert to lossy VTT'
    );
    assert.deepEqual(
        filterSecondarySubtitleTracks(tracks).map((track) => track.Index),
        [5],
        'secondary menu should show only lossless DOM-text renderable subtitle tracks'
    );
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        dialoguePositionOverride: true,
        bottomOffset: 600,
        videoHeight: 1080
    });

    assert.equal(
        marginV(result.content, 'Main-Yahari'),
        '400',
        'plain main dialogue should move to requested bottom offset'
    );
    assert.equal(marginV(result.content, 'Window Sign'), '40', 'vector/sign style should keep original margin');
    assert.equal(marginV(result.content, 'Yahari-OP'), '50', 'OP/lyrics style should keep original margin');
    assert.equal(result.dialogueStyles.has('Main-Yahari'), true);
    assert.equal(result.dialogueStyles.has('Window Sign'), false);
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        dialoguePositionOverride: true,
        bottomOffset: 750,
        verticalPosition: '0',
        videoHeight: 1080
    });

    assert.equal(
        alignment(result.content, 'Main-Yahari'),
        '8',
        'top preset should move only plain main dialogue to top-center alignment'
    );
    assert.equal(
        marginV(result.content, 'Main-Yahari'),
        '14.4',
        'top preset should use a top margin instead of the bottom offset slider'
    );
    assert.equal(alignment(result.content, 'Window Sign'), '2', 'sign style alignment should remain unchanged');
    assert.equal(marginV(result.content, 'Window Sign'), '40', 'sign style margin should remain unchanged');
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        dialoguePositionOverride: true,
        bottomOffset: 1200,
        verticalPosition: '-2',
        videoHeight: 1080
    });

    assert.equal(alignment(result.content, 'Main-Yahari'), '2', 'bottom preset should keep bottom alignment');
    assert.equal(
        marginV(result.content, 'Main-Yahari'),
        '850.4',
        'bottom preset should allow offsets beyond the old 750px cap'
    );
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        dialoguePositionOverride: false,
        bottomOffset: 600,
        videoHeight: 1080,
        outlineThickness: null,
        shadowThickness: null
    });

    assert.equal(marginV(result.content, 'Main-Yahari'), '30', 'position override off should preserve ASS margin');
    assert.match(
        styleLine(result.content, 'Main-Yahari'),
        /Main-Yahari,Arial,48/,
        'empty ASS font setting should preserve file font'
    );
    assert.match(
        dialogueLine(result.content, 'Подготовительные занятия'),
        /\\bord4\\shad2/,
        'inline ASS border/shadow should be preserved when override is off'
    );
}

{
    const result = preProcessAssContent(denseAnimatedSignAss);
    const dialogues = dialogueLines(result.content);

    assert.equal(result.coalescedSignRuns, 1, 'dense sign micro-cues should be coalesced into one run');
    assert.equal(dialogues.length, 1, 'coalesced sign should render as one stable cue instead of many 40ms cues');
    assert.match(dialogues[0], /0:02:39\.84,0:02:40\.18/, 'coalesced sign should span the original animated run');
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        fontFamily: 'Poppins',
        fontScale: 1.2
    });

    assert.match(
        styleLine(result.content, 'Main-Yahari'),
        /Main-Yahari,Poppins,57\.6/,
        'explicit ASS font override should still work'
    );
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        outlineThickness: 0.5,
        shadowThickness: 0.25
    });

    assert.doesNotMatch(
        dialogueLine(result.content, 'Подготовительные занятия'),
        /\\bord4\\shad2/,
        'inline border/shadow should be stripped only when matching override is on'
    );
}

{
    const result = preProcessAssContent(mixedDialogueSizeAss, {
        dialoguePositionOverride: true,
        bottomOffset: 300,
        videoHeight: 1080
    });

    assert.match(
        styleLine(result.content, 'MainSmall'),
        /MainSmall,Arial,48,/,
        'position override should normalize small main dialogue font size'
    );
    assert.match(
        styleLine(result.content, 'MainLarge'),
        /MainLarge,Arial,48,/,
        'position override should normalize large main dialogue font size'
    );
    assert.match(
        styleLine(result.content, 'Screen Sign'),
        /Screen Sign,Arial,80,/,
        'position override should not normalize sign font size'
    );
    assert.doesNotMatch(
        dialogueLine(result.content, 'маленькая строка'),
        /\\fs24/,
        'position override should strip inline font size from main dialogue'
    );
    assert.match(
        dialogueLine(result.content, 'надпись'),
        /\\fs70/,
        'position override should preserve inline font size on positioned signs'
    );
}

{
    const result = preProcessAssContent(missingPlayResAss);
    assert.match(result.content, /PlayResX: 384/, 'missing PlayResX should be patched for libjass');
    assert.match(result.content, /PlayResY: 288/, 'missing PlayResY should be patched for libjass');
}

{
    const trackMenuSource = readFileSync(new URL('../src/player/osd/TrackMenu.js', import.meta.url), 'utf8');
    assert.match(
        trackMenuSource,
        /this\.selectTrack\(parseInt\(btn\.dataset\.index/,
        'TrackMenu selection should use the rendered stream Index, not the raw unfiltered menu index'
    );
    assert.doesNotMatch(
        trackMenuSource,
        /tracks\[menuIndex - 1\]/,
        'TrackMenu must not index the unfiltered raw subtitle list after rendering a filtered secondary list'
    );
}

{
    function FakePathElement() {
        this._attrs = new Map();
    }
    FakePathElement.prototype.getAttribute = function (name) {
        return this._attrs.get(name) || '';
    };
    FakePathElement.prototype.setAttribute = function (name, value) {
        this._attrs.set(name, value);
    };

    const root = {
        document: {
            createElementNS(namespace, tagName) {
                assert.equal(namespace, 'http://www.w3.org/2000/svg');
                assert.equal(tagName, 'path');
                return new FakePathElement();
            }
        }
    };

    const installed = installSvgPathSegListPolyfill(root);
    assert.equal(installed, true, 'polyfill should install without a global SVGPathElement constructor');

    const path = root.document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.pathSegList.appendItem(path.createSVGPathSegMovetoAbs(1490, 15));
    path.pathSegList.appendItem(path.createSVGPathSegLinetoAbs(1910, 15));
    path.pathSegList.appendItem(path.createSVGPathSegCurvetoCubicAbs(10, 20, 30, 40, 50, 60));

    assert.equal(
        path.getAttribute('d'),
        'M 1490 15 L 1910 15 C 30 40, 50 60, 10 20',
        'polyfilled SVG path segment methods should build a valid path d attribute'
    );
}

{
    const jellyfinPlayerSource = readFileSync(new URL('../src/player/core/JellyfinPlayer.js', import.meta.url), 'utf8');
    assert.match(
        jellyfinPlayerSource,
        /_startInitialSubtitleSetup\(this\._currentSubtitleStreamIndex, 'play'\);/,
        'initial subtitle setup should start immediately after backend play resolves'
    );
    assert.doesNotMatch(
        jellyfinPlayerSource,
        /_pendingInitialSubtitleStreamIndex|_deferInitialSubtitleSetup|_flushDeferredInitialSubtitleSetup/,
        'initial ASS subtitle setup must not be deferred behind PLAYING/TIME_UPDATE events'
    );
    assert.doesNotMatch(
        jellyfinPlayerSource,
        /webOS playback starts moving/,
        'webOS subtitles should not wait for decoder movement before renderer setup'
    );

    const assRendererSource = readFileSync(new URL('../src/player/core/ASSRenderer.js', import.meta.url), 'utf8');
    assert.match(
        assRendererSource,
        /this\._tickThrottleMs = 50/,
        'ASS renderer should tick often enough for dense timed signs/dialogue'
    );
    assert.match(
        assRendererSource,
        /addEventListener\('seeked', this\._onSeeked\)/,
        'ASS renderer should immediately tick at the seek target'
    );
}

console.log('OK: subtitle regressions passed');
