/**
 * Subtitle track policy shared by SubtitleManager and OSD menus.
 */

export const SECONDARY_SUBTITLE_TEXT_CODECS = new Set([
    'srt', 'subrip',
    'vtt', 'webvtt',
    'ttml', 'dfxp',
    'smi', 'sami',
    'mov_text', 'tx3g',
    'scc', 'sbv', 'ttxt'
]);

export function isSecondarySubtitleTrackRenderable(track) {
    const codec = (track?.Codec || '').toLowerCase();
    return SECONDARY_SUBTITLE_TEXT_CODECS.has(codec);
}

export function filterSecondarySubtitleTracks(tracks) {
    return (Array.isArray(tracks) ? tracks : []).filter(isSecondarySubtitleTrackRenderable);
}
