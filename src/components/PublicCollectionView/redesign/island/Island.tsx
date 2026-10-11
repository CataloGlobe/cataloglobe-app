import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Search } from "lucide-react";
import type { HubTab } from "@/types/collectionStyle";
import { SEARCH_TRIGGER_ID } from "@components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader";
import { buildCoverImageSet } from "@/utils/imageTransform";
import lensStyles from "./LensDot.module.scss";
import type { HeaderSlotContext } from "../slots";
import { rememberSheetOpener } from "../sheets/sheetStack";
import VenuePill from "../venue/VenuePill";
import { ISLAND_ID, LANGUAGE_BUTTON_ID, MORE_BUTTON_ID, SEARCH_FIELD_ID } from "./anchors";
import IslandCategories from "./IslandCategories";
import LanguageButton from "./LanguageButton";
import styles from "./Island.module.scss";

// Isteresi: compatta oltre 40 px, torna estesa sotto 8 px. Validata su iPhone e Android (PR 1).
const SOGLIA_ALTA = 40;
const SOGLIA_BASSA = 8;
/** Durata della transizione CSS: per tutto il passaggio il vetro è pieno, niente blur che cambia. */
const PASSAGGIO_MS = 220;
/** Altezza dell'isola compatta + distanza dal bordo: da qui parte la barra delle categorie sticky. */
const ALTEZZA_COMPATTA_PX = 68;
/** Desktop: le categorie stanno nell'isola, gli scroll verso le sezioni partono sotto la riga unica. */
const ALTEZZA_COMPATTA_DESKTOP_PX = 82;
/** ⚠️ SYNC con PUBLIC_MOBILE_MAX_WIDTH (publicBreakpoints.ts) e con Island.module.scss. */
const DESKTOP_QUERY = "(min-width: 641px)";

const HUB_TABS: { id: HubTab; labelKey: string }[] = [
    { id: "menu", labelKey: "hub.menu" },
    { id: "storia", labelKey: "hub.storia" }
];

/**
 * Due sentinelle assolute in cima alla pagina: nessun lavoro a ogni scroll,
 * un solo render per passaggio. Il body-lock dei fogli non le sposta rispetto al
 * viewport, quindi non serve congelare niente.
 */
function useCompatta() {
    const alta = useRef<HTMLDivElement>(null);
    const bassa = useRef<HTMLDivElement>(null);
    const [compatta, setCompatta] = useState(false);
    useEffect(() => {
        const a = alta.current;
        const b = bassa.current;
        if (!a || !b) return;
        const oa = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) setCompatta(true);
        });
        const ob = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) setCompatta(false);
        });
        oa.observe(a);
        ob.observe(b);
        return () => {
            oa.disconnect();
            ob.disconnect();
        };
    }, []);
    return { compatta, alta, bassa };
}

