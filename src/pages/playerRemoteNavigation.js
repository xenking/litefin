const TRACK_ACTIONS = {
    next: 'nextTrack',
    previous: 'previousTrack'
};

const CHAPTER_ACTIONS = {
    next: 'nextChapter',
    previous: 'previousChapter'
};

const CHANNEL_ACTIONS = {
    next: 'nextChannel',
    previous: 'previousChannel'
};

const TIZEN_CHAPTER_LOOKAHEAD_TICKS = 30000000;

function getEffectiveChapterPositionTicks(player) {
    if (typeof player?.getCurrentPositionTicks !== 'function') {
        return null;
    }

    const currentTicks = Number(player.getCurrentPositionTicks());
    if (!Number.isFinite(currentTicks)) {
        return null;
    }

    return player?.backendType === 'tizen' ? currentTicks + TIZEN_CHAPTER_LOOKAHEAD_TICKS : currentTicks;
}

function getCurrentChapterIndex(chapters, player) {
    if (!Array.isArray(chapters) || chapters.length === 0) {
        return -1;
    }

    const effectiveTicks = getEffectiveChapterPositionTicks(player);

    if (typeof player?.getCurrentChapterIndex === 'function') {
        const index = Number(player.getCurrentChapterIndex(effectiveTicks ?? undefined));
        if (Number.isInteger(index)) {
            return index;
        }
    }

    if (effectiveTicks === null) {
        return null;
    }

    for (let index = chapters.length - 1; index >= 0; index--) {
        const startTicks = Number(chapters[index]?.StartPositionTicks || 0);
        if (effectiveTicks >= startTicks) {
            return index;
        }
    }

    return -1;
}

export function getChapterAwareSkipAction({ direction, item, player }) {
    if (direction !== 'next' && direction !== 'previous') {
        throw new Error(`Unsupported skip direction: ${direction}`);
    }

    if (item?.Type === 'TvChannel') {
        return CHANNEL_ACTIONS[direction];
    }

    const isAudio = item?.MediaType === 'Audio' || item?.Type === 'AudioBook';
    if (isAudio) {
        return TRACK_ACTIONS[direction];
    }

    const chapterAction = CHAPTER_ACTIONS[direction];
    const chapters = typeof player?.getChapters === 'function' ? player.getChapters() : [];
    if (Array.isArray(chapters) && chapters.length > 1 && typeof player?.[chapterAction] === 'function') {
        const currentChapterIndex = getCurrentChapterIndex(chapters, player);
        if (
            direction === 'next' &&
            typeof currentChapterIndex === 'number' &&
            currentChapterIndex >= chapters.length - 1
        ) {
            return TRACK_ACTIONS.next;
        }

        return chapterAction;
    }

    return TRACK_ACTIONS[direction];
}
