/**
 * ASS/SSA style pre-processing for libjass rendering.
 *
 * The key rule here is conservative mutation: user overrides may change main
 * dialogue typography/placement, but signs, vector drawings, and explicitly
 * positioned typesetting must keep the ASS file's own instructions.
 */

const SIGN_LIKE_STYLE_RE = /(^|[\s_.-])(sign|signs|title|logo|op|ed|kara|karaoke|song|songs|lyric|lyrics|scroll|screen|onscreen|overlay|note|notes)([\s_.-]|$)/i;
const EXPLICIT_POSITION_RE = /\\(?:pos|move|org|clip|iclip)\s*\(/i;
const DRAWING_MODE_RE = /\\p[1-9]\d*/i;
const TOP_OR_MIDDLE_ALIGNMENT_RE = /\\an[4-9]/i;
const MICRO_CUE_MAX_SECONDS = 0.12;
const MICRO_CUE_MAX_GAP_SECONDS = 0.08;
const MICRO_CUE_MIN_RUN_LENGTH = 8;

export function preProcessAssContent(content, options = {}) {
    if (!content) {
        return { content, stylesOverridden: 0, dialogueStyles: new Set(), coalescedSignRuns: 0 };
    }

    const {
        fontFamily = null,
        fontScale = 1.0,
        outlineThickness = null,
        shadowThickness = null,
        dialoguePositionOverride = false,
        bottomOffset = 0,
        verticalPosition = null,
        verticalPositionCustom = null,
        videoHeight = 1080
    } = options;

    const normalizedLines = ensureValidPlayRes(content.split(/\r?\n/));
    const coalesced = coalesceDenseAnimatedTextSigns(normalizedLines);
    const lines = coalesced.lines;
    const metadata = collectAssMetadata(lines);
    const shouldOverrideOutline = outlineThickness !== null && outlineThickness !== undefined;
    const shouldOverrideShadow = shadowThickness !== null && shadowThickness !== undefined;
    const dialoguePlacement = dialoguePositionOverride === true
        ? resolveDialoguePlacement({
            bottomOffset,
            verticalPosition,
            verticalPositionCustom,
            playResY: metadata.playResY,
            videoHeight
        })
        : null;

    let styleFormat = null;
    let eventFormat = null;
    let stylesOverridden = 0;
    let section = '';

    const processedLines = lines.map(line => {
        const trimmed = line.trim();

        if (isSectionHeader(trimmed)) {
            section = trimmed.slice(1, -1).toLowerCase();
            return line;
        }

        if (isStylesSection(section) && trimmed.startsWith('Format:')) {
            styleFormat = parseFormatLine(trimmed);
            return line;
        }

        if (section === 'events' && trimmed.startsWith('Format:')) {
            eventFormat = parseFormatLine(trimmed);
            return line;
        }

        if (isStylesSection(section) && trimmed.startsWith('Style:') && styleFormat) {
            const parts = splitAssFields(line.substring(line.indexOf(':') + 1), styleFormat.length);
            const changed = applyStyleOverrides(parts, styleFormat, {
                fontFamily,
                fontScale,
                outlineThickness,
                shadowThickness,
                shouldOverrideOutline,
                shouldOverrideShadow,
                dialogueStyles: metadata.dialogueStyles,
                normalizedDialogueFontSize: metadata.normalizedDialogueFontSize,
                dialoguePlacement
            });

            if (changed) {
                stylesOverridden++;
            }

            return 'Style: ' + parts.join(',');
        }

        if (trimmed.startsWith('Dialogue:')) {
            const dialogue = parseDialogueLine(line, eventFormat);
            const isMainDialogue = dialogue && isMainDialogueCandidate(dialogue, metadata.styles.get(dialogue.style));
            return stripInlineOverrides(line, {
                fontFamily,
                shouldOverrideOutline: shouldOverrideOutline && (!dialoguePlacement || isMainDialogue),
                shouldOverrideShadow: shouldOverrideShadow && (!dialoguePlacement || isMainDialogue),
                shouldNormalizeFontSize: !!dialoguePlacement && isMainDialogue
            });
        }

        return line;
    });

    return {
        content: processedLines.join('\n'),
        stylesOverridden,
        dialogueStyles: metadata.dialogueStyles,
        coalescedSignRuns: coalesced.runs
    };
}

function ensureValidPlayRes(lines) {
    const nextLines = [...lines];

    const getPlayRes = (key) => {
        const line = nextLines.find(l => new RegExp(`^${key}\\s*:`, 'i').test(l.trim()));
        if (!line) return -1;
        const value = parseInt(line.substring(line.indexOf(':') + 1).trim(), 10);
        return Number.isFinite(value) ? value : 0;
    };

    const resX = getPlayRes('PlayResX');
    const resY = getPlayRes('PlayResY');

    if (resX > 0 && resY > 0) {
        return nextLines;
    }

    // ASS spec defaults. Using video-sized defaults makes fonts authored for
    // classic ASS canvases render too small after libjass scaling.
    const defaults = {
        PlayResX: 384,
        PlayResY: 288
    };

    const scriptInfoIdx = nextLines.findIndex(l => /^\[Script Info\]/i.test(l.trim()));
    const insertAt = scriptInfoIdx !== -1 ? scriptInfoIdx + 1 : 0;

    for (const [key, value] of Object.entries(defaults)) {
        const idx = nextLines.findIndex(l => new RegExp(`^${key}\\s*:`, 'i').test(l.trim()));
        if (idx !== -1) {
            nextLines[idx] = `${key}: ${value}`;
        } else {
            nextLines.splice(insertAt, 0, `${key}: ${value}`);
        }
    }

    return nextLines;
}

function coalesceDenseAnimatedTextSigns(lines) {
    let section = '';
    let eventFormat = null;
    const candidatesByKey = new Map();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (isSectionHeader(trimmed)) {
            section = trimmed.slice(1, -1).toLowerCase();
            continue;
        }

        if (section !== 'events') {
            continue;
        }

        if (trimmed.startsWith('Format:')) {
            eventFormat = parseFormatLine(trimmed);
            continue;
        }

        if (!trimmed.startsWith('Dialogue:')) {
            continue;
        }

        const parsed = parseDialogueForCoalescing(line, eventFormat);
        if (!parsed) {
            continue;
        }

        if (parsed.duration > MICRO_CUE_MAX_SECONDS ||
            parsed.duration <= 0 ||
            DRAWING_MODE_RE.test(parsed.text) ||
            !EXPLICIT_POSITION_RE.test(parsed.text)) {
            continue;
        }

        const visibleText = stripAssTags(parsed.text);
        if (!visibleText || visibleText.length > 120) {
            continue;
        }

        const key = `${parsed.layer}|${parsed.style}|${visibleText}`;
        const entries = candidatesByKey.get(key) || [];
        entries.push({ ...parsed, index: i, visibleText });
        candidatesByKey.set(key, entries);
    }

    const removals = new Set();
    let runs = 0;

    for (const entries of candidatesByKey.values()) {
        entries.sort((a, b) => a.startSeconds - b.startSeconds || a.index - b.index);

        for (let i = 0; i < entries.length;) {
            const run = [entries[i]];
            let endSeconds = entries[i].endSeconds;
            let j = i + 1;

            while (j < entries.length && entries[j].startSeconds - endSeconds <= MICRO_CUE_MAX_GAP_SECONDS) {
                run.push(entries[j]);
                endSeconds = Math.max(endSeconds, entries[j].endSeconds);
                j++;
            }

            if (run.length >= MICRO_CUE_MIN_RUN_LENGTH) {
                const first = run[0];
                const last = run[run.length - 1];
                setField(first.parts, first.format, 'End', last.end);
                lines[first.index] = 'Dialogue: ' + first.parts.join(',');

                for (const entry of run.slice(1)) {
                    removals.add(entry.index);
                }
                runs++;
            }

            i = j;
        }
    }

    return {
        lines: lines.filter((_, index) => !removals.has(index)),
        runs
    };
}

