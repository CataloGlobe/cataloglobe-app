import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, Lock, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { Logo } from "@/components/ui/Logo/Logo";
import {
    SIDEBAR_COLLAPSED,
    SIDEBAR_D_COLLAPSED,
    SIDEBAR_D_EXPANDED,
    SIDEBAR_D_MARGIN,
    SIDEBAR_EXPANDED
} from "@/constants/layout";
import { D_EASE, LOOK_D } from "@styles/lookD";
import { SidebarSection } from "./SidebarSection";
import { currentItem } from "./isItemActive";
import styles from "./AppSidebar.module.scss";

/**
 * AppSidebar — l'unica navigazione (scheda «AppSidebar»): una sidebar sola,
 * che riceve tutto e non sa niente. I gruppi li costruiscono i costruttori
 * (TenantSidebar e SedeSidebar con i permessi, AdminSidebar,
 * ex WorkspaceSidebar): aggiungere una sezione = aggiungere una voce a `groups`.
 *
 * `headerSlot` è l'intestazione del contesto, sopra le voci e fuori dallo
 * scroll: dentro una sede porta «← Tutte le sedi». Resta vuoto altrove.
 *
 * Aperta e chiusa (§51.15): le righe restano esattamente alla stessa
 * altezza e l'icona allo stesso posto; si anima solo la larghezza e il testo
 * viene tagliato, non riposizionato. Chiusa, il titolo di gruppo diventa un
 * trattino nello stesso slot, il nome della voce passa al tooltip e i
 * segnali a un badge sull'icona.
 *
 * Lo SCSS dello stato collassato usa selettori discendenti
 * (`.sidebar[data-collapsed="true"] .link/.label/.icon`): markup e stile
 * DEVONO restare nello stesso modulo CSS, altrimenti gli hash divergono e i
 * selettori smettono di matchare.
 */

export interface AppSidebarNavItem {
    /** La parte, per ricordare l'ultima usata della sezione. */
    id?: string;
    to: string;
    /** La query della parte: accesa solo se l'indirizzo la porta (vedi `isItemActive`). */
    search?: string;
    /** Lo stato della parte, a destra («3 · 1 non in onda»). */
    state?: string;
    /** Il pallino dello stato: c'è da vedere (arancio) o è in corso (verde). */
    stateTone?: "attention" | "live";
    label: string;
    icon: ReactNode;
    end?: boolean;
    /** Voce annunciata ma non ancora navigabile: resa attenuata e non cliccabile,
     *  con tooltip esplicativo. Non richiede una route. */
    disabled?: boolean;
    /** Testo del tooltip quando `disabled`. Default: "In arrivo". */
    disabledHint?: string;
    /**
     * Pallino senza numero sulla voce. Il valore arriva già calcolato dal
     * layout che costruisce i gruppi: questo guscio è renderizzato su ogni
     * pagina e non interroga il DB per conto proprio.
     */
    showDot?: boolean;
    /** Testo accessibile del pallino. Obbligatorio di fatto quando `showDot`. */
    dotLabel?: string;
    /** Contatore a destra (`Badge neutral`; `badgeTone="brand"` se sono cose da fare). */
    badge?: number | string;
    badgeTone?: "neutral" | "brand";
    /** Testo del contatore, come titolo e per i lettori di schermo (es. traduzioni in attesa). */
    badgeLabel?: string;
    /** Anello attorno al contatore, del colore della cosa più urgente (CRM in /admin). */
    badgeRing?: "warning" | "danger";
    /** Un lavoro in corso su questa voce: spinner 14 ambra, visibile anche collassata. */
    loading?: boolean;
    /** Testo accessibile dello spinner. */
    loadingLabel?: string;
    /** Funzione del piano Pro: lucchetto con tooltip «Pro». La voce resta navigabile. */
    locked?: boolean;
    /** Altri percorsi che tengono la voce corrente, oltre a `to`: la «Scheda»
     *  della sede resta accesa su tutte e quattro le sue pagine. Confronto per
     *  prefisso, valutato in OR con il match di `NavLink`. */
    matchPrefixes?: string[];
}

