/**
 * Return the audio streams expected to be visible/selectable to the backend.
 * WebOS can hide passthrough codecs when the user/device has not enabled them,
 * so native audioTracks indices can be shifted compared with Jellyfin streams.
 *
 * @param {Object} args
 * @param {Object} args.mediaSource Jellyfin MediaSource with MediaStreams.
 * @param {string} args.backendType Active backend: webos, tizen, html5, ...
 * @param {boolean} [args.enableDts]
 * @param {boolean} [args.enableTrueHd]
 * @returns {Array} Backend-visible audio streams.
 */
export function getBackendVisibleAudioStreams({
    mediaSource,
    backendType,
    enableDts = false,
    enableTrueHd = false
}) {
    const audioStreams = (mediaSource?.MediaStreams || []).filter((s) => s.Type === 'Audio');

    if (backendType !== 'webos') {
        return audioStreams;
    }

    return audioStreams.filter((track) => {
        const codec = (track.Codec || '').toLowerCase();

        if (codec === 'truehd' && !enableTrueHd) {
            return false;
        }

        if ((codec.includes('dts') || codec === 'dca') && !enableDts) {
            return false;
        }

        return true;
    });
}

/**
 * Convert a Jellyfin audio stream Index to a backend-visible 0-based list index.
 *
 * @param {Object} args
 * @param {number} args.audioStreamIndex Jellyfin MediaStream.Index.
 * @param {Object} args.mediaSource Jellyfin MediaSource with MediaStreams.
 * @param {string} args.backendType Active backend: webos, tizen, html5, ...
 * @param {boolean} [args.enableDts]
 * @param {boolean} [args.enableTrueHd]
 * @returns {number} Backend-visible index, or -1 if hidden/not found.
 */
export function resolveBackendAudioTrackListIndex({
    audioStreamIndex,
    mediaSource,
    backendType,
    enableDts = false,
    enableTrueHd = false
}) {
    if (audioStreamIndex === undefined || audioStreamIndex === null) {
        return -1;
    }

    return getBackendVisibleAudioStreams({
        mediaSource,
        backendType,
        enableDts,
        enableTrueHd
    }).findIndex((track) => Number(track.Index) === Number(audioStreamIndex));
}

/**
 * Resolve a Jellyfin audio MediaStream.Index to the 0-based audio-track output
 * index used by browser/HLS backends.
 *
 * Jellyfin stream indices include video/subtitle streams (e.g. audio streams
 * can be Index 1 and 2), while hls.js/video.audioTracks use an audio-only list
 * (0 and 1). For server-selected HLS sessions, the chosen audio is already
 * baked into the manifest, so the only safe output index is 0.
 *
 * @param {Object} args
 * @param {number} args.audioStreamIndex - Jellyfin MediaStream.Index.
 * @param {Object} args.mediaSource - Jellyfin MediaSource with MediaStreams.
 * @param {number} args.outputTrackCount - hls.audioTracks/video.audioTracks length.
 * @param {string} args.playMethod - DirectPlay, DirectStream, Remux, Transcode.
 * @param {boolean} args.isHls - True for HLS output.
 * @returns {number|null} 0-based output track index, or null if no output track exists.
 */
export function resolveAudioOutputIndex({
    audioStreamIndex,
    mediaSource,
    outputTrackCount,
    playMethod,
    isHls
}) {
    if (audioStreamIndex === undefined || audioStreamIndex === null || audioStreamIndex < 0) {
        return null;
    }

    const trackCount = Number(outputTrackCount) || 0;
    if (trackCount <= 0) return null;

    const serverSelectedHlsAudio = isHls && (
        playMethod === 'Transcode' ||
        playMethod === 'DirectStream'
    );
    if (serverSelectedHlsAudio || trackCount === 1) return 0;

    const audioStreams = (mediaSource?.MediaStreams || []).filter((s) => s.Type === 'Audio');
    const listIndex = audioStreams.findIndex((s) => s.Index === audioStreamIndex);
    if (listIndex >= 0 && listIndex < trackCount) return listIndex;

    // Last-resort compatibility for callers that already pass an audio-only
    // list index instead of Jellyfin's raw stream index.
    if (audioStreamIndex < trackCount) return audioStreamIndex;

    return 0;
}
