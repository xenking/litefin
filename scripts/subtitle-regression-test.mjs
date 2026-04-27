#!/usr/bin/env node

import assert from 'node:assert/strict';
import { SubtitleParser } from '../src/player/core/SubtitleParser.js';
import { preProcessAssContent } from '../src/player/core/AssStylePreprocessor.js';

const oregairuLikeVtt = `WEBVTT

00:02:32.840 --> 00:02:34.840
{\\fax0.07\\shad0\\blur4\\bord0\\an1\\p1\\c&H2839A0&\\frz330.637\\fscx823.25\\fscy129.25\\pos(-38,87)\\clip(m 2 114 l 725 488 721 368 97 0 5 1)}m 0 0 l 100 0 100 100 0 100{\\p0}

00:02:32.840 --> 00:02:34.840
{\\blur1.1\\fax0.55\\an1\\pos(12,82)}Подготовительные занятия
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

function styleLine(content, name) {
    return content.split(/\r?\n/).find(line => line.startsWith(`Style: ${name},`));
}

function marginV(content, name) {
    return styleLine(content, name).split(',')[21];
}

function dialogueLine(content, text) {
    return content.split(/\r?\n/).find(line => line.includes(text));
}

{
    const cues = SubtitleParser.parse(oregairuLikeVtt);
    assert.equal(cues.length, 1, 'pure ASS vector drawing VTT cue should be dropped');
    assert.equal(cues[0].text, 'Подготовительные занятия');
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        dialoguePositionOverride: true,
        bottomOffset: 600,
        videoHeight: 1080
    });

    assert.equal(marginV(result.content, 'Main-Yahari'), '400', 'plain main dialogue should move to requested bottom offset');
    assert.equal(marginV(result.content, 'Window Sign'), '40', 'vector/sign style should keep original margin');
    assert.equal(marginV(result.content, 'Yahari-OP'), '50', 'OP/lyrics style should keep original margin');
    assert.equal(result.dialogueStyles.has('Main-Yahari'), true);
    assert.equal(result.dialogueStyles.has('Window Sign'), false);
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
    assert.match(styleLine(result.content, 'Main-Yahari'), /Main-Yahari,Arial,48/, 'empty ASS font setting should preserve file font');
    assert.match(dialogueLine(result.content, 'Подготовительные занятия'), /\\bord4\\shad2/, 'inline ASS border/shadow should be preserved when override is off');
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        fontFamily: 'Poppins',
        fontScale: 1.2
    });

    assert.match(styleLine(result.content, 'Main-Yahari'), /Main-Yahari,Poppins,57\.60/, 'explicit ASS font override should still work');
}

{
    const result = preProcessAssContent(oregairuLikeAss, {
        outlineThickness: 0.5,
        shadowThickness: 0.25
    });

    assert.doesNotMatch(dialogueLine(result.content, 'Подготовительные занятия'), /\\bord4\\shad2/, 'inline border/shadow should be stripped only when matching override is on');
}

console.log('OK: subtitle regressions passed');
