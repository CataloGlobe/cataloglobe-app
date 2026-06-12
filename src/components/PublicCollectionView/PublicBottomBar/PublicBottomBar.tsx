import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, MessageSquareHeart, ShoppingBag } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import { useScrollCollapse } from "../hooks/useScrollCollapse";
import styles from "./PublicBottomBar.module.scss";

/**
 * Bottom nav bar icon-only del sito pubblico — SOLO mobile (≤640px), dietro flag
 * d'ambiente `VITE_PUBLIC_BOTTOM_BAR`. Sostituisce i tab header (HUB_TABS) + i 2 FAB.
 *
 * - 3 tab (menu/eventi/recensioni) con pill attiva che scorre (offsetLeft/width misurati).
 * - Slot carrello separato da divider (non è un tab attivo).
 * - Shrink-on-scroll: riusa `useScrollCollapse` (segnale già usato dai FAB pubblici),
 *   nessun nuovo scroll listener su window è scritto qui dentro. Tap su un'icona riespande.
 * - Dot recensione su MessageSquareHeart guidato dalla stessa condizione del valutaFab
 *   (prop `reviewDot`, derivata da `valutaVisible` nel parent).
 */

type TabDef = { id: HubTab; icon: ReactNode; labelKey: string };

const TABS: TabDef[] = [
    { id: "menu", icon: <BookOpen size={22} strokeWidth={1.9} />, labelKey: "hub.menu" },
    { id: "events", icon: <CalendarDays size={22} strokeWidth={1.9} />, labelKey: "hub.events" },
    { id: "reviews", icon: <MessageSquareHeart size={22} strokeWidth={1.9} />, labelKey: "hub.reviews" },
];

type Props = {
    activeTab: HubTab;
    onTabChange: (tab: HubTab) => void;
    selectionCount: number;
    /** Mostra lo slot carrello. Allineato a `!shouldHideOrderingEntry` del parent. */
    cartVisible: boolean;
    onOpenCart: () => void;
    /** Pallino sull'icona recensioni — stessa condizione del valutaFab (`valutaVisible`). */
    reviewDot: boolean;
    /** Dismiss del dot per la sessione, al tap sulla tab recensioni. */
    onReviewDotDismiss?: () => void;
};

export default function PublicBottomBar({
    activeTab,
    onTabChange,
    selectionCount,
    cartVisible,
    onOpenCart,
    reviewDot,
    onReviewDotDismiss,
}: Props) {
    const { t } = useTranslation("public");

    const groupRef = useRef<HTMLDivElement | null>(null);
    const tabRefs = useRef<Record<HubTab, HTMLButtonElement | null>>({
        menu: null,
        events: null,
        reviews: null,
    });
    const [indicator, setIndicator] = useState<{ left: number; width: number }>({
        left: 0,
        width: 0,
    });

    // Pill attiva: misura il bottone attivo e riposiziona l'indicatore.
    const measure = () => {
        const btn = tabRefs.current[activeTab];
        if (!btn) return;
        setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    };

    useLayoutEffect(() => {
        measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Riallinea su resize del gruppo (rotazione, font swap, ecc.). ResizeObserver ≠ scroll listener.
    useEffect(() => {
        const group = groupRef.current;
        if (!group || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(group);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Shrink-on-scroll dal segnale esistente. forceExpanded riespande al tap.
    const scrolled = useScrollCollapse();
    const [forceExpanded, setForceExpanded] = useState(false);
    useEffect(() => {
        // Tornati in cima (o scroll-up sotto soglia) → reset override.
        if (!scrolled) setForceExpanded(false);
    }, [scrolled]);
    const shrink = scrolled && !forceExpanded;

    const handleTab = (tab: HubTab) => {
        setForceExpanded(true);
        if (tab === "reviews" && reviewDot) onReviewDotDismiss?.();
        onTabChange(tab);
    };

    const handleCart = () => {
        setForceExpanded(true);
        onOpenCart();
    };

    return (
        // Wrapper: posizionamento fisso + centratura + animazione di entrata (opacity/translateY).
        // Lo scale di shrink vive sul `.bar` interno per non collidere col transform dell'entry
        // (animation-fill su transform sovrascriverebbe lo scale del data-shrink).
        <div className={styles.barWrap}>
            <nav className={styles.bar} data-shrink={shrink ? "true" : "false"} aria-label="Navigazione">
                <div className={styles.group} ref={groupRef}>
                <span
                    className={styles.indicator}
                    style={{ left: indicator.left, width: indicator.width }}
                    aria-hidden="true"
                />
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        ref={el => {
                            tabRefs.current[tab.id] = el;
                        }}
                        type="button"
                        className={[styles.tab, activeTab === tab.id ? styles.tabActive : ""]
                            .filter(Boolean)
                            .join(" ")}
                        aria-label={t(tab.labelKey)}
                        aria-current={activeTab === tab.id ? "page" : undefined}
                        onClick={() => handleTab(tab.id)}
                    >
                        {tab.icon}
                        {tab.id === "reviews" && reviewDot && (
                            <span className={styles.dot} aria-hidden="true" />
                        )}
                    </button>
                ))}
            </div>

            {cartVisible && (
                <>
                    <span className={styles.divider} aria-hidden="true" />
                    <button
                        type="button"
                        className={styles.cart}
                        aria-label={t("fab.cart_aria")}
                        onClick={handleCart}
                    >
                        <ShoppingBag size={22} strokeWidth={1.9} />
                        {selectionCount > 0 && (
                            <span className={styles.badge}>{selectionCount}</span>
                        )}
                    </button>
                </>
            )}
            </nav>
        </div>
    );
}
