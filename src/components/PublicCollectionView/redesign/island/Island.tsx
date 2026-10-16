import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, MoreHorizontal, Search } from "lucide-react";
import { SEARCH_TRIGGER_ID } from "@components/PublicCollectionView/PublicCollectionHeader/PublicCollectionHeader";
import { useLanguage } from "@context/Language/useLanguage";
import { buildCoverImageSet } from "@/utils/imageTransform";
import lensStyles from "./LensDot.module.scss";
import type { HeaderSlotContext } from "../slots";
import { rememberSheetOpener } from "../sheets/sheetStack";
import VenuePill from "../venue/VenuePill";
import { ISLAND_ID, LANGUAGE_BUTTON_ID, MENU_BUTTON_ID, MORE_BUTTON_ID, SEARCH_FIELD_ID } from "./anchors";
import IslandCategories from "./IslandCategories";
import LanguageButton from "./LanguageButton";
import { openVenueSheet } from "../sheets/venueSheetPages";
import { useCappelloCover } from "../story/cappelloCover";
import styles from "./Island.module.scss";

// Isteresi: compatta oltre 40 px, torna estesa sotto 8 px. Validata su iPhone e Android (PR 1).
const SOGLIA_ALTA = 40;
const SOGLIA_BASSA = 8;
/** Telefono: isola compatta (52) + distanza dal bordo (10). Da qui partono gli scroll verso le sezioni. */
const ALTEZZA_COMPATTA_PX = 62;
/** Desktop: riga unica (58 + bordi) + distanza dal bordo (14). */
const ALTEZZA_COMPATTA_DESKTOP_PX = 74;
/** Telefono, da compatta: la fila delle pill sale fin qui dal bordo dell'isola ((52 − 34) / 2). */
const CIMA_FILA_COMPATTA_PX = 9;
/** ⚠️ SYNC con PUBLIC_MOBILE_MAX_WIDTH (publicBreakpoints.ts) e con Island.module.scss. */
const DESKTOP_QUERY = "(min-width: 641px)";

/**
 * «· 2 di 2» esce se il nome del menu non ci sta (mockup v38, `r2-nn`): il nome
 * conta più del numero. Si rimisura quando cambia la larghezza della riga, il
 * nome o il font.
 */
function useMenuCountFit(button: RefObject<HTMLButtonElement | null>, name: string | null | undefined) {
    useEffect(() => {
        const el = button.current;
        const line = el?.parentElement;
        if (!el || !line || typeof ResizeObserver === "undefined") return;
        let live = true;
        const nome = el.querySelector("i");
        const fit = () => {
            if (!live) return;
            delete el.dataset.senzaConto;
            if (nome && nome.scrollWidth > nome.clientWidth + 1) el.dataset.senzaConto = "";
        };
        fit();
        void document.fonts?.ready.then(fit);
        // Anche il nome: la riga resta larga uguale quando lo stato cambia parola («Chiude presto»).
        const ro = new ResizeObserver(fit);
        ro.observe(line);
        if (nome) ro.observe(nome);
        return () => {
            live = false;
            ro.disconnect();
        };
    }, [button, name]);
}

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

/**
 * Isola della pagina pubblica (spec §2, §13; mockup v38).
 *
 * Telefono, in cima: riga 1 logo, nome, «menu · stato», lingua; riga 2 le pill
 * delle categorie e la capsula «cerca · ⋯». Compatta: resta solo la riga 2.
 * In Storia la riga 2 non c'è e il ⋯ sale accanto alla lingua.
 * Desktop: riga 1 logo, nome e stato, campo di ricerca, lingua, ⋯; riga 2 solo
 * le categorie; compatta su una riga sola. Menu e Storia non stanno qui: sul
 * telefono nella barra in basso, su desktop nel ⋯.
 */
