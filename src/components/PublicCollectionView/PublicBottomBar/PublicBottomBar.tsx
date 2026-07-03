import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BookOpen, CalendarDays, MessageSquareHeart, ShoppingBag } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import { useScrollCollapse } from "../hooks/useScrollCollapse";
import styles from "./PublicBottomBar.module.scss";

/**
 * Bottom nav bar icon-only del sito pubblico — SOLO mobile (≤640px), montata in
 * public via split CSS-driven. Sostituisce i tab header (HUB_TABS) + le azioni desktop.
 *
 * - 3 tab (menu/eventi/recensioni) con pill attiva che scorre (offsetLeft/width misurati).
 * - Slot carrello separato da divider (non è un tab attivo).
 * - Shrink-on-scroll: riusa `useScrollCollapse` (segnale già usato dai FAB pubblici),
 *   nessun nuovo scroll listener su window è scritto qui dentro. Tap su un'icona riespande.
 * - Dot recensione su MessageSquareHeart guidato dalla stessa condizione del valutaFab
 *   (prop `reviewDot`, derivata da `valutaVisible` nel parent).
 */

type TabDef = { id: HubTab; icon: ReactNode; labelKey: string };

// ⚠️ Visibilità tab "events" sincronizzata con PublicCollectionHeader.tsx (stesso filtro)
const TABS: TabDef[] = [
    { id: "menu", icon: <BookOpen size={19} strokeWidth={1.9} />, labelKey: "hub.menu" },
    { id: "events", icon: <CalendarDays size={19} strokeWidth={1.9} />, labelKey: "hub.events" },
    { id: "reviews", icon: <MessageSquareHeart size={19} strokeWidth={1.9} />, labelKey: "hub.reviews" },
];

type Props = {
    activeTab: HubTab;
    onTabChange: (tab: HubTab) => void;
    /** Mostra la tab "events". Default true (retrocompatibile). Sincronizzato con PublicCollectionHeader. */
    showEventsTab?: boolean;
    selectionCount: number;
    /** Mostra lo slot assistenza. Dipende dalla sessione tavolo (indipendente da ordering maintenance). */
    supportVisible: boolean;
    onOpenSupport: () => void;
    /** Mostra lo slot carrello. Allineato a `!shouldHideOrderingEntry` del parent. */
    cartVisible: boolean;
    onOpenCart: () => void;
    /** Pallino sull'icona recensioni — stessa condizione del valutaFab (`valutaVisible`). */
    reviewDot: boolean;
    /** Dismiss del dot per la sessione, al tap sulla tab recensioni. */
    onReviewDotDismiss?: () => void;
    /** True quando una sheet (dettaglio prodotto o ordine) è aperta: congela lo shrink
     *  per evitare il flicker dovuto al body scroll-lock che azzera window.scrollY. */
    isSheetOpen?: boolean;
    /** Luminanza dello stile pagina → vetro chiaro/scuro. Default "dark" (comportamento storico). */
    surfaceTheme?: "light" | "dark";
    /** Solo Style Editor preview: barra montata per fedeltà di layout ma STATICA e
     *  inerte. Salta gli effetti basati su window (matchMedia + shrink-on-scroll) e
     *  disattiva i pointer events. Default false (runtime invariato). */
    preview?: boolean;
};

