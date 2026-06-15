export function shouldForceSubtitleOffForPlayback({ subtitleMode, preSelectedSubtitle, resolvedSubtitle }) {
    const hasExplicitSubtitleSelection = preSelectedSubtitle !== null && preSelectedSubtitle !== undefined;
    const hasRestoredSubtitleSelection = resolvedSubtitle !== null && resolvedSubtitle !== undefined;
    return subtitleMode === 'None' && !hasExplicitSubtitleSelection && !hasRestoredSubtitleSelection;
}