function collectAssMetadata(lines) {
    let section = '';
    let styleFormat = null;
    let eventFormat = null;
    let playResY = 720;
    const styles = new Map();
    const dialogueStyles = new Set();

    for (const line of lines) {
        const trimmed = line.trim();

        if (isSectionHeader(trimmed)) {
            section = trimmed.slice(1, -1).toLowerCase();
            continue;
        }

        if (section === 'script info' && /^PlayResY\s*:/i.test(trimmed)) {
            const value = Number(trimmed.substring(trimmed.indexOf(':') + 1).trim());
            if (Number.isFinite(value) && value > 0) {
                playResY = value;
            }
            continue;
        }

        if (isStylesSection(section)) {
            if (trimmed.startsWith('Format:')) {
                styleFormat = parseFormatLine(trimmed);
            } else if (trimmed.startsWith('Style:') && styleFormat) {
                const parts = splitAssFields(line.substring(line.indexOf(':') + 1), styleFormat.length);
                const name = getField(parts, styleFormat, 'Name');
                if (name) {
                    styles.set(name, {
                        name,
                        alignment: parseInt(getField(parts, styleFormat, 'Alignment'), 10),
                        fontSize: parseFloat(getField(parts, styleFormat, 'Fontsize'))
                    });
                }
            }
            continue;
        }

        if (section === 'events') {
            if (trimmed.startsWith('Format:')) {
                eventFormat = parseFormatLine(trimmed);
            } else if (trimmed.startsWith('Dialogue:')) {
                const dialogue = parseDialogueLine(line, eventFormat);
                if (dialogue && isMainDialogueCandidate(dialogue, styles.get(dialogue.style))) {
                    dialogueStyles.add(dialogue.style);
                }
            }
        }
    }

    const dialogueFontSizes = Array.from(dialogueStyles)
        .map(name => styles.get(name)?.fontSize)
        .filter(size => Number.isFinite(size) && size > 0)
        .sort((a, b) => a - b);
    const normalizedDialogueFontSize = median(dialogueFontSizes);

    return { playResY, styles, dialogueStyles, normalizedDialogueFontSize };
}

