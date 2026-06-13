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
        return chapterAction;
    }

    return TRACK_ACTIONS[direction];
}
