#!/usr/bin/env node

import assert from 'node:assert/strict';
import { fingerprintStream, findMatchingStream } from '../src/utils/TrackFingerprint.js';
import { resolveUserDataTrackIndex } from '../src/utils/TrackPreferenceResolver.js';

const backingStore = new Map();
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
    get length() { return backingStore.size; },
    key(index) { return Array.from(backingStore.keys())[index] ?? null; },
    getItem(key) { return backingStore.has(key) ? backingStore.get(key) : null; },
    setItem(key, value) { backingStore.set(key, String(value)); },
    removeItem(key) { backingStore.delete(key); }
};

{
    const picked = {
        Type: 'Audio',
        Index: 2,
        Language: 'eng',
        Codec: 'aac',
        Channels: 2,
        ChannelLayout: 'stereo',
        IsDefault: false,
        IsForced: false
    };

    const nextEpisodeStreams = [
        {
            Type: 'Audio',
            Index: 1,
            Language: 'eng',
            Codec: 'aac',
            Channels: 2,
            ChannelLayout: 'stereo',
            IsDefault: true,
            IsForced: false
        },
        {
            Type: 'Audio',
            Index: 2,
            Language: 'eng',
            Codec: 'aac',
            Channels: 2,
            ChannelLayout: 'stereo',
            IsDefault: false,
            IsForced: false
        }
    ];

    const match = findMatchingStream(nextEpisodeStreams, 'Audio', fingerprintStream(picked));

    assert.equal(
        match?.Index,
        2,
        'season audio memory should preserve non-default audio when language/codec/channels are otherwise identical'
    );
}

{
    const { saveSeasonPref, loadSeasonPref } = await import('../src/utils/SeasonTrackPrefStore.js');

    const serverUrl = 'https://jellyfin.example';
    const userId = 'user-a';
    const seasonId = 'friends-season-1';
    const pickedAudio = fingerprintStream({
        Type: 'Audio',
        Index: 2,
        Language: 'eng',
        Codec: 'aac',
        Channels: 2,
        ChannelLayout: 'stereo',
        IsDefault: false,
        IsForced: false
    });
    const pickedSubtitle = fingerprintStream({
        Type: 'Subtitle',
        Index: 5,
        Language: 'eng',
        Codec: 'subrip',
        Title: 'English',
        IsDefault: false,
        IsForced: false
    });

    saveSeasonPref(serverUrl, userId, seasonId, { audio: pickedAudio });
    saveSeasonPref(serverUrl, userId, seasonId, { subtitle: pickedSubtitle });

    const loaded = loadSeasonPref(serverUrl, userId, seasonId);

    assert.equal(loaded.audio.language, 'eng', 'saved season audio fingerprint should load');
    assert.equal(loaded.audio.isDefault, false, 'saved season audio should preserve non-default flag');
    assert.equal(loaded.subtitle.codec, 'subrip', 'saved season subtitle fingerprint should merge without erasing audio');
}

{
    const { resolveAudioOutputIndex, resolveBackendAudioTrackListIndex } = await import('../src/player/core/AudioTrackMapper.js');
    const mediaSource = {
        MediaStreams: [
            { Type: 'Video', Index: 0 },
            { Type: 'Audio', Index: 1, Language: 'eng' },
            { Type: 'Audio', Index: 2, Language: 'eng' }
        ]
    };

    assert.equal(
        resolveAudioOutputIndex({
            audioStreamIndex: 2,
            mediaSource,
            outputTrackCount: 2,
            playMethod: 'DirectPlay',
            isHls: true
        }),
        1,
        'initial HTML/HLS audio selection should map Jellyfin stream index to audio-track list index'
    );

    assert.equal(
        resolveAudioOutputIndex({
            audioStreamIndex: 2,
            mediaSource,
            outputTrackCount: 1,
            playMethod: 'DirectStream',
            isHls: true
        }),
        0,
        'server-selected HLS audio should keep the only output track enabled'
    );

    const trueHdHiddenMediaSource = {
        MediaStreams: [
            { Type: 'Video', Index: 0 },
            { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'truehd' },
            { Type: 'Audio', Index: 2, Language: 'eng', Codec: 'ac3' },
            { Type: 'Audio', Index: 3, Language: 'jpn', Codec: 'ac3' }
        ]
    };

    assert.equal(
        resolveBackendAudioTrackListIndex({
            audioStreamIndex: 2,
            mediaSource: trueHdHiddenMediaSource,
            backendType: 'webos',
            enableTrueHd: false
        }),
        0,
        'webOS native track index should skip hidden disabled TrueHD track'
    );

    assert.equal(
        resolveBackendAudioTrackListIndex({
            audioStreamIndex: 2,
            mediaSource: trueHdHiddenMediaSource,
            backendType: 'webos',
            enableTrueHd: true
        }),
        1,
        'webOS native track index should keep TrueHD in the list when passthrough is enabled'
    );
}

