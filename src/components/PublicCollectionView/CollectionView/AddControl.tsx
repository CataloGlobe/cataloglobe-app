import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./AddControl.module.scss";

type Props = {
    /** Quanti pezzi del piatto sono nell'ordine (tutte le righe). */
    qty: number;
    /** Piatto con scelte: il «+» e il numero aprono la scheda, niente «− n +». */
    hasOptions: boolean;
    onAdd: () => void;
    onRemove: () => void;
    /** Sulla foto a destra, sul riquadro (riga del prezzo) o sulla pagina (righe compatte). */
    place: "photo" | "surface" | "page";
};

const CLOSE_AFTER_MS = 3000;

/**
 * Il «+» per ordinare dalla riga del menù (deciso da Lorenzo il 2026-10-17): leggero finché il
 * piatto non è nell'ordine, poi il numero nel colore dei pulsanti. Toccando il numero si apre
 * «− n +» (con un pezzo il «−» è un cestino), che si richiude dopo 3 secondi o toccando fuori.
 */
export default function AddControl({ qty, hasOptions, onAdd, onRemove, place }: Props) {
    const { t } = useTranslation("public");
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLSpanElement>(null);
    const mainRef = useRef<HTMLButtonElement>(null);
    const plusRef = useRef<HTMLButtonElement>(null);
    // Dove rimettere il fuoco dopo un cambio aperto/chiuso fatto da tastiera.
    const focusNext = useRef<"main" | "plus" | null>(null);
    const stepOpen = open && qty > 0 && !hasOptions;

    const close = useCallback(() => {
        if (rootRef.current?.contains(document.activeElement)) focusNext.current = "main";
        setOpen(false);
    }, []);

    useEffect(() => {
        if (!stepOpen) return;
        // Ogni tocco cambia qty e fa ripartire i 3 secondi.
        const timer = window.setTimeout(close, CLOSE_AFTER_MS);
        const outside = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", outside, true);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener("pointerdown", outside, true);
        };
    }, [stepOpen, qty, close]);

    useEffect(() => {
        const target = focusNext.current === "plus" ? plusRef.current : focusNext.current === "main" ? mainRef.current : null;
        focusNext.current = null;
        target?.focus({ preventScroll: true });
    }, [stepOpen]);

    const handleMain = (e: MouseEvent) => {
        if (qty === 0 || hasOptions) {
            onAdd();
            return;
        }
        // Invio o spazio (detail 0): il fuoco va sul «+» del gruppo appena aperto.
        if (e.detail === 0) focusNext.current = "plus";
        setOpen(true);
    };

    const handleMinus = () => {
        if (qty === 1) close();
        onRemove();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && stepOpen) {
            e.stopPropagation();
            close();
        }
    };

    return (
        // Il tocco qui non deve aprire la scheda del piatto (onClick della riga).
        <span
            ref={rootRef}
            className={`${styles.root} ${styles[place]}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
        >
            {stepOpen ? (
                <span className={styles.stepper} role="group" aria-label={t("selection.in_order_aria", { count: qty })}>
                    <button
                        type="button"
                        className={styles.stepMinus}
                        onClick={handleMinus}
                        aria-label={qty === 1 ? t("selection.remove_aria") : t("selection.decrease_aria")}
                    >
                        {qty === 1 ? <Trash2 size={15} strokeWidth={2.2} /> : <Minus size={15} strokeWidth={2.5} />}
                    </button>
                    <b className={styles.stepQty}>{qty}</b>
                    <button
                        ref={plusRef}
                        type="button"
                        className={styles.stepPlus}
                        onClick={onAdd}
                        aria-label={t("selection.increase_aria")}
                    >
                        <Plus size={15} strokeWidth={2.5} />
                    </button>
                </span>
            ) : (
                <button
                    ref={mainRef}
                    type="button"
                    className={`${styles.main}${qty > 0 ? ` ${styles.on}` : ""}`}
                    onClick={handleMain}
                    aria-label={qty > 0 ? t("selection.in_order_aria", { count: qty }) : t("selection.add_aria")}
                >
                    {qty > 0 ? <b>{qty}</b> : <Plus size={place === "photo" ? 18 : 16} strokeWidth={2.5} />}
                </button>
            )}
        </span>
    );
}
