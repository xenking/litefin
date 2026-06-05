/**
 * Decide when selected audio must be handled by the Jellyfin server instead of
 * relying on raw DirectPlay/native audioTracks selection.
 *
 * DTS/DCA remains forced through the server-selected path on multi-audio files:
 * WebOS often hides those native tracks or ignores AudioStreamIndex on raw MKV.
 * TrueHD is different: upstream WebOS passthrough support relies on raw
 * DirectPlay/DirectStream, so only force TrueHD when passthrough is disabled.
 *
 * @param {Object} args
 * @param {string} args.selectedAudioCodec Original selected audio codec.
 * @param {number} args.originalAudioStreamCount Count of original audio streams.
 * @param {boolean} [args.forceDirectStream] Explicit caller override.
 * @param {boolean} [args.enableTrueHd] User TrueHD passthrough setting.
 * @returns {boolean}
 */
export function shouldForceServerSelectedAudio({
    selectedAudioCodec,
    originalAudioStreamCount,
    forceDirectStream = false,
    enableTrueHd = false
}) {
    if (forceDirectStream) return true;
    if ((Number(originalAudioStreamCount) || 0) <= 1) return false;

    const codec = (selectedAudioCodec || '').toLowerCase();
    const isDts = codec.includes('dts') || codec === 'dca';
    const isUnsupportedTrueHd = codec === 'truehd' && !enableTrueHd;

    return isDts || isUnsupportedTrueHd;
}
