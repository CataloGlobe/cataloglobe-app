import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, CalendarDays, MessageCircle, ReceiptText, Utensils } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import { useScrollCollapse } from "../hooks/useScrollCollapse";
import styles from "./PublicBottomBar.module.scss";

/**
 * Bottom nav bar icon-only del sito pubblico — SOLO mobile (≤640px), montata in
 * public via split CSS-driven. Sostituisce i tab header (HUB_TABS) + le azioni desktop.
 *
 * - 2 tab (menu/storia) con pill attiva che scorre (offsetLeft/width misurati).
 * - Eventi/recensioni NON sono più tab: sono trigger icona che aprono le
 *   PublicSheet dedicate (stato locale in CollectionView), stesso slot visivo
 *   dei tab ma senza indicatore/attivazione.
 * - Slot carrello separato da divider (non è un tab attivo).
 * - Shrink-on-scroll: riusa `useScrollCollapse` (segnale già usato dai FAB pubblici),
 *   nessun nuovo scroll listener su window è scritto qui dentro. Tap su un'icona riespande.
 * - Dot recensione sul trigger recensioni guidato dalla stessa condizione del valutaFab
 *   (prop `reviewDot`, derivata da `valutaVisible` nel parent).
 */

type TabDef = { id: HubTab; icon: ReactNode; labelKey: string };

// ⚠️ Visibilità tab "storia" sincronizzata con PublicCollectionHeader.tsx (stesso filtro)
const TABS: TabDef[] = [
    { id: "menu", icon: <Utensils size={19} strokeWidth={1.9} />, labelKey: "hub.menu" },
    { id: "storia", icon: <BookOpenText size={19} strokeWidth={1.9} />, labelKey: "hub.storia" },
];

type Props = {
    activeTab: HubTab;
    onTabChange: (tab: HubTab) => void;
    /** Mostra il trigger "eventi". Default true (retrocompatibile). Sincronizzato con PublicCollectionHeader. */
    showEventsTab?: boolean;
    /** Mostra la tab "storia". Default false (gated su has_story dal catalogo). Sincronizzato con PublicCollectionHeader. */
    showStoryTab?: boolean;
    selectionCount: number;
    /** Mostra lo slot carrello. Allineato a `!shouldHideOrderingEntry` del parent. */
    cartVisible: boolean;
    onOpenCart: () => void;
    /** Apre la sheet "eventi". Undefined ⇒ trigger non renderizzato. */
    onOpenEvents?: () => void;
    /** Apre la sheet "recensioni". Undefined ⇒ trigger non renderizzato. */
    onOpenReviews?: () => void;
    /** Pallino sul trigger recensioni — stessa condizione del valutaFab (`valutaVisible`). */
    reviewDot: boolean;
    /** Dismiss del dot per la sessione, al tap sul trigger recensioni. */
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
    showStoryTab = false,
    selectionCount,
    cartVisible,
    onOpenCart,
    onOpenEvents,
    onOpenReviews,
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
    const tabRefs = useRef<Partial<Record<HubTab, HTMLButtonElement | null>>>({
        menu: null,
        storia: null,
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
        onTabChange(tab);
    };

    const handleCart = () => {
        onOpenCart();
    };

    const handleOpenReviews = () => {
        if (reviewDot) onReviewDotDismiss?.();
        onOpenReviews?.();
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
                {TABS.filter(tab =>
                    tab.id !== "storia" || showStoryTab
                ).map(tab => (
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
                    </button>
                ))}

                {/* Trigger eventi/recensioni: aprono le sheet dedicate, non sono tab
                    (nessun indicatore/pill, stessa dimensione visiva di .tab). */}
                {onOpenEvents && showEventsTab && (
                    <button
                        type="button"
                        className={styles.tab}
                        aria-label={t("hub.events")}
                        onClick={onOpenEvents}
                    >
                        <CalendarDays size={19} strokeWidth={1.9} />
                    </button>
                )}
                {onOpenReviews && (
                    <button
                        type="button"
                        className={styles.tab}
                        aria-label={t("hub.reviews")}
                        onClick={handleOpenReviews}
                    >
                        <MessageCircle size={19} strokeWidth={1.9} />
                        {reviewDot && <span className={styles.dot} aria-hidden="true" />}
                    </button>
                )}
            </div>

            {/* Divisore tra il gruppo nav e l'azione carrello. */}
            {cartVisible && (
                <span className={styles.divider} aria-hidden="true" />
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
                        <ReceiptText size={19} strokeWidth={1.9} fill="none" />
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