function applyStyleOverrides(parts, styleFormat, options) {
    const {
        fontFamily,
        fontScale,
        outlineThickness,
        shadowThickness,
        shouldOverrideOutline,
        shouldOverrideShadow,
        dialogueStyles,
        normalizedDialogueFontSize,
        dialoguePlacement
    } = options;

    let changed = false;

    const name = getField(parts, styleFormat, 'Name');
    const isDialogueStyle = dialogueStyles.has(name);

    const fontIdx = findFieldIndex(styleFormat, 'Fontname');
    if (fontIdx !== -1 && fontFamily) {
        parts[fontIdx] = fontFamily;
        changed = true;
    }

    const sizeIdx = findFieldIndex(styleFormat, 'Fontsize');
    if (sizeIdx !== -1) {
        const originalSize = parseFloat(parts[sizeIdx]);
        const shouldNormalizeSize = dialoguePlacement && isDialogueStyle && Number.isFinite(normalizedDialogueFontSize);
        const shouldScaleSize = fontFamily && fontScale !== 1.0;
        if ((shouldNormalizeSize || Number.isFinite(originalSize)) && (shouldNormalizeSize || shouldScaleSize)) {
            const baseSize = shouldNormalizeSize ? normalizedDialogueFontSize : originalSize;
            parts[sizeIdx] = formatAssNumber(baseSize * fontScale);
            changed = true;
        }
    }

    const outlineIdx = findFieldIndex(styleFormat, 'Outline');
    if (outlineIdx !== -1 && shouldOverrideOutline) {
        parts[outlineIdx] = String(outlineThickness);
        changed = true;
    }

    const shadowIdx = findFieldIndex(styleFormat, 'Shadow');
    if (shadowIdx !== -1 && shouldOverrideShadow) {
        parts[shadowIdx] = String(shadowThickness);
        changed = true;
    }

    const alignmentIdx = findFieldIndex(styleFormat, 'Alignment');
    if (dialoguePlacement && dialoguePlacement.anchor === 'top' && alignmentIdx !== -1 && isDialogueStyle) {
        const topAlignment = toTopAlignment(parts[alignmentIdx]);
        if (topAlignment !== parts[alignmentIdx]) {
            parts[alignmentIdx] = topAlignment;
            changed = true;
        }
    }

    const marginVIdx = findFieldIndex(styleFormat, 'MarginV');
    if (dialoguePlacement && marginVIdx !== -1 && isDialogueStyle) {
        parts[marginVIdx] = dialoguePlacement.marginV;
        changed = true;
    }

    return changed;
}

