#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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

const { MediaHelper } = await import('../src/player/core/MediaHelper.js');

const friendsForcedAudioHls = MediaHelper.buildStreamUrl({
    serverUrl: 'https://jellyfin.example',
    itemId: 'friends-s06e01',
    mediaSource: {
        Id: 'friends-s06e01',
        Container: 'mkv',
        SupportsDirectPlay: false,
        SupportsDirectStream: true,
        TranscodingUrl:
            '/Videos/friends-s06e01/master.m3u8?MediaSourceId=friends-s06e01&AudioStreamIndex=2&VideoCodec=hevc,h264&AudioCodec=aac&AllowVideoStreamCopy=true&AllowAudioStreamCopy=false&TranscodeReasons=DirectPlayError',
        TranscodingSubProtocol: 'hls',
        MediaStreams: [
            { Type: 'Video', Index: 0, Codec: 'hevc', Profile: 'Main 10', VideoRangeType: 'HDR10' },
            { Type: 'Audio', Index: 1, Codec: 'ac3', Language: 'rus', IsDefault: true },
            { Type: 'Audio', Index: 2, Codec: 'dts', Profile: 'DTS-HD MA', Language: 'eng' }
        ]
    },
    authToken: 'token',
    audioStreamIndex: 2,
    forceServerSelectedAudio: true,
    forceVideoCopyHlsVariant: true
});

assert.match(
    friendsForcedAudioHls.url,
    /\/main\.m3u8\?/,
    'Friends forced DTS audio fallback must pin Jellyfin HLS to the video-copy main.m3u8 variant'
);
assert.match(
    friendsForcedAudioHls.url,
    /AllowVideoStreamCopy=true/,
    'Friends forced DTS audio fallback must preserve video copy so HDR stays intact'
);
assert.match(
    friendsForcedAudioHls.url,
    /AllowAudioStreamCopy=false/,
    'Friends forced DTS audio fallback must transcode only the selected unsupported audio'
);

const webosPlayer = read('src/player/core/WebOSPlayer.js');

assert.match(
    webosPlayer,
    /_isNativeHlsStream\(\) \{[\s\S]*this\._currentPlayOptions\?\.isHls && !this\._hlsPlayer/,
    'WebOSPlayer must be able to distinguish native HLS from Hls.js fallback'
);
assert.match(
    webosPlayer,
    /if \(bufferAtStall > HICCUP_BUFFER_THRESHOLD\) \{[\s\S]*if \(this\._isNativeHlsStream\(\)\) \{[\s\S]*native HLS buffer must stay intact[\s\S]*return;[\s\S]*const RECOVERY_COOLDOWN_MS/s,
    'Native HLS healthy-buffer stalls must not arm a seek or pause/play recovery path'
);
assert.match(
    webosPlayer,
    /if \(this\._isNativeHlsStream\(\) && bufferAhead > 0\) \{[\s\S]*avoiding recovery seek to preserve buffer[\s\S]*return;[\s\S]*this\._lastRecoveryKickTime = Date\.now\(\);/s,
    'Native HLS slow-path stalls with buffered data must not seek and drop the HLS buffer'
);

console.log('OK: webOS HDR regressions passed');