export interface AppSidebarNavGroup {
    /** La sezione, per ricordare la sua ultima parte. */
    key?: string;
    /** Titolo del gruppo (`caption-xs` 600 uppercase muto). Sparisce collassata. */
    title?: string;
    /**
     * Con l'icona (e il titolo) il gruppo è una sezione (Officina, desktop):
     * una riga sola, le sue voci nel pannello a destra (`SidebarSection`).
     * Con una voce sola la riga porta dritta lì. Al telefono resta un gruppo.
     */
    icon?: ReactNode;
    items: AppSidebarNavItem[];
}

export interface AppSidebarProps {
    groups: AppSidebarNavGroup[];
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
    /** Intestazione del contesto, sopra le voci: dove sei e come si esce
     *  (la sede, con «← Tutte le sedi»). Chi lo passa rende anche la sua
     *  versione collassata — il `collapsed` lo riceve già. */
    headerSlot?: ReactNode;
    /** Contenuto opzionale reso in fondo alla nav, sopra il footer di collapse. */
    footerSlot?: ReactNode;
    /**
     * Le voci del piede (§51.12: Assistenza), fuori dallo scroll e uguali in
     * tutti i contesti. Stanno nella stessa `nav` delle altre voci.
     */
    footerItems?: AppSidebarNavItem[];
    /** Il pulsante dell'account (`SidebarAccount`), nel piede sopra apri/chiudi. */
    accountSlot?: ReactNode;
    /** Scritta accanto al tasto apri/chiudi quando la barra è aperta (CRM in /admin: «Chiudi la barra»). */
    collapseLabel?: string;
    /**
     * Sidebar a tutta altezza (Officina, solo desktop): in cima logo e nome
     * (link a `homeTo`), le `actions` (la campanella) e apri/chiudi, che lascia
     * il piede. Le sedi non stanno qui: in alto a destra nella pagina (D152).
     */
    brand?: { homeTo: string | null; actions?: ReactNode };
    /**
     * D al telefono: il posto, nella barra in alto prima dell'avatar, dove la
     * testata della pagina porta sede e campanella come icone (v30 sotto 861).
     */
    phoneActionsRef?: (el: HTMLElement | null) => void;
}

/** La scorciatoia di apri/chiudi come si scrive sulla tastiera di chi guarda. */
const TOGGLE_SHORTCUT =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";

/** Prima di aprire il pannello di una sezione, e prima di chiuderlo. */
const SECTION_OPEN_DELAY = 60;
const SECTION_CLOSE_DELAY = 200;
/** Dalla riga chiusa (42) al bordo della sidebar (11), più lo spazio del pannello (6). */
const PANEL_LABEL_OFFSET = 17;
/** Direzione D: dal bordo della riga a quello della carta (12) più lo spazio del riquadro (6). */
const PANEL_LABEL_OFFSET_D = 18;
/** Direzione D: il pulsante tondo (26) sta a cavallo del bordo destro della carta. */
const RAIL_TOGGLE_HALF = 13;

/** L'ultima parte usata di ogni sezione: ci si riparte cliccando la sezione. */
const LAST_PART_KEY = "nav:ultima-parte";