function stripInlineOverrides(line, options) {
    const { fontFamily, shouldOverrideOutline, shouldOverrideShadow, shouldNormalizeFontSize } = options;

    return line.replace(/\\(fn|fs(?![a-zA-Z])|bord|shad|s?out|s?shad)[^\\})]+(?=[\\})])/g, (match, tag) => {
        if (tag === 'fn') {
            return fontFamily ? '' : match;
        }

        if (tag === 'fs') {
            return shouldNormalizeFontSize ? '' : match;
        }

        if (tag.includes('out') || tag.includes('bord')) {
            return shouldOverrideOutline ? '' : match;
        }

        if (tag.includes('shad')) {
            return shouldOverrideShadow ? '' : match;
        }

        return match;
    });
}

function isMainDialogueCandidate(dialogue, style) {
    if (!dialogue.style || SIGN_LIKE_STYLE_RE.test(dialogue.style)) {
        return false;
    }

    if (style && Number.isFinite(style.alignment) && ![1, 2, 3].includes(style.alignment)) {
        return false;
    }

    if (DRAWING_MODE_RE.test(dialogue.text) ||
        EXPLICIT_POSITION_RE.test(dialogue.text) ||
        TOP_OR_MIDDLE_ALIGNMENT_RE.test(dialogue.text)) {
        return false;
    }

    const visibleText = dialogue.text
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\N/g, ' ')
        .trim();

    return visibleText.length > 0;
}

function parseDialogueLine(line, eventFormat) {
    const format = eventFormat || ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    const parts = splitAssFields(line.substring(line.indexOf(':') + 1), format.length);
    const style = getField(parts, format, 'Style');
    const text = getField(parts, format, 'Text');

    if (!style || text === undefined) {
        return null;
    }

    return { style, text };
}

function parseDialogueForCoalescing(line, eventFormat) {
    const format = eventFormat || ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    const parts = splitAssFields(line.substring(line.indexOf(':') + 1), format.length);
    const style = getField(parts, format, 'Style');
    const text = getField(parts, format, 'Text');
    const start = getField(parts, format, 'Start');
    const end = getField(parts, format, 'End');

    if (!style || text === undefined || !SIGN_LIKE_STYLE_RE.test(style)) {
        return null;
    }

    const startSeconds = parseAssTime(start);
    const endSeconds = parseAssTime(end);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
        return null;
    }

    return {
        parts,
        format,
        layer: getField(parts, format, 'Layer') || '',
        style,
        text,
        end,
        startSeconds,
        endSeconds,
        duration: endSeconds - startSeconds
    };
}

