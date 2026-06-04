/**
 * Resolve Jellyfin server-side per-item track preferences.
 *
 * Jellyfin stores the user's last selected streams in item.UserData, but those
 * values can be stale after a media replacement/rescan. Only accept them when
 * the selected stream still exists in the current MediaSource.
 *
 * @param {Object} mediaSource
 * @param {'Audio'|'Subtitle'} type
 * @param {number|undefined|null} index
 * @returns {number|undefined}
 */
export function resolveUserDataTrackIndex(mediaSource, type, index) {
    if (index === undefined || index === null) return undefined;

    const numericIndex = Number(index);
    if (!Number.isFinite(numericIndex)) return undefined;

    if (type === 'Subtitle' && numericIndex < 0) {
        return numericIndex;
    }

    const streams = mediaSource?.MediaStreams || [];
    const exists = streams.some((stream) => stream.Type === type && Number(stream.Index) === numericIndex);

    return exists ? numericIndex : undefined;
}
