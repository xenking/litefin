const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function appendPathCommand(path, command) {
    let d = path.getAttribute('d') || '';
    if (d) d += ' ';
    d += command;
    path.setAttribute('d', d);
}

function patchPathPrototype(proto) {
    if (!proto) {
        return false;
    }

    let changed = false;

    if (!('pathSegList' in proto)) {
        Object.defineProperty(proto, 'pathSegList', {
            get() {
                const path = this;
                return {
                    appendItem(item) {
                        if (item.type === 'M') {
                            appendPathCommand(path, `M ${item.x} ${item.y}`);
                        } else if (item.type === 'L') {
                            appendPathCommand(path, `L ${item.x} ${item.y}`);
                        } else if (item.type === 'C') {
                            appendPathCommand(path, `C ${item.x1} ${item.y1}, ${item.x2} ${item.y2}, ${item.x} ${item.y}`);
                        }
                        return item;
                    },
                    clear() {
                        path.setAttribute('d', '');
                    }
                };
            },
            configurable: true,
            enumerable: true
        });
        changed = true;
    }

    if (typeof proto.createSVGPathSegMovetoAbs !== 'function') {
        proto.createSVGPathSegMovetoAbs = function (x, y) {
            return { type: 'M', x, y };
        };
        changed = true;
    }

    if (typeof proto.createSVGPathSegLinetoAbs !== 'function') {
        proto.createSVGPathSegLinetoAbs = function (x, y) {
            return { type: 'L', x, y };
        };
        changed = true;
    }

    if (typeof proto.createSVGPathSegCurvetoCubicAbs !== 'function') {
        proto.createSVGPathSegCurvetoCubicAbs = function (x, y, x1, y1, x2, y2) {
            return { type: 'C', x, y, x1, y1, x2, y2 };
        };
        changed = true;
    }

    return changed;
}

export function installSvgPathSegListPolyfill(root = globalThis) {
    const prototypes = [];
    const addPrototype = (proto) => {
        if (proto && !prototypes.includes(proto)) {
            prototypes.push(proto);
        }
    };

    if (root?.SVGPathElement?.prototype) {
        addPrototype(root.SVGPathElement.prototype);
    }

    try {
        const path = root?.document?.createElementNS?.(SVG_NAMESPACE, 'path');
        if (path) {
            addPrototype(Object.getPrototypeOf(path));
        }
    } catch {
        // Some constrained TV engines expose partial SVG DOMs. In that case we
        // still patch the constructor prototype above when it exists.
    }

    return prototypes.reduce((changed, proto) => patchPathPrototype(proto) || changed, false);
}