export default function PublicBottomBar({
    activeTab,
    onTabChange,
    showEventsTab = true,
    selectionCount,
    supportVisible,
    onOpenSupport,
    cartVisible,
    onOpenCart,
    reviewDot,
    onReviewDotDismiss,
    isSheetOpen = false,
    surfaceTheme = "dark",
    preview = false,
}: Props) {
    const { t } = useTranslation("public");

    // CSS-driven split: la barra è SEMPRE montata (markup SSR-safe), ma è visibile
    // solo ≤640px via @media. Gli effetti viewport-specifici (ResizeObserver sul
    // gruppo pill + scroll listener) NON devono girare su desktop dove la barra è
    // nascosta. matchMedia letto in effect post-mount (client-only) → mai in render.
    const [isMobileActive, setIsMobileActive] = useState(false);
    useEffect(() => {
        // Preview: split pilotato dal device frame (data-preview-device), non dal
        // viewport del browser → niente matchMedia su window. Barra statica.
        if (preview) return;
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(max-width: 640px)");
        const update = () => setIsMobileActive(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [preview]);

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
        if (!isMobileActive) return; // barra nascosta su desktop → niente ResizeObserver
        const group = groupRef.current;
        if (!group || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(group);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, isMobileActive]);

    // Shrink-on-scroll: segue DIRETTAMENTE la posizione di scroll (bidirezionale) dal
    // segnale esistente useScrollCollapse. Niente override "forceExpanded": evitava lo
    // shrink finché non si tornava in cima (bug: dopo un tap mid-scroll lo shrink non
    // ripartiva → intermittenza). Il tap su una tab fa già scrollare a top → riespande.
    // `isSheetOpen` congela il valore mentre una sheet è aperta: il body scroll-lock
    // azzererebbe window.scrollY → espansione/rimpicciolimento spurio (flicker).
    // enabled=isMobileActive: su desktop la barra è nascosta → niente scroll listener.
    // Preview: barra statica → niente scroll listener, mai shrink.
    const shrink = useScrollCollapse(50, isSheetOpen, preview ? false : isMobileActive);

    const handleTab = (tab: HubTab) => {
        if (tab === "reviews" && reviewDot) onReviewDotDismiss?.();
        onTabChange(tab);
    };

    const handleCart = () => {
        onOpenCart();
    };

    // Bump dell'icona carrello quando selectionCount AUMENTA (aggiunta piatto).
    // Rileva l'incremento via ref sul valore precedente. CSS rispetta prefers-reduced-motion.
    const prevCountRef = useRef(selectionCount);
    const [bump, setBump] = useState(false);
    useEffect(() => {
        if (selectionCount > prevCountRef.current) {
            setBump(true);
            const id = setTimeout(() => setBump(false), 340);
            prevCountRef.current = selectionCount;
            return () => clearTimeout(id);
        }
        prevCountRef.current = selectionCount;
    }, [selectionCount]);

    return (
        // Wrapper: posizionamento fisso + centratura + animazione di entrata (opacity/translateY).
        // Lo scale di shrink vive sul `.bar` interno per non collidere col transform dell'entry
        // (animation-fill su transform sovrascriverebbe lo scale del data-shrink).
        <div className={styles.barWrap} data-preview={preview ? "true" : undefined}>
            <nav
                className={styles.bar}
                data-shrink={shrink ? "true" : "false"}
                data-theme={surfaceTheme}
                aria-label={t("nav.bottom_aria")}
            >
                <div className={styles.group} ref={groupRef}>
                <span
                    className={styles.indicator}
                    style={{ left: indicator.left, width: indicator.width }}
                    aria-hidden="true"
                />
                {TABS.filter(tab => tab.id !== "events" || showEventsTab).map(tab => (
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

            {/* Un solo divisore tra il gruppo nav e il gruppo azioni (campanello +
                carrello). Campanello e carrello stanno insieme, dalla stessa parte;
                fra loro solo il gap del `.bar`, nessun divisore interno. */}
            {(supportVisible || cartVisible) && (
                <span className={styles.divider} aria-hidden="true" />
            )}

            {supportVisible && (
                <button
                    type="button"
                    className={styles.cart}
                    aria-label={t("assistance.aria")}
                    onClick={onOpenSupport}
                >
                    <Bell size={19} strokeWidth={1.9} />
                </button>
            )}

            {cartVisible && (
                <button
                    type="button"
                    className={styles.cart}
                    aria-label={
                        selectionCount > 0
                            ? t("fab.cart_aria_count", { count: selectionCount })
                            : t("fab.cart_aria")
                    }
                    onClick={handleCart}
                    tabIndex={preview ? -1 : undefined}
                >
                    <span className={styles.cartIcon} data-bump={bump ? "true" : "false"}>
                        {/* Sempre a contorno: il fill bianco riduce la leggibilità ed è
                            ridondante col badge numerico che già segnala la selezione. */}
                        <ShoppingBag size={19} strokeWidth={1.9} fill="none" />
                    </span>
                    {/* Badge numerico: conteggio selezione, stessa fonte dati del badge desktop
                        equivalente (PublicCollectionHeader). */}
                    {selectionCount > 0 && (
                        <span className={styles.cartBadge} aria-hidden="true">
                            {selectionCount}
                        </span>
                    )}
                </button>
            )}
            </nav>
        </div>
    );
}
