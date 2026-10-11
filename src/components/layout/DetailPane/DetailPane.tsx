import { ReactNode, useContext, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { DetailPaneHostContext, DetailPaneNavContext, type DetailPaneNav } from "./DetailPaneContext";
import styles from "./DetailPane.module.scss";

/**
 * DetailPane — il dettaglio dal vivo (Officina, D131 «Accanto»): ordine,
 * prenotazione, tavolata, tavolo e cliente si aprono accanto all'elenco,
 * dentro la pagina e senza velo. La board resta viva e si tocca; toccando
 * un'altra card il dettaglio cambia senza chiudersi.
 *
 * Stessa forma di `SystemDrawer` (dentro ci va un `DrawerLayout`), così il
 * contenuto dei dettagli non cambia. Dove si vede:
 *   - da 1024 in su, nella colonna a destra del contenuto (`MainLayout`);
 *   - fra 768 e 1024, sopra il contenuto, con la sidebar che resta;
 *   - al telefono è una pagina, con «‹ backLabel» in alto per tornare.
 * Le conferme (annulla, chiudi tavolo) restano finestre al centro, e i CRUD
 * restano `SystemDrawer`: questo è solo per guardare e agire dal vivo.
 */
export interface DetailPaneProps {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    "aria-labelledby"?: string;
    /** Il nome della pagina sotto, per il ritorno al telefono: «‹ Comande». */
    backLabel: string;
    /** Le frecce ↑ ↓ dell'intestazione: il precedente e il successivo dell'elenco. */
    onPrev?: () => void;
    onNext?: () => void;
    /** «2 di 5» fra le frecce; senza, le frecce restano sole. */
    position?: { index: number; total: number };
}

/** Livelli che stanno sopra e hanno il loro Esc (come `SystemDrawer`), più un drawer modale. */
const LAYER_ABOVE_SELECTOR =
    '[role="menu"][data-state="open"], [role="listbox"][data-state="open"], [role="alertdialog"][data-state="open"], [role="dialog"][aria-modal="true"]';

/** Un livello sopra il pannello, che non sia il pannello stesso (al telefono è modale). */
function layerAbove(pane: HTMLElement | null): boolean {
    return Array.from(document.querySelectorAll(LAYER_ABOVE_SELECTOR)).some(el => el !== pane);
}

/** Dove il fuoco può stare in un pannello modale al telefono. */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const DetailPane = ({
    open,
    onClose,
    children,
    "aria-labelledby": ariaLabelledBy,
    backLabel,
    onPrev,
    onNext,
    position
}: DetailPaneProps) => {
    const { slot, register } = useContext(DetailPaneHostContext);
    const phone = useMediaQuery("(max-width: 767px)");
    const inSlot = !phone && slot !== null;
    const paneRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // Aperto, il fuoco entra nel pannello; chiuso, torna da dove era partito
    // (la card), se c'è ancora e se nel frattempo non è andato altrove.
    useEffect(() => {
        if (!open) return;
        previousActiveElement.current = document.activeElement as HTMLElement | null;
        requestAnimationFrame(() => paneRef.current?.focus({ preventScroll: true }));
        return () => {
            const prev = previousActiveElement.current;
            const lost = document.activeElement === null || document.activeElement === document.body;
            if (prev && lost && document.contains(prev)) prev.focus({ preventScroll: true });
            previousActiveElement.current = null;
        };
    }, [open]);

    // Nella colonna accanto il contenuto si stringe: la pagina lo sa.
    useEffect(() => {
        if (open && inSlot) return register();
    }, [open, inSlot, register]);

    // Al telefono è una pagina sopra tutto: sotto non si scorre.
    useEffect(() => {
        if (!open || !phone) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = original;
        };
    }, [open, phone]);

    // Esc chiude solo se sopra non c'è un menu, una tendina, una conferma o un
    // drawer: quelli hanno il loro Esc. Stato letto in cattura, prima dei
    // livelli (vedi `SystemDrawer`).
    useEffect(() => {
        if (!open) return;
        let blocked = false;
        const readLayers = (e: KeyboardEvent) => {
            if (e.key === "Escape") blocked = layerAbove(paneRef.current);
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || blocked || e.defaultPrevented) return;
            onClose();
        };
        document.addEventListener("keydown", readLayers, { capture: true });
        window.addEventListener("keydown", handleEsc);
        return () => {
            document.removeEventListener("keydown", readLayers, { capture: true });
            window.removeEventListener("keydown", handleEsc);
        };
    }, [open, onClose]);

    // ↑ ↓ da tastiera scorrono l'elenco, come le frecce (D141), quando il
    // fuoco è sul pannello (lo prende aprendosi) o sulle sue frecce. Altrove
    // i tasti restano quelli di sempre: scorrere l'elenco o il dettaglio,
    // muoversi in un campo, in una tendina o in un menù.
    useEffect(() => {
        if (!open || (!onPrev && !onNext)) return;
        const handleArrow = (e: KeyboardEvent) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const target = e.target as HTMLElement | null;
            const onPane = target !== null && (target === paneRef.current || target.closest("[data-detail-nav]") !== null);
            if (!onPane || layerAbove(paneRef.current)) return;
            const go = e.key === "ArrowUp" ? onPrev : onNext;
            if (!go) return;
            e.preventDefault();
            go();
        };
        window.addEventListener("keydown", handleArrow);
        return () => window.removeEventListener("keydown", handleArrow);
    }, [open, onPrev, onNext]);

    // Al telefono il pannello è una pagina modale: Tab gira dentro.
    useEffect(() => {
        if (!open || !phone) return;
        const trap = (e: KeyboardEvent) => {
            const pane = paneRef.current;
            if (e.key !== "Tab" || !pane || layerAbove(pane)) return;
            const items = Array.from(pane.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null);
            if (items.length === 0) {
                e.preventDefault();
                pane.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (!pane.contains(active)) {
                e.preventDefault();
                first.focus();
            } else if (e.shiftKey && (active === first || active === pane)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", trap);
        return () => document.removeEventListener("keydown", trap);
    }, [open, phone]);

    const positionIndex = position?.index;
    const positionTotal = position?.total;
    const nav = useMemo<DetailPaneNav>(
        () => ({
            onPrev,
            onNext,
            position:
                positionIndex !== undefined && positionTotal !== undefined && positionIndex >= 0
                    ? { index: positionIndex, total: positionTotal }
                    : undefined,
            phone,
            backLabel
        }),
        [onPrev, onNext, positionIndex, positionTotal, phone, backLabel]
    );

    if (!open) return null;

    const pane = (
        <div
            ref={paneRef}
            className={styles.pane}
            data-place={phone ? "phone" : inSlot ? "slot" : "fixed"}
            role="dialog"
            aria-modal={phone ? "true" : undefined}
            aria-labelledby={ariaLabelledBy}
            tabIndex={-1}
        >
            <DetailPaneNavContext.Provider value={nav}>{children}</DetailPaneNavContext.Provider>
        </div>
    );

    return createPortal(pane, inSlot && slot ? slot : document.body);
};