function parseAssTime(value) {
    const match = String(value || '').match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
    if (!match) return NaN;

    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function stripAssTags(text) {
    return String(text || '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[Nh]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function convertPixelsToScriptY(pixelOffset, playResY, videoHeight) {
    const safeVideoHeight = Number.isFinite(Number(videoHeight)) && Number(videoHeight) > 0 ? Number(videoHeight) : 1080;
    const safePlayResY = Number.isFinite(Number(playResY)) && Number(playResY) > 0 ? Number(playResY) : 720;
    return Math.max(0, pixelOffset) * safePlayResY / safeVideoHeight;
}

function resolveDialoguePlacement({ bottomOffset, verticalPosition, verticalPositionCustom, playResY, videoHeight }) {
    const safeVideoHeight = Number.isFinite(Number(videoHeight)) && Number(videoHeight) > 0 ? Number(videoHeight) : 1080;
    const manualBottomOffset = Math.max(0, Number.isFinite(Number(bottomOffset)) ? Number(bottomOffset) : 0);
    const baseVh = safeVideoHeight / 100;

    if (verticalPosition === 'custom') {
        const customPercent = clamp(Number(verticalPositionCustom), 0, 100, 10);
        return {
            anchor: 'bottom',
            marginV: formatAssNumber(convertPixelsToScriptY((customPercent / 100) * safeVideoHeight + manualBottomOffset, playResY, safeVideoHeight))
        };
    }

    const hasVerticalPosition = verticalPosition !== null && verticalPosition !== undefined && verticalPosition !== '';
    const numericPosition = Number(verticalPosition);
    if (hasVerticalPosition && Number.isFinite(numericPosition)) {
        if (numericPosition >= 0) {
            /*
             * Reuse the normal subtitle meaning for top positions:
             *   Top      (0) => just below the top edge
             *   Top Low  (2) => lower from the top
             * For ASS this must be expressed by changing only the selected
             * dialogue styles to top alignment; MarginV then becomes a top margin.
             */
            const topMarginPx = (2 + numericPosition * 5) * baseVh;
            return {
                anchor: 'top',
                marginV: formatAssNumber(convertPixelsToScriptY(topMarginPx, playResY, safeVideoHeight))
            };
        }

        /*
         * Match the normal bottom presets and let the ASS-specific slider add
         * extra lift when the user wants dialogue above the standard positions.
         */
        const bottomPresetPx = (2 + Math.abs(numericPosition + 1) * 5) * baseVh;
        return {
            anchor: 'bottom',
            marginV: formatAssNumber(convertPixelsToScriptY(bottomPresetPx + manualBottomOffset, playResY, safeVideoHeight))
        };
    }

    return {
        anchor: 'bottom',
        marginV: formatAssNumber(convertPixelsToScriptY(manualBottomOffset, playResY, safeVideoHeight))
    };
}

function toTopAlignment(alignment) {
    const numeric = parseInt(alignment, 10);

    if (numeric === 1 || numeric === 4 || numeric === 7) return '7';
    if (numeric === 3 || numeric === 6 || numeric === 9) return '9';

    return '8';
}

function clamp(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

function median(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 1) {
        return values[middle];
    }

    return (values[middle - 1] + values[middle]) / 2;
}

function formatAssNumber(value) {
    if (Math.abs(value - Math.round(value)) < 0.001) {
        return String(Math.round(value));
    }

    return value.toFixed(2).replace(/\.?0+$/, '');
}

function parseFormatLine(line) {
    return line.substring(line.indexOf(':') + 1).split(',').map(s => s.trim());
}

function splitAssFields(raw, expectedCount) {
    const parts = raw.split(',').map(part => part.trim());
    if (expectedCount && parts.length > expectedCount) {
        return [
            ...parts.slice(0, expectedCount - 1),
            parts.slice(expectedCount - 1).join(',')
        ];
    }

    return parts;
}

function getField(parts, format, fieldName) {
    const idx = findFieldIndex(format, fieldName);
    return idx === -1 ? undefined : parts[idx];
}

function setField(parts, format, fieldName, value) {
    const idx = findFieldIndex(format, fieldName);
    if (idx !== -1) {
        parts[idx] = value;
    }
}

function findFieldIndex(format, fieldName) {
    return format.findIndex(name => name.toLowerCase() === fieldName.toLowerCase());
}

function isSectionHeader(line) {
    return line.startsWith('[') && line.endsWith(']');
}

function isStylesSection(section) {
    return section === 'v4+ styles' || section === 'v4 styles';
}
