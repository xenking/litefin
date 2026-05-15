/*
 * TrackFingerprint — stable, cross-episode identity for audio/subtitle streams.
 *
 * When the user picks an audio or subtitle track in one episode, we want to
 * re-apply the same pick on the next episode of the same season. The stream
 * Index is unreliable across episodes (ffprobe order can differ per container),
 * so we match on human-meaningful properties instead.
 *
 * Scoring rules (see findMatchingStream):
 *   Language         +5   (primary key — same "eng" / "jpn" is the dominant signal)
 *   Title match      +4   (release-group titles like "[Dub]" or "[Signs & Songs]")
 *   Codec match      +3
 *   Channel count    +2   (audio only)
 *   ChannelLayout    +1   (audio only)
 *   Default flag     +0.75 (tie-breaker for main-vs-commentary audio)
 *   Forced flag      +0.5
 *
 * Require score ≥ 5 to accept (language alone is enough).
 */

/**
 * Build a fingerprint for a given MediaStream object.
 * Returns null for falsy input.
 */
export function fingerprintStream(stream) {
    if (!stream) return null;
    return {
        type: stream.Type,
        language: (stream.Language || '').toLowerCase(),
        codec: (stream.Codec || '').toLowerCase(),
        channels: Number(stream.Channels) || 0,
        channelLayout: (stream.ChannelLayout || '').toLowerCase(),
        title: (stream.Title || stream.DisplayTitle || '').toLowerCase(),
        isForced: !!stream.IsForced,
        isDefault: !!stream.IsDefault
    };
}

/**
 * Find the stream in `streams` that best matches fingerprint `fp`.
 * Returns the matching stream object or null if no candidate clears the threshold.
 *
 * @param {Array} streams       Array of MediaStream objects.
 * @param {'Audio'|'Subtitle'} type  Stream type to search within.
 * @param {Object} fp           Fingerprint produced by fingerprintStream().
 */
export function findMatchingStream(streams, type, fp) {
    if (!fp || !Array.isArray(streams) || streams.length === 0) return null;

    const candidates = streams.filter((s) => s.Type === type);
    if (candidates.length === 0) return null;

    let best = null;
    let bestScore = -1;

    for (const s of candidates) {
        const sLang = (s.Language || '').toLowerCase();
        const sCodec = (s.Codec || '').toLowerCase();
        const sLayout = (s.ChannelLayout || '').toLowerCase();
        const sTitle = (s.Title || s.DisplayTitle || '').toLowerCase();
        const sChannels = Number(s.Channels) || 0;

        let score = 0;
        if (fp.language && sLang && sLang === fp.language) score += 5;
        if (fp.title && sTitle && sTitle === fp.title) score += 4;
        if (fp.codec && sCodec && sCodec === fp.codec) score += 3;
        if (type === 'Audio') {
            if (fp.channels && sChannels && sChannels === fp.channels) score += 2;
            if (fp.channelLayout && sLayout && sLayout === fp.channelLayout) score += 1;
        }
        if (fp.isDefault === !!s.IsDefault) score += 0.75;
        if (fp.isForced === !!s.IsForced) score += 0.5;

        if (score > bestScore) {
            bestScore = score;
            best = s;
        }
    }

    return bestScore >= 5 ? best : null;
}
