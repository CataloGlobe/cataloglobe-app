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
}

/** Livelli che stanno sopra e hanno il loro Esc (come `SystemDrawer`), più un drawer modale. */
const LAYER_ABOVE_SELECTOR =
    '[role="menu"][data-state="open"], [role="listbox"][data-state="open"], [role="alertdialog"][data-state="open"], [role="dialog"][aria-modal="true"]';

export const DetailPane = ({
    open,
    onClose,
    children,
    "aria-labelledby": ariaLabelledBy,
    backLabel,
    onPrev,
    onNext
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
        let layerAbove = false;
        const readLayers = (e: KeyboardEvent) => {
            if (e.key === "Escape") layerAbove = document.querySelector(LAYER_ABOVE_SELECTOR) !== null;
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || layerAbove || e.defaultPrevented) return;
            onClose();
        };
        document.addEventListener("keydown", readLayers, { capture: true });
        window.addEventListener("keydown", handleEsc);
        return () => {
            document.removeEventListener("keydown", readLayers, { capture: true });
            window.removeEventListener("keydown", handleEsc);
        };
    }, [open, onClose]);

    const nav = useMemo<DetailPaneNav>(
        () => ({ onPrev, onNext, phone, backLabel }),
        [onPrev, onNext, phone, backLabel]
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
