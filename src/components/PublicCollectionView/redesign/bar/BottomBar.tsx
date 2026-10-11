import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ReceiptText, ScrollText, Utensils } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import type { BottomBarSlotContext } from "../slots";
import styles from "./BottomBar.module.scss";

const VOCI: { id: HubTab; icon: ReactNode; labelKey: string }[] = [
    { id: "menu", icon: <Utensils size={19} strokeWidth={1.9} />, labelKey: "hub.menu" },
    { id: "storia", icon: <ScrollText size={19} strokeWidth={1.9} />, labelKey: "hub.storia" }
];

/**
 * Barra in basso del redesign, solo telefono (≤640 px, via CSS). Capsula Menu/Storia
 * (solo con almeno due pagine) e cerchio dell'ordine (solo con gli ordini al tavolo),
 * staccati. La voce attiva porta icona e nome, le altre solo l'icona; il numero
 * dell'ordine sta accanto all'icona. Niente pulsante delle recensioni: il voto entra
 * con la PR 8. Nascondi/mostra lo decide `useBottomBarAutoHide` (prop `hidden`).
 *
 * Materiale pieno semitrasparente, senza blur, come l'isola: la barra trasla quando
 * si nasconde e su WebKit un blur su un elemento che trasla si ridisegna a ogni
 * fotogramma; accenderlo e spegnerlo ai capi del passaggio (il materiale ibrido di
 * prima) faceva lo scatto. Nascondi/mostra non fa render: solo `data-hidden`.
 */
export default function BottomBar({
    activeTab,
    onTabChange,
    showStoryTab,
    orderVisible,
    selectionCount,
    onOpenOrder,
    hidden
}: BottomBarSlotContext) {
    const { t } = useTranslation("public");
    const wrapRef = useRef<HTMLDivElement>(null);
    const gruppoRef = useRef<HTMLDivElement>(null);
    const vociRef = useRef<Partial<Record<HubTab, HTMLButtonElement | null>>>({});
    const [indicatore, setIndicatore] = useState({ left: 0, width: 0 });

    // Altezza reale → `--pub-bottombar-h` su `main.page`: da qui parte lo spazio in fondo
    // (`--pub-bottom-clearance`, scrim, toast). Non cambia quando la barra si nasconde.
    useEffect(() => {
        const wrap = wrapRef.current;
        const host = wrap?.parentElement;
        if (!wrap || !host || typeof ResizeObserver === "undefined") return;
        const scrivi = () => {
            const h = wrap.offsetHeight;
            if (h > 0) host.style.setProperty("--pub-bottombar-h", `${h}px`);
            else host.style.removeProperty("--pub-bottombar-h");
        };
        scrivi();
        const ro = new ResizeObserver(scrivi);
        ro.observe(wrap);
        return () => {
            ro.disconnect();
            host.style.removeProperty("--pub-bottombar-h");
        };
    }, []);

    // Il fondo morbido scorre tra le voci (transform, la larghezza è di una foglia): si misura la voce attiva.
    const misura = () => {
        const btn = vociRef.current[activeTab];
        if (btn) setIndicatore({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    useLayoutEffect(() => {
        misura();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, showStoryTab]);
    useEffect(() => {
        const gruppo = gruppoRef.current;
        if (!gruppo || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(misura);
        ro.observe(gruppo);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, showStoryTab]);

    return (
        <div
            ref={wrapRef}
            className={styles.wrap}
            data-hidden={hidden ? "true" : undefined}
            inert={hidden}
            aria-hidden={hidden ? true : undefined}
        >
            {showStoryTab && (
                <nav className={styles.capsula} aria-label={t("nav.bottom_aria")}>
                    <div className={styles.gruppo} ref={gruppoRef}>
                        <span
                            className={styles.fondo}
                            style={{ width: indicatore.width, transform: `translateX(${indicatore.left}px)` }}
                            aria-hidden="true"
                        />
                        {VOCI.map(voce => {
                            const attiva = activeTab === voce.id;
                            return (
                                <button
                                    key={voce.id}
                                    ref={el => {
                                        vociRef.current[voce.id] = el;
                                    }}
                                    type="button"
                                    className={styles.voce}
                                    data-active={attiva || undefined}
                                    aria-label={t(voce.labelKey)}
                                    aria-current={attiva ? "page" : undefined}
                                    onClick={() => onTabChange(voce.id)}
                                >
                                    {voce.icon}
                                    {attiva && <span className={styles.nome}>{t(voce.labelKey)}</span>}
                                </button>
                            );
                        })}
                    </div>
                </nav>
            )}

            {orderVisible && (
                <button
                    type="button"
                    className={styles.ordine}
                    aria-label={
                        selectionCount > 0 ? t("fab.cart_aria_count", { count: selectionCount }) : t("fab.cart_aria")
                    }
                    onClick={onOpenOrder}
                >
                    <ReceiptText size={22} strokeWidth={1.9} />
                    {selectionCount > 0 && (
                        <span className={styles.conto} aria-hidden="true">
                            {selectionCount}
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}
