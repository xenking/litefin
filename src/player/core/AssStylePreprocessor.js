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

export function preProcessAssContent(content, options = {}) {
    if (!content) {
        return { content, stylesOverridden: 0, dialogueStyles: new Set() };
    }

    const {
        fontFamily = null,
        fontScale = 1.0,
        outlineThickness = null,
        shadowThickness = null,
        dialoguePositionOverride = false,
        bottomOffset = 0,
        videoHeight = 1080
    } = options;

    const lines = content.split(/\r?\n/);
    const metadata = collectAssMetadata(lines);
    const shouldOverrideOutline = outlineThickness !== null && outlineThickness !== undefined;
    const shouldOverrideShadow = shadowThickness !== null && shadowThickness !== undefined;
    const shouldOverridePosition = dialoguePositionOverride === true && Number.isFinite(Number(bottomOffset));
    const overrideMarginV = shouldOverridePosition
        ? formatAssNumber(convertPixelsToScriptY(Number(bottomOffset), metadata.playResY, videoHeight))
        : null;

    let styleFormat = null;
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
                overrideMarginV
            });

            if (changed) {
                stylesOverridden++;
            }

            return 'Style: ' + parts.join(',');
        }

        if (trimmed.startsWith('Dialogue:')) {
            return stripInlineOverrides(line, {
                fontFamily,
                shouldOverrideOutline,
                shouldOverrideShadow
            });
        }

        return line;
    });

    return {
        content: processedLines.join('\n'),
        stylesOverridden,
        dialogueStyles: metadata.dialogueStyles
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
                        alignment: parseInt(getField(parts, styleFormat, 'Alignment'), 10)
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

    return { playResY, styles, dialogueStyles };
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
        overrideMarginV
    } = options;

    let changed = false;

    const name = getField(parts, styleFormat, 'Name');

    const fontIdx = findFieldIndex(styleFormat, 'Fontname');
    if (fontIdx !== -1 && fontFamily) {
        parts[fontIdx] = fontFamily;
        changed = true;
    }

    const sizeIdx = findFieldIndex(styleFormat, 'Fontsize');
    if (sizeIdx !== -1 && fontFamily && fontScale !== 1.0) {
        const originalSize = parseFloat(parts[sizeIdx]);
        if (!isNaN(originalSize)) {
            parts[sizeIdx] = (originalSize * fontScale).toFixed(2);
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

    const marginVIdx = findFieldIndex(styleFormat, 'MarginV');
    if (overrideMarginV !== null && marginVIdx !== -1 && dialogueStyles.has(name)) {
        parts[marginVIdx] = overrideMarginV;
        changed = true;
    }

    return changed;
}

function stripInlineOverrides(line, options) {
    const { fontFamily, shouldOverrideOutline, shouldOverrideShadow } = options;

    return line.replace(/\\(fn|bord|shad|s?out|s?shad)[^\\})]+(?=[\\})])/g, (match, tag) => {
        if (tag === 'fn') {
            return fontFamily ? '' : match;
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

function convertPixelsToScriptY(pixelOffset, playResY, videoHeight) {
    const safeVideoHeight = Number.isFinite(Number(videoHeight)) && Number(videoHeight) > 0 ? Number(videoHeight) : 1080;
    const safePlayResY = Number.isFinite(Number(playResY)) && Number(playResY) > 0 ? Number(playResY) : 720;
    return Math.max(0, pixelOffset) * safePlayResY / safeVideoHeight;
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

function findFieldIndex(format, fieldName) {
    return format.findIndex(name => name.toLowerCase() === fieldName.toLowerCase());
}

function isSectionHeader(line) {
    return line.startsWith('[') && line.endsWith(']');
}

function isStylesSection(section) {
    return section === 'v4+ styles' || section === 'v4 styles';
}