{
    const friendsS06E01MediaSource = {
        Id: 'friends-s06e01',
        Container: 'mkv',
        SupportsDirectPlay: true,
        SupportsDirectStream: true,
        DefaultAudioStreamIndex: 1,
        MediaStreams: [
            { Type: 'Video', Index: 0 },
            { Type: 'Audio', Index: 1, Language: 'rus', Codec: 'ac3', IsDefault: true },
            { Type: 'Audio', Index: 2, Language: 'eng', Codec: 'dts', Profile: 'DTS-HD MA', IsDefault: false },
            { Type: 'Subtitle', Index: 3, Language: 'rus', Codec: 'subrip' }
        ]
    };

    assert.equal(
        resolveUserDataTrackIndex(friendsS06E01MediaSource, 'Audio', 2),
        2,
        'Jellyfin UserData audio preference should restore the saved non-default DTS-HD MA track'
    );

    assert.equal(
        resolveUserDataTrackIndex(friendsS06E01MediaSource, 'Audio', 99),
        undefined,
        'stale UserData audio preference should be ignored after media replacement/rescan'
    );

    const { shouldForceServerSelectedAudio } = await import('../src/player/core/AudioFallbackPolicy.js');
    const { MediaHelper } = await import('../src/player/core/MediaHelper.js');
    assert.equal(
        shouldForceServerSelectedAudio({
            selectedAudioCodec: 'dts',
            originalAudioStreamCount: 2,
            enableTrueHd: true
        }),
        true,
        'multi-audio DTS should still force server-selected audio fallback'
    );

    assert.equal(
        shouldForceServerSelectedAudio({
            selectedAudioCodec: 'truehd',
            originalAudioStreamCount: 2,
            enableTrueHd: true
        }),
        false,
        'TrueHD passthrough enabled should not force audio transcode/remux'
    );

    assert.equal(
        shouldForceServerSelectedAudio({
            selectedAudioCodec: 'truehd',
            originalAudioStreamCount: 2,
            enableTrueHd: false
        }),
        true,
        'TrueHD passthrough disabled should force server-selected audio fallback'
    );

    const streamInfo = MediaHelper.buildStreamUrl({
        serverUrl: 'https://jellyfin.example',
        itemId: 'friends-s06e01',
        mediaSource: friendsS06E01MediaSource,
        authToken: 'token',
        audioStreamIndex: 2,
        forceServerSelectedAudio: true
    });

    assert.match(
        streamInfo.url,
        /Static=false/,
        'forced DTS audio fallback must not use raw Static=true MKV'
    );

    const streamInfoWithRewrittenDefault = MediaHelper.buildStreamUrl({
        serverUrl: 'https://jellyfin.example',
        itemId: 'friends-s06e01',
        mediaSource: {
            Id: 'friends-s06e01',
            Container: 'mkv',
            SupportsDirectPlay: true,
            SupportsDirectStream: true,
            DefaultAudioStreamIndex: 2
        },
        authToken: 'token',
        audioStreamIndex: 2,
        forceServerSelectedAudio: true
    });

    assert.match(
        streamInfoWithRewrittenDefault.url,
        /Static=false/,
        'forced server-selected audio must survive PlaybackInfo default rewrite'
    );

    const streamInfoWithSelectedSingleReturnedAudio = MediaHelper.buildStreamUrl({
        serverUrl: 'https://jellyfin.example',
        itemId: 'friends-s06e01',
        mediaSource: {
            Id: 'friends-s06e01',
            Container: 'mkv',
            SupportsDirectPlay: true,
            SupportsDirectStream: true,
            DefaultAudioStreamIndex: 2,
            MediaStreams: [
                { Type: 'Video', Index: 0 },
                { Type: 'Audio', Index: 2, Language: 'eng', Codec: 'dts', Profile: 'DTS-HD MA', IsDefault: true }
            ]
        },
        authToken: 'token',
        audioStreamIndex: 2,
        forceServerSelectedAudio: true
    });

    assert.match(
        streamInfoWithSelectedSingleReturnedAudio.url,
        /Static=false/,
        'caller force must override single-audio PlaybackInfo result after default rewrite'
    );

    const trueHdPassthroughStreamInfo = MediaHelper.buildStreamUrl({
        serverUrl: 'https://jellyfin.example',
        itemId: 'truehd-movie',
        mediaSource: {
            Id: 'truehd-movie',
            Container: 'mkv',
            SupportsDirectPlay: true,
            SupportsDirectStream: true,
            DefaultAudioStreamIndex: 1,
            MediaStreams: [
                { Type: 'Video', Index: 0, Codec: 'hevc' },
                { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'ac3', IsDefault: true },
                { Type: 'Audio', Index: 2, Language: 'eng', Codec: 'truehd', IsDefault: false }
            ]
        },
        authToken: 'token',
        audioStreamIndex: 2,
        forceServerSelectedAudio: false
    });

    assert.match(
        trueHdPassthroughStreamInfo.url,
        /Static=true/,
        'TrueHD passthrough path should keep raw Static=true DirectPlay when not forced'
    );

    const animeAacStreamInfo = MediaHelper.buildStreamUrl({
        serverUrl: 'https://jellyfin.example',
        itemId: 'jjk-s01e07',
        mediaSource: {
            Id: 'jjk-s01e07',
            Container: 'mkv',
            SupportsDirectPlay: true,
            SupportsDirectStream: true,
            DefaultAudioStreamIndex: 1,
            MediaStreams: [
                { Type: 'Video', Index: 0, Codec: 'h264' },
                { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'aac', IsDefault: true },
                { Type: 'Audio', Index: 2, Language: 'jpn', Codec: 'aac', IsDefault: false }
            ]
        },
        authToken: 'token',
        audioStreamIndex: 2
    });

    assert.match(
        animeAacStreamInfo.url,
        /Static=true/,
        'ordinary multi-audio AAC anime should keep raw Static=true DirectPlay'
    );
}

console.log('OK: track preference regressions passed');
