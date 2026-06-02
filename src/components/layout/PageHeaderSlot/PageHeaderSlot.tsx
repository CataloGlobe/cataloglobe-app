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
 * Slot post-refactor breadcrumb: rende SOLO le `actions`.
 * Il titolo/sottotitolo passati via `usePageHeader` vengono ignorati: il
 * nome pagina vive ora nel breadcrumb di navbar. Se non ci sono actions,
 * lo slot non rende alcuna barra (evita lo spazio vuoto).
 *
 * Le 9 pagine che oggi chiamano `usePageHeader({title, subtitle, actions})`
 * NON vanno modificate in questa fase: i campi inutilizzati restano nel
 * config e verranno rimossi in una fase di cleanup successiva.
 */
export function PageHeaderSlot(props: PageHeaderSlotProps) {
    void props;
    const config = useReadPageHeader();

    if (!config?.actions) return null;

    return (
        <div className={styles.slot}>
            <div className={styles.actions}>{config.actions}</div>
        </div>
    );
}