export default function Island({
    logoUrl,
    coverImageUrl,
    activityName,
    menuName,
    onSearchOpen,
    onSearchPointerDown,
    allergensCount,
    onOpenMore,
    activeTab,
    onTabChange,
    showStoryTab,
    openingHours,
    upcomingClosures,
    onOpenHours,
    sections,
    activeSectionId,
    onSelectSection,
    onOpenCategories,
    onOpenFilters
}: HeaderSlotContext) {
    const { t } = useTranslation("public");
    const { compatta, alta, bassa } = useCompatta();
    const slotRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLElement>(null);
    const compattaRef = useRef(false);
    const primerRef = useRef<HTMLInputElement>(null);
    const campoRef = useRef<HTMLButtonElement>(null);
    const lenteRef = useRef<HTMLButtonElement>(null);
    const [inPassaggio, setInPassaggio] = useState(false);
    const primoGiro = useRef(true);

    // Vetro pieno mentre l'isola cambia misura, sfocato da fermo.
    useEffect(() => {
        if (primoGiro.current) {
            primoGiro.current = false;
            return;
        }
        setInPassaggio(true);
        const id = window.setTimeout(() => setInPassaggio(false), PASSAGGIO_MS + 30);
        return () => window.clearTimeout(id);
    }, [compatta]);

    // Desktop: da estesa a compatta il campo lascia il posto alla lente (e viceversa).
    // Se il fuoco era sul pezzo che sparisce, passa all'altro: non cade sul body.
    useEffect(() => {
        const campo = campoRef.current;
        const lente = lenteRef.current;
        const active = document.activeElement;
        if (!campo || !lente || (active !== campo && active !== lente)) return;
        const other = active === campo ? lente : campo;
        if ((active as HTMLElement).offsetParent === null && other.offsetParent !== null) {
            other.focus({ preventScroll: true });
        }
    }, [compatta]);

    // Il contenitore sticky tiene l'altezza dell'isola estesa: quando l'isola si compatta
    // la pagina sotto non si muove. Si misura solo da estesa.
    compattaRef.current = compatta;
    useEffect(() => {
        const slot = slotRef.current;
        const isola = rootRef.current;
        if (!slot || !isola) return;
        const misura = () => {
            if (!compattaRef.current) slot.style.height = `${isola.offsetHeight}px`;
        };
        misura();
        const ro = new ResizeObserver(misura);
        ro.observe(isola);
        return () => ro.disconnect();
    }, []);

    // La barra delle categorie e gli scroll verso le sezioni leggono questa variabile su <main>.
    useEffect(() => {
        const main = rootRef.current?.closest("main") as HTMLElement | null;
        if (!main) return;
        const mq = window.matchMedia(DESKTOP_QUERY);
        const apply = () =>
            main.style.setProperty(
                "--pub-header-height",
                `${mq.matches ? ALTEZZA_COMPATTA_DESKTOP_PX : ALTEZZA_COMPATTA_PX}px`
            );
        apply();
        mq.addEventListener("change", apply);
        return () => {
            mq.removeEventListener("change", apply);
            main.style.removeProperty("--pub-header-height");
        };
    }, []);

    const coverSet = coverImageUrl ? buildCoverImageSet(coverImageUrl) : null;
    const openSearch = (trigger: HTMLElement) => {
        // Focus sincrono in-gesto sul campo fantasma: la tastiera iOS sale subito.
        // Alla chiusura il fuoco torna a chi ha aperto, non al campo fantasma.
        rememberSheetOpener(trigger);
        primerRef.current?.focus();
        onSearchOpen();
    };
    const tabs = showStoryTab ? HUB_TABS : [];

    return (
        <>
            <input
                ref={primerRef}
                type="text"
                inputMode="search"
                className={styles.primer}
                tabIndex={-1}
                aria-hidden="true"
                autoComplete="off"
            />
            <div className={styles.sentinelle} aria-hidden>
                <div ref={alta} className={styles.sentinella} style={{ top: SOGLIA_ALTA }} />
                <div ref={bassa} className={styles.sentinella} style={{ top: SOGLIA_BASSA }} />
            </div>

            {coverImageUrl && (
                <div className={styles.cover}>
                    <img
                        src={coverSet?.src ?? coverImageUrl}
                        srcSet={coverSet?.srcset}
                        sizes={coverSet?.sizes}
                        alt=""
                        role="presentation"
                        className={styles.coverImg}
                        fetchPriority="high"
                        decoding="async"
                        width={1920}
                        height={1080}
                    />
                </div>
            )}

            <div ref={slotRef} className={styles.slot} data-cover={!!coverImageUrl || undefined}>
            <header
                ref={rootRef}
                id={ISLAND_ID}
                className={styles.isola}
                data-compact={compatta}
                data-moving={inPassaggio || undefined}
                data-cover={!!coverImageUrl || undefined}
                data-logo={!!logoUrl || undefined}
            >
                <div className={styles.riga}>
                    {logoUrl && (
                        <img
                            src={logoUrl}
                            alt={t("header.logo_alt", { name: activityName })}
                            className={styles.logo}
                            decoding="async"
                            width={44}
                            height={44}
                        />
                    )}
                    <div className={styles.testi}>
                        <span className={styles.nome}>{activityName}</span>
                        {menuName && <span className={styles.menu}>{menuName}</span>}
                        <div className={styles.stato}>
                            <div>
                                <VenuePill hours={openingHours} closures={upcomingClosures} onOpenHours={onOpenHours} />
                            </div>
                        </div>
                    </div>
                    {/* Desktop, isola estesa: il campo di ricerca prende lo spazio libero (spec §13). */}
                    <div id={SEARCH_FIELD_ID} className={styles.campo}>
                        <button
                            ref={campoRef}
                            type="button"
                            className={styles.campoTesto}
                            onClick={event => openSearch(event.currentTarget)}
                            onPointerDown={onSearchPointerDown}
                        >
                            <Search size={16} strokeWidth={2} aria-hidden />
                            <span>{t("header.search_field")}</span>
                        </button>
                        <button
                            type="button"
                            className={styles.campoFiltri}
                            data-active={allergensCount > 0 || undefined}
                            onClick={onOpenFilters}
                        >
                            {allergensCount > 0
                                ? t("header.filters_count", { count: allergensCount })
                                : t("more.filters_label")}
                        </button>
                    </div>
                    <LanguageButton id={LANGUAGE_BUTTON_ID} className={`${styles.icona} ${styles.lingua}`} />
                    <button
                        ref={lenteRef}
                        type="button"
                        id={SEARCH_TRIGGER_ID}
                        className={`${styles.icona} ${styles.lente}`}
                        onClick={event => openSearch(event.currentTarget)}
                        onPointerDown={onSearchPointerDown}
                        aria-label={
                            allergensCount > 0
                                ? t("header.search_filters_aria", { count: allergensCount })
                                : t("header.search_aria")
                        }
                    >
                        <Search size={16} strokeWidth={2} />
                        {/* Filtro attivo: un pallino, non un numero (spec §4, v32). */}
                        {allergensCount > 0 && <span className={lensStyles.dot} aria-hidden />}
                    </button>
                    <button
                        id={MORE_BUTTON_ID}
                        type="button"
                        className={`${styles.icona} ${styles.piu}`}
                        onClick={onOpenMore}
                        aria-label={t("header.more_aria")}
                    >
                        <MoreHorizontal size={16} strokeWidth={2} />
                    </button>
                </div>

                {tabs.length > 0 && (
                    <div className={styles.secondaRiga}>
                        <div className={styles.capsula} role="tablist">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    className={styles.voce}
                                    data-active={activeTab === tab.id || undefined}
                                    onClick={() => onTabChange(tab.id)}
                                >
                                    {t(tab.labelKey)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Desktop: seconda riga (pagine e categorie); da compatta le categorie salgono nella riga unica. */}
                <div className={styles.fila}>
                    {tabs.length > 0 && (
                        <div className={`${styles.capsula} ${styles.capsulaFila}`} role="tablist">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    className={styles.voce}
                                    data-active={activeTab === tab.id || undefined}
                                    onClick={() => onTabChange(tab.id)}
                                >
                                    {t(tab.labelKey)}
                                </button>
                            ))}
                        </div>
                    )}
                    <IslandCategories
                        sections={sections}
                        activeId={activeSectionId}
                        onSelect={onSelectSection}
                        onOpenAll={onOpenCategories}
                    />
                </div>
            </header>
            </div>
        </>
    );
}
