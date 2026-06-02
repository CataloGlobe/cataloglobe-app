import type { RefObject } from "react";
import { useReadPageHeader } from "@/context/useReadPageHeader";
import styles from "./PageHeaderSlot.module.scss";

interface PageHeaderSlotProps {
    /** Mantenuto per API stabilità (chiamato da MainLayout). Non più usato qui:
     *  l'animazione di shrink al scroll era legata al titolo, eliminato in questa
     *  fase. Verrà rimosso nel cleanup finale del refactor header. */
    scrollContainerRef?: RefObject<HTMLElement | null>;
}

/**
 * Banda contestuale della pagina: rende `leading` (sinistra) + `actions` (destra).
 * Il titolo/sottotitolo passati via `usePageHeader` vengono ignorati (vivono nel
 * NavbarBreadcrumb post-refactor). Se né leading né actions sono presenti, lo
 * slot non rende nulla.
 *
 * Backward compat: le 9 pagine che chiamano `usePageHeader({title, subtitle, actions})`
 * continuano a funzionare (actions-only). Pagine nuove possono passare `leading` per
 * ospitare tab controllati / filtri primari.
 */
export function PageHeaderSlot(props: PageHeaderSlotProps) {
    void props;
    const config = useReadPageHeader();

    if (!config?.leading && !config?.actions) return null;

    return (
        <div className={styles.slot}>
            {config.leading && <div className={styles.leading}>{config.leading}</div>}
            {config.actions && <div className={styles.actions}>{config.actions}</div>}
        </div>
    );
}