function readLastParts(): Record<string, string> {
    try {
        const raw = window.localStorage.getItem(LAST_PART_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
        return {};
    }
}

function rememberLastPart(section: string, part: string): void {
    const all = readLastParts();
    if (all[section] === part) return;
    try {
        window.localStorage.setItem(LAST_PART_KEY, JSON.stringify({ ...all, [section]: part }));
    } catch {
        // Storage chiuso: si riparte dalla prima parte.
    }
}

/** Il contatore come si legge: oltre 99 diventa «99+». */
function badgeText(badge: number | string): number | string {
    return typeof badge === "number" && badge > 99 ? "99+" : badge;
}

function NavItemBody({ link }: { link: AppSidebarNavItem }) {
    const hasSignal = link.loading || link.badge !== undefined || link.showDot;
    return (
        <>
            <span className={styles.iconWrap}>
                <span className={styles.icon}>{link.icon}</span>
                {/* Chiusa: il segnale sta sull'icona (il CSS lo mostra solo lì).
                    Il testo accessibile è quello della coda, qui niente. */}
                {hasSignal && (
                    <span className={styles.miniSignal} aria-hidden="true">
                        {link.loading ? (
                            <span className={`${styles.spinner} ${styles.miniSpinner}`} />
                        ) : link.badge !== undefined ? (
                            <Text
                                as="span"
                                variant="caption-xs"
                                weight={600}
                                className={styles.miniBadge}
                                title={link.badgeLabel}
                                data-tone={link.badgeTone ?? "neutral"}
                                data-ring={link.badgeRing}
                            >
                                {badgeText(link.badge)}
                            </Text>
                        ) : (
                            <span className={styles.navDot} />
                        )}
                    </span>
                )}
            </span>

            <Text as="span" variant="body-sm" className={styles.label}>
                {link.label}
            </Text>

            {link.locked && (
                <Tooltip content="Pro" side="right" sideOffset={8}>
                    <span className={styles.lock} aria-label="Funzione del piano Pro">
                        <Lock size={14} strokeWidth={1.5} />
                    </span>
                </Tooltip>
            )}

            {hasSignal && (
                <span className={styles.trailing}>
                    {link.loading && (
                        <span
                            className={styles.spinner}
                            role="status"
                            title={link.loadingLabel}
                            aria-label={link.loadingLabel ?? "In corso"}
                        />
                    )}
                    {link.badge !== undefined && (
                        <span
                            className={styles.badge}
                            data-ring={link.badgeRing}
                            data-tone={link.badgeTone ?? "neutral"}
                            title={link.badgeLabel}
                            aria-label={link.badgeLabel}
                        >
                            <Badge variant={link.badgeTone ?? "neutral"}>{badgeText(link.badge)}</Badge>
                        </span>
                    )}
                    {link.showDot && (
                        <span className={styles.navDot} title={link.dotLabel} aria-label={link.dotLabel} />
                    )}
                </span>
            )}
        </>
    );
}

export function AppSidebar({
    groups,
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    headerSlot,
    footerSlot,
    footerItems = [],
    accountSlot,
    collapseLabel,
    brand,
    phoneActionsRef
}: AppSidebarProps) {
    const collapsedDesktop = !isMobile && collapsed;
    const { pathname, search } = useLocation();
    const navigate = useNavigate();

    const reduceMotion = useReducedMotion();

    // C2: con più voci dell'altezza una sfumatura dice che c'è altro (in basso,
    // e in alto dopo lo scorrimento); la voce attiva viene portata in vista.
    const scrollRef = useRef<HTMLDivElement>(null);
    const [fade, setFade] = useState({ top: false, bottom: false });
    const updateFade = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const top = el.scrollTop > 1;
        const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        setFade(prev => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    }, []);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateFade();
        const observer = new ResizeObserver(updateFade);
        observer.observe(el);
        return () => observer.disconnect();
    }, [updateFade]);
    useEffect(() => {
        const active = scrollRef.current?.querySelector<HTMLElement>(`.${styles.active}`);
        active?.scrollIntoView?.({ block: "nearest" });
        updateFade();
    }, [pathname, updateFade]);

    // Il pannello delle sezioni: uno aperto alla volta. Al passaggio si apre
    // dopo un attimo (andando verso la pagina non lampeggia); con un pannello
    // già aperto si passa subito a quello accanto. Uscendo si chiude dopo un
    // attimo, il tempo di attraversare lo spazio fino al pannello.
    const [openSection, setOpenSection] = useState<string | null>(null);
    const openSectionRef = useRef<string | null>(null);
    const openTimer = useRef<number | undefined>(undefined);
    const closeTimer = useRef<number | undefined>(undefined);
    const showSection = useCallback((id: string | null) => {
        window.clearTimeout(openTimer.current);
        window.clearTimeout(closeTimer.current);
        openSectionRef.current = id;
        setOpenSection(id);
    }, []);
    const closeSection = useCallback(() => showSection(null), [showSection]);
    const hoverSection = (id: string) => {
        window.clearTimeout(closeTimer.current);
        window.clearTimeout(openTimer.current);
        if (openSectionRef.current !== null) {
            showSection(id);
            return;
        }
        openTimer.current = window.setTimeout(() => showSection(id), SECTION_OPEN_DELAY);
    };
    const leaveSection = () => {
        window.clearTimeout(openTimer.current);
        closeTimer.current = window.setTimeout(() => showSection(null), SECTION_CLOSE_DELAY);
    };
    useEffect(() => {
        showSection(null);
    }, [pathname, collapsed, showSection]);
    // D al telefono: la sezione aperta va al centro della fila che scorre di
    // lato (v30), e le sfumature ai lati dicono che c'è altro da quella parte.
    const phoneNavRef = useRef<HTMLElement>(null);
    const phoneNavMoved = useRef(false);
    useEffect(() => {
        if (!LOOK_D || !isMobile) return;
        const nav = phoneNavRef.current;
        if (!nav) return;
        const edges = () => {
            const room = nav.scrollWidth - nav.clientWidth;
            nav.toggleAttribute("data-ml", room > 2 && nav.scrollLeft > 4);
            nav.toggleAttribute("data-mr", room > 2 && nav.scrollLeft < room - 4);
        };
        let frame = 0;
        // Senza far scorrere la pagina; la prima volta ci si mette subito,
        // dopo un tocco la fila ci scivola (420 ms, come nella v30).
        const center = (animate: boolean) => {
            cancelAnimationFrame(frame);
            const on = nav.querySelector<HTMLElement>('[aria-current="page"]');
            const room = nav.scrollWidth - nav.clientWidth;
            if (!on || room <= 2) return edges();
            const left = on.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
            const to = Math.max(0, Math.min(room, left - (nav.clientWidth - on.offsetWidth) / 2));
            const from = nav.scrollLeft;
            if (Math.abs(to - from) <= 4) return edges();
            if (!animate || reduceMotion) {
                nav.scrollLeft = to;
                return edges();
            }
            const start = performance.now();
            const step = (now: number) => {
                const k = Math.min(1, (now - start) / 420);
                nav.scrollLeft = from + (to - from) * (1 - (1 - k) ** 3);
                if (k < 1) frame = requestAnimationFrame(step);
                else edges();
            };
            frame = requestAnimationFrame(step);
        };
        center(phoneNavMoved.current);
        phoneNavMoved.current = true;
        const ro = new ResizeObserver(() => center(false));
        ro.observe(nav);
        nav.addEventListener("scroll", edges, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            ro.disconnect();
            nav.removeEventListener("scroll", edges);
        };
    }, [isMobile, pathname, reduceMotion]);
    useEffect(
        () => () => {
            window.clearTimeout(openTimer.current);
            window.clearTimeout(closeTimer.current);
        },
        []
    );
    const sectionsMode = !isMobile && groups.some(group => group.icon && group.title);

    // Sidebar aperta: si apre solo la sezione in cui sei, con le sue parti
    // (artifact v4, Alex 2026-10-09); le altre restano chiuse, col pallino se
    // c'è qualcosa da vedere. Il clic su una sezione porta alla sua ultima parte.
    const sectionId = (group: AppSidebarNavGroup, index: number) => group.key ?? `${index}:${group.title ?? ""}`;
    const currentIndex = groups.findIndex(
        group => group.icon && group.title && group.items.length > 1 && currentItem(group.items, pathname, search)
    );
    const currentSectionId = currentIndex === -1 ? null : sectionId(groups[currentIndex], currentIndex);
    const currentPart = currentIndex === -1 ? null : currentItem(groups[currentIndex].items, pathname, search);
    useEffect(() => {
        if (currentSectionId && currentPart?.id) rememberLastPart(currentSectionId, currentPart.id);
    }, [currentSectionId, currentPart?.id]);
    const goToSection = (group: AppSidebarNavGroup, id: string) => {
        const last = readLastParts()[id];
        const target = group.items.find(item => item.id === last && !item.disabled) ?? group.items.find(item => !item.disabled);
        if (target) navigate(target.to);
    };

    const renderGroupAsSection = (group: AppSidebarNavGroup, index: number): ReactNode => {
        const title = group.title ?? "";
        if (group.items.length === 1) {
            // Una pagina sola: niente pannello, la riga porta lì col nome della sezione.
            return renderItem({ ...group.items[0], label: title, icon: group.icon });
        }
        const id = sectionId(group, index);
        return (
            <SidebarSection
                key={id}
                inline={!collapsedDesktop}
                expanded={id === currentSectionId}
                onToggle={() => goToSection(group, id)}
                title={title}
                icon={group.icon}
                items={group.items}
                pathname={pathname}
                search={search}
                open={openSection === id}
                onHoverStart={() => hoverSection(id)}
                onHoverEnd={leaveSection}
                onOpenNow={() => showSection(id)}
                onClose={closeSection}
            />
        );
    };

    /**
     * Chiusa, il nome della voce passa al tooltip, sulla riga intera (mouse e
     * focus: `onFocus` di React risale dal link). Il trigger è un contenitore:
     * lo `Slot` di Radix trasformerebbe in stringa il `className` a funzione
     * di `NavLink`.
     */
    const withTooltip = (link: AppSidebarNavItem, node: ReactNode, content?: ReactNode) =>
        sectionsMode && collapsedDesktop && !content ? (
            // Con le sezioni il nome della voce diretta ha l'aspetto del loro
            // pannello, alla stessa distanza dalla sidebar.
            <Tooltip
                variant="panel"
                delayDuration={SECTION_OPEN_DELAY}
                content={
                    <Text as="span" variant="body-sm" weight={600}>
                        {link.locked ? `${link.label} · Pro` : link.label}
                    </Text>
                }
                side="right"
                sideOffset={LOOK_D ? PANEL_LABEL_OFFSET_D : PANEL_LABEL_OFFSET}
            >
                <span className={styles.tipAnchor}>{node}</span>
            </Tooltip>
        ) : collapsedDesktop || content ? (
            <Tooltip content={content ?? (link.locked ? `${link.label} · Pro` : link.label)} side="right" sideOffset={12}>
                <span className={styles.tipAnchor}>{node}</span>
            </Tooltip>
        ) : (
            node
        );

    const renderItem = (link: AppSidebarNavItem) => (
        <li key={link.to}>
            {link.disabled
                ? withTooltip(
                      link,
                      <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true" tabIndex={0}>
                          <span className={styles.iconWrap}>
                              <span className={styles.icon}>{link.icon}</span>
                          </span>
                          <Text as="span" variant="body-sm" className={styles.label}>
                              {link.label}
                          </Text>
                      </span>,
                      link.disabledHint ?? "In arrivo"
                  )
                : link.matchPrefixes?.some(p => pathname === p || pathname.startsWith(`${p}/`))
                  ? withTooltip(
                        link,
                        // Una voce che copre più pagine (Scheda: Orari, Sala…) è
                        // la pagina corrente anche per chi legge lo schermo:
                        // `NavLink` dà `aria-current` solo sul suo `to`.
                        <Link
                            to={link.to}
                            aria-current="page"
                            className={[styles.link, link.locked ? styles.locked : "", styles.active].join(" ")}
                            onClick={() => {
                                if (isMobile) onRequestClose();
                            }}
                        >
                            <NavItemBody link={link} />
                        </Link>
                    )
                  : withTooltip(
                      link,
                      <NavLink
                          to={link.to}
                          end={link.end}
                          className={({ isActive }) =>
                              [styles.link, link.locked ? styles.locked : "", isActive ? styles.active : ""].join(" ")
                          }
                          onClick={() => {
                              if (isMobile) onRequestClose();
                          }}
                      >
                          <NavItemBody link={link} />
                      </NavLink>
                  )}
        </li>
    );

    // Il segno a colori, largo come il quadrato dell'azienda sotto e in colonna
    // con lui; aperta accanto la scritta. Chiusa il solo segno, e «apri» sta
    // sotto, sempre a vista: nascosto dietro il logo non lo trovava nessuno.
    const brandLogo = (
        <>
            {/* A binario (D) il segno sta nei 26 px della v28 (22 di altezza = 26 di
                larghezza): a 27 sbordava sotto il pulsante tondo. */}
            <Logo variant="icon" color="flat" size={LOOK_D && collapsed ? 22 : 27} alt="" className={styles.brandIcon} />
            {!collapsed && <Logo variant="wordmark" color="auto" size={15} alt="" className={styles.brandWordmark} />}
        </>
    );
    const toggleLabel = collapsed ? "Apri la barra laterale" : "Chiudi la barra laterale";
    // Direzione D (artifact v28, `#railb`): un pulsante tondo a cavallo del
    // bordo della carta, che la segue mentre si stringe; la freccia si gira.
    const cardWidth = collapsed ? SIDEBAR_D_COLLAPSED : SIDEBAR_D_EXPANDED;
    const widthTransition = LOOK_D
        ? { duration: reduceMotion ? 0 : 0.34, ease: D_EASE }
        : { duration: reduceMotion ? 0 : 0.2, ease: "easeInOut" as const };
    const railToggle = LOOK_D && !isMobile && (
        <Tooltip content={`${toggleLabel} · ${TOGGLE_SHORTCUT}`} side="right" sideOffset={8}>
            <motion.button
                type="button"
                className={styles.railToggle}
                data-collapsed={collapsed || undefined}
                onClick={onToggleCollapse}
                aria-label={collapsed ? "Espandi menù laterale" : "Comprimi menù laterale"}
                aria-expanded={!collapsed}
                aria-keyshortcuts="Meta+B Control+B"
                initial={false}
                animate={{ x: SIDEBAR_D_MARGIN + cardWidth - RAIL_TOGGLE_HALF }}
                transition={{ x: widthTransition }}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            >
                <ChevronLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            </motion.button>
        </Tooltip>
    );
    const toggleButton = (
        <Tooltip content={`${toggleLabel} · ${TOGGLE_SHORTCUT}`} side={collapsed ? "right" : "bottom"} sideOffset={8}>
            <button
                type="button"
                className={styles.brandToggle}
                onClick={onToggleCollapse}
                aria-label={collapsed ? "Espandi menù laterale" : "Comprimi menù laterale"}
                aria-keyshortcuts="Meta+B Control+B"
            >
                {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
        </Tooltip>
    );

    // ===== Direzione D, telefono (artifact v28, sotto 861) =====
    // La barra diventa una carta in alto: logo e avatar, sotto le sezioni che
    // scorrono di lato. Le parti di una sezione stanno nelle schede della testata.
    if (LOOK_D && isMobile) {
        const phoneLink = (key: string, to: string, label: ReactNode, icon: ReactNode, active: boolean) => (
            <Link key={key} to={to} className={styles.phoneLinkD} aria-current={active ? "page" : undefined}>
                {icon && (
                    <span className={styles.phoneIconD} aria-hidden="true">
                        {icon}
                    </span>
                )}
                {label}
            </Link>
        );
        return (
            <header className={styles.phoneBarD}>
                <div className={styles.phoneTopD}>
                    {brand?.homeTo ? (
                        <Link to={brand.homeTo} className={styles.phoneBrandD} aria-label="CataloGlobe, vai all'inizio">
                            <Logo variant="icon" color="flat" size={27} alt="" />
                            <Logo variant="wordmark" color="auto" size={15} alt="" />
                        </Link>
                    ) : (
                        <span className={styles.phoneBrandD}>
                            <Logo variant="icon" color="flat" size={27} alt="" />
                            <Logo variant="wordmark" color="auto" size={15} alt="" />
                        </span>
                    )}
                    {/* Sede e campanella della testata, come icone (v30). */}
                    <div ref={phoneActionsRef} className={styles.phoneActionsD} />
                    {accountSlot && <div className={styles.phoneAccountD}>{accountSlot}</div>}
                </div>
                <nav ref={phoneNavRef} className={styles.phoneNavD} aria-label="Menu principale">
                    {groups.flatMap((group, i) => {
                        if (group.icon && group.title) {
                            const id = sectionId(group, i);
                            const last = readLastParts()[id];
                            const target =
                                group.items.find(item => item.id === last && !item.disabled) ??
                                group.items.find(item => !item.disabled);
                            if (!target) return [];
                            const active = Boolean(currentItem(group.items, pathname, search));
                            return [phoneLink(id, target.to, group.title, group.icon, active)];
                        }
                        return group.items
                            .filter(item => !item.disabled)
                            .map(item =>
                                phoneLink(
                                    item.id ?? item.to,
                                    item.to,
                                    item.label,
                                    item.icon,
                                    Boolean(currentItem([item], pathname, search))
                                )
                            );
                    })}
                </nav>
            </header>
        );
    }

    return (
        <>
            {isMobile && mobileOpen && (
                <button
                    className={styles.backdrop}
                    aria-label="Chiudi menu"
                    onClick={onRequestClose}
                />
            )}

            {railToggle}
            <motion.aside
                className={[styles.sidebar, isMobile ? styles.mobile : styles.desktop].join(" ")}
                data-collapsed={collapsed}
                initial={false}
                animate={{
                    width: LOOK_D ? cardWidth : collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
                    x: isMobile && !mobileOpen ? -SIDEBAR_EXPANDED : 0
                }}
                // Solo la larghezza, breve e lineare (§51.15); il cassetto
                // mobile scorre come prima. Movimento ridotto: nessuna transizione.
                transition={{
                    width: widthTransition,
                    x: reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30, restDelta: 0.5 }
                }}
                aria-hidden={isMobile && !mobileOpen}
            >
                {isMobile && (
                    <div className={styles.mobileHeader}>
                        <IconButton
                            variant="ghost"
                            icon={<X size={22} />}
                            aria-label="Chiudi menu"
                            onClick={onRequestClose}
                        />
                    </div>
                )}

                {brand && !isMobile && (
                    <div className={styles.brandRow} data-collapsed={collapsed || undefined}>
                        <span className={styles.brandMark}>
                            {brand.homeTo ? (
                                // L'ingresso nell'azienda (§51.6): decide `BusinessHomeRedirect`.
                                <Link to={brand.homeTo} className={styles.brandLink} aria-label="CataloGlobe, vai all'inizio">
                                    {brandLogo}
                                </Link>
                            ) : (
                                <span className={styles.brandLink}>{brandLogo}</span>
                            )}
                        </span>
                        {brand.actions && !collapsed && <span className={styles.brandActions}>{brand.actions}</span>}
                        {!collapsed && !LOOK_D && toggleButton}
                    </div>
                )}
                {/* Chiusa la cima tiene solo il segno, alto come la testata: la campanella scende sotto la linea. */}
                {brand && !isMobile && collapsed && (!LOOK_D || brand.actions) && (
                    <div className={styles.brandActionsCollapsed}>
                        {!LOOK_D && toggleButton}
                        {brand.actions}
                    </div>
                )}

                {/* Landmark a sé: il rimando che porta fuori dal contesto è
                    navigazione, ma non è una voce del menu. */}
                {headerSlot && (
                    <nav className={styles.headerSlot} aria-label="Contesto">
                        {headerSlot}
                    </nav>
                )}

                <nav className={styles.nav} aria-label="Menu principale">
                    <div
                        ref={scrollRef}
                        className={styles.sidebarScroll}
                        data-fade-top={fade.top || undefined}
                        data-fade-bottom={fade.bottom || undefined}
                        onScroll={updateFade}
                    >
                        {sectionsMode ? (
                            <ul className={`${styles.list} ${styles.sections}`}>
                                {groups.map((group, i) =>
                                    group.icon && group.title
                                        ? renderGroupAsSection(group, i)
                                        : group.items.map(renderItem)
                                )}
                            </ul>
                        ) : (
                            /* Fra i gruppi solo i titoli (aperta) e i loro trattini (chiusa), §51.15. */
                            groups.map((group, i) => (
                            <div key={i} className={styles.group} role="group" aria-label={group.title}>
                                {/* Una sezione di una parte sola (Panoramica, Sedi) è la sua voce: niente titolo. */}
                                {group.title && !(group.icon && group.items.length === 1) && (
                                    <span className={styles.groupTitle}>{group.title}</span>
                                )}
                                <ul className={styles.list}>
                                    {group.icon && group.items.length === 1
                                        ? renderItem({ ...group.items[0], label: group.title ?? group.items[0].label, icon: group.icon })
                                        : group.items.map(renderItem)}
                                </ul>
                            </div>
                            ))
                        )}
                        {footerSlot}
                    </div>
                    {(footerItems.length > 0 || accountSlot || (!isMobile && !brand && !LOOK_D)) && (
                        <div className={styles.footer}>
                            {footerItems.length > 0 && <ul className={styles.list}>{footerItems.map(renderItem)}</ul>}
                            {accountSlot && <div className={styles.account}>{accountSlot}</div>}
                            {!isMobile && !brand && !LOOK_D && (
                                <button
                                    type="button"
                                    className={styles.collapseToggle}
                                    data-labelled={collapseLabel && !collapsed ? "true" : undefined}
                                    onClick={onToggleCollapse}
                                    aria-label={collapsed ? "Espandi menù laterale" : "Comprimi menù laterale"}
                                    title={collapsed ? "Espandi" : "Comprimi"}
                                >
                                    <span className={styles.iconWrap} aria-hidden="true">
                                        <span className={styles.icon}>
                                            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                                        </span>
                                    </span>
                                    {collapseLabel && !collapsed && (
                                        <Text as="span" variant="body-sm" className={styles.toggleLabel}>
                                            {collapseLabel}
                                        </Text>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </nav>
            </motion.aside>
        </>
    );
}
