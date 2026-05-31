import { useEffect, useRef, type RefObject } from "react";

/**
 * Resize a textarea to fit its content, capped at `maxRows` lines.
 *
 * Reads the textarea's computed `line-height` + vertical padding to derive
 * the cap; falls back to `fontSize * 1.45` when `line-height: normal` makes
 * `parseFloat` return NaN. Past the cap, internal scrolling is enabled.
 */
export function useAutoGrow(
    value: string,
    maxRows: number = 4
): RefObject<HTMLTextAreaElement | null> {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        const computed = window.getComputedStyle(el);
        const lineHeightRaw = parseFloat(computed.lineHeight);
        const fontSize = parseFloat(computed.fontSize) || 14;
        const lineHeight = Number.isFinite(lineHeightRaw)
            ? lineHeightRaw
            : fontSize * 1.45;
        const padding =
            (parseFloat(computed.paddingTop) || 0) +
            (parseFloat(computed.paddingBottom) || 0);
        const maxHeight = lineHeight * maxRows + padding;
        const next = Math.min(el.scrollHeight, maxHeight);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [value, maxRows]);

    return ref;
}
