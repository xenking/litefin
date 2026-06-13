export function shouldForceSubtitleOffForPlayback({ subtitleMode, preSelectedSubtitle }) {
    const hasExplicitSubtitleSelection = preSelectedSubtitle !== null && preSelectedSubtitle !== undefined;
    return subtitleMode === 'None' && !hasExplicitSubtitleSelection;
}
