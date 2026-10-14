import { useEffect, type RefObject } from "react";

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tiene il Tab dentro `ref` finché `on` è vero: per i fogli che coprono la
 * pagina (sotto 641), dove uscire verso ciò che sta dietro il velo non ha
 * senso. Il Tab dall'ultimo elemento torna al primo, Maiusc+Tab dal primo
 * (o dal contenitore stesso) va all'ultimo.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, on: boolean) {
    useEffect(() => {
        if (!on) return;
        const onKey = (ev: KeyboardEvent) => {
            const box = ref.current;
            if (ev.key !== "Tab" || !box) return;
            const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
                el => !el.closest("[inert]") && el.getClientRects().length > 0
            );
            if (items.length === 0) {
                ev.preventDefault();
                box.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const at = document.activeElement;
            if (!box.contains(at)) {
                ev.preventDefault();
                (ev.shiftKey ? last : first).focus();
            } else if (ev.shiftKey && (at === first || at === box)) {
                ev.preventDefault();
                last.focus();
            } else if (!ev.shiftKey && at === last) {
                ev.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [ref, on]);
}