/** Con più menu adesso il nome del menu diventa un selettore: «Menu pranzo · 1 di 2 ⌄» (mockup v38, `menuLine`). */
/** Più menu adesso: posizione e nome del menu aperto (il nome anche se lo stile nasconde il titolo del catalogo). */
export type MenuSwitch = { position: number; total: number; name: string | null };

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
    openingHours,
    upcomingClosures,
    onOpenHours,
    categoryGroups,
    activeSectionId,
    onSelectSection,
    onSelectSubSection,
    onOpenCategories,
    onOpenFilters,
    menuSwitch
}: HeaderSlotContext & { menuSwitch?: MenuSwitch }) {
    const { t } = useTranslation("public");
    const { compatta, alta, bassa } = useCompatta();
    const slotRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLElement>(null);
    const filaRef = useRef<HTMLDivElement>(null);
    const compattaRef = useRef(false);
    const primerRef = useRef<HTMLInputElement>(null);
    const campoRef = useRef<HTMLButtonElement>(null);
    const lenteRef = useRef<HTMLButtonElement>(null);
    const menuTastoRef = useRef<HTMLButtonElement>(null);
    const storia = activeTab === "storia";
    // Con più menu il selettore mostra il menu aperto anche se lo stile nasconde il titolo del catalogo.
    const switchName = menuSwitch && !storia ? (menuSwitch.name ?? menuName) : null;
    useMenuCountFit(menuTastoRef, switchName);
    const piuLingue = useLanguage().availableLanguages.length > 1;

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
    // la pagina sotto non si muove. Da estesa si misura anche quanto deve salire la riga
    // delle pill per stare al centro dell'isola compatta (solo transform, niente reflow).
    compattaRef.current = compatta;
    useEffect(() => {
        const slot = slotRef.current;
        const isola = rootRef.current;
        if (!slot || !isola) return;
        const misura = () => {
            // `offsetTop` ignora il transform: la salita si misura anche da compatta
            // (pagina ricaricata già scorsa, ritorno da Storia, rotazione).
            const fila = filaRef.current;
            if (fila) isola.style.setProperty("--sali", `${fila.offsetTop - CIMA_FILA_COMPATTA_PX}px`);
            if (!compattaRef.current) slot.style.height = `${isola.offsetHeight}px`;
        };
        misura();
        const ro = new ResizeObserver(misura);
        ro.observe(isola);
        return () => ro.disconnect();
    }, [storia]);

    // Gli scroll verso le sezioni leggono questa variabile su <main>: si fermano sotto l'isola compatta.
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
    // In Storia la foto del cappello prende il posto della copertina, in dissolvenza (v38 «Unica»).
    // L'ultima resta montata: tornando al Menu sfuma via invece di sparire.
    const cappelloCover = useCappelloCover();
    const [storyCover, setStoryCover] = useState<string | null>(null);
    if (cappelloCover && cappelloCover !== storyCover) setStoryCover(cappelloCover);
    const storyCoverOn = storia && !!cappelloCover;
    const openSearch = (trigger: HTMLElement) => {
        // Focus sincrono in-gesto sul campo fantasma: la tastiera iOS sale subito.
        // Alla chiusura il fuoco torna a chi ha aperto, non al campo fantasma.
        // Quello che si batte prima che il foglio sia pronto finisce qui: lo raccoglie SearchHeader.
        rememberSheetOpener(trigger);
        if (primerRef.current) primerRef.current.value = "";
        primerRef.current?.focus();
        onSearchOpen();
    };

    const piu = (
        <button
            id={MORE_BUTTON_ID}
            type="button"
            className={`${styles.tasto} ${styles.piu}`}
            onClick={onOpenMore}
            aria-label={t("header.more_aria")}
        >
            <MoreHorizontal size={18} strokeWidth={2} />
        </button>
    );

    const lente = (
        <button
            ref={lenteRef}
            type="button"
            id={SEARCH_TRIGGER_ID}
            className={`${styles.tasto} ${styles.lente}`}
            onClick={event => openSearch(event.currentTarget)}
            onPointerDown={onSearchPointerDown}
            aria-label={
                allergensCount > 0
                    ? t("header.search_filters_aria", { count: allergensCount })
                    : t("header.search_aria")
            }
        >
            <Search size={17} strokeWidth={2} />
            {/* Filtro attivo: un pallino, non un numero (spec §4, v32). */}
            {allergensCount > 0 && <span className={lensStyles.dot} aria-hidden />}
        </button>
    );

    return (
        <>
            <input
                ref={primerRef}
                type="text"
                inputMode="search"
                className={styles.primer}
                data-search-primer=""
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
                    {storyCover ? (
                        <img
                            src={storyCover}
                            alt=""
                            role="presentation"
                            className={`${styles.coverImg} ${styles.coverStory}`}
                            data-on={storyCoverOn || undefined}
                            decoding="async"
                        />
                    ) : null}
                </div>
            )}

            <div ref={slotRef} className={styles.slot} data-cover={!!coverImageUrl || undefined}>
                <header
                    ref={rootRef}
                    id={ISLAND_ID}
                    className={styles.isola}
                    data-compact={compatta}
                    data-tab={activeTab}
                    data-cover={!!coverImageUrl || undefined}
                    data-logo={!!logoUrl || undefined}
                >
                    <div className={styles.guscio} aria-hidden />
                    <div className={styles.riga}>
                        {logoUrl && (
                            <img
                                src={logoUrl}
                                alt={t("header.logo_alt", { name: activityName })}
                                className={styles.logo}
                                decoding="async"
                                width={40}
                                height={40}
                            />
                        )}
                        <div className={styles.testi}>
                            {/* Il nome apre «Info e orari», come nel mockup v38. È l'h1 della
                                pagina (uno solo): il pulsante sta dentro il titolo. */}
                            <h1 className={styles.titolo}>
                                <button
                                    type="button"
                                    className={styles.nomeTasto}
                                    onClick={e => {
                                        // Safari non dà il fuoco al bottone toccato: alla chiusura torna qui.
                                        rememberSheetOpener(e.currentTarget);
                                        openVenueSheet("info");
                                    }}
                                    aria-label={`${activityName}: ${t("header.info_aria")}`}
                                    aria-haspopup="dialog"
                                >
                                    <span className={styles.nome}>{activityName}</span>
                                </button>
                            </h1>
                            {/* «Menu pranzo  ● Aperto» su una riga; in Storia il menu non c'è. */}
                            <div className={styles.linea}>
                                {switchName && menuSwitch ? (
                                    <button
                                        ref={menuTastoRef}
                                        id={MENU_BUTTON_ID}
                                        type="button"
                                        className={`${styles.menu} ${styles.menuTasto}`}
                                        onClick={e => {
                                            rememberSheetOpener(e.currentTarget);
                                            openVenueSheet("menus");
                                        }}
                                        aria-haspopup="dialog"
                                        aria-label={t("menus.island_aria", {
                                            name: switchName,
                                            position: menuSwitch.position,
                                            total: menuSwitch.total
                                        })}
                                    >
                                        <i>{switchName}</i>
                                        <span className={styles.menuConto} aria-hidden>
                                            · {t("menus.position", { position: menuSwitch.position, total: menuSwitch.total })}
                                        </span>
                                        <ChevronDown size={13} strokeWidth={2.2} aria-hidden />
                                    </button>
                                ) : menuName && !storia ? (
                                    <i className={styles.menu}>{menuName}</i>
                                ) : null}
                                <VenuePill
                                    hours={openingHours}
                                    closures={upcomingClosures}
                                    onOpenHours={onOpenHours}
                                    word={Boolean(switchName)}
                                />
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
                        {/* In Storia la capsula è «lingua · ⋯» (la lente solo su desktop compatta). */}
                        {(piuLingue || storia) && (
                            <div className={styles.capsula} data-alta>
                                <LanguageButton id={LANGUAGE_BUTTON_ID} className={`${styles.tasto} ${styles.lingua}`} />
                                {storia && piuLingue && <span className={styles.divisore} aria-hidden />}
                                {storia && lente}
                                {storia && piu}
                            </div>
                        )}
                    </div>

                    {!storia && (
                        <div ref={filaRef} className={styles.fila}>
                            <IslandCategories
                                className={styles.categorie}
                                groups={categoryGroups}
                                activeId={activeSectionId}
                                onSelect={onSelectSection}
                                onSelectSub={onSelectSubSection}
                                onOpenAll={onOpenCategories}
                            />
                            <div className={styles.capsula}>
                                {lente}
                                <span className={styles.divisore} aria-hidden />
                                {piu}
                            </div>
                        </div>
                    )}
                </header>
            </div>
        </>
    );
}
