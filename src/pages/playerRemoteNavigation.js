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

function getCurrentChapterIndex(chapters, player) {
    if (!Array.isArray(chapters) || chapters.length === 0) {
        return -1;
    }

    if (typeof player?.getCurrentChapterIndex === 'function') {
        const index = Number(player.getCurrentChapterIndex());
        if (Number.isInteger(index)) {
            return index;
        }
    }

    if (typeof player?.getCurrentPositionTicks !== 'function') {
        return null;
    }

    const currentTicks = Number(player.getCurrentPositionTicks());
    if (!Number.isFinite(currentTicks)) {
        return null;
    }

    for (let index = chapters.length - 1; index >= 0; index--) {
        const startTicks = Number(chapters[index]?.StartPositionTicks || 0);
        if (currentTicks >= startTicks) {
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
