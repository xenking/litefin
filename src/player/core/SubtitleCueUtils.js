/**
 * Utilities for DOM-text subtitle fallback rendering.
 *
 * ASS/libjass is the preferred path for complex anime subtitles. When we are
 * forced into text fallback, overlapping cues still must not erase dialogue.
 */

export function buildActiveCuePayload(cues, currentTimeSeconds) {
    if (!Array.isArray(cues) || cues.length === 0) {
        return null;
    }

    const active = [];

    for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        if (currentTimeSeconds >= cue.start && currentTimeSeconds <= cue.end && cue.text?.trim()) {
            active.push({ cue, index: i });
        }
    }

    if (active.length === 0) {
        return null;
    }

    const texts = [];
    const seenTexts = new Set();
    let maxEnd = currentTimeSeconds;

    for (const { cue } of active) {
        const normalizedText = cue.text.trim();
        if (seenTexts.has(normalizedText)) {
            maxEnd = Math.max(maxEnd, cue.end);
            continue;
        }

        seenTexts.add(normalizedText);
        texts.push(normalizedText);
        maxEnd = Math.max(maxEnd, cue.end);
    }

    if (texts.length === 0) {
        return null;
    }

    const key = active
        .map(({ cue }) => `${cue.start}:${cue.end}:${cue.text}`)
        .join('|');

    return {
        key,
        text: texts.join('<br>'),
        duration: Math.max(0, maxEnd - currentTimeSeconds) * 1000,
        firstIndex: active[0].index
    };
}
