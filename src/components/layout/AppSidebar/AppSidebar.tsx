import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { Logo } from "@/components/ui/Logo/Logo";
import { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "@/constants/layout";
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
    to: string;
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
    /** Titolo del gruppo (`caption-xs` 600 uppercase muto). Sparisce collassata. */
    title?: string;
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
     * il piede. Sotto, `switcherSlot`: dove sei (azienda e sede).
     */
    brand?: { homeTo: string | null; actions?: ReactNode };
    switcherSlot?: ReactNode;
}

/** La scorciatoia di apri/chiudi come si scrive sulla tastiera di chi guarda. */
const TOGGLE_SHORTCUT =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";

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
                        <span className={styles.badge} data-ring={link.badgeRing} data-tone={link.badgeTone ?? "neutral"}>
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
    switcherSlot
}: AppSidebarProps) {
    const collapsedDesktop = !isMobile && collapsed;
    const { pathname } = useLocation();

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

    /**
     * Chiusa, il nome della voce passa al tooltip, sulla riga intera (mouse e
     * focus: `onFocus` di React risale dal link). Il trigger è un contenitore:
     * lo `Slot` di Radix trasformerebbe in stringa il `className` a funzione
     * di `NavLink`.
     */
    const withTooltip = (link: AppSidebarNavItem, node: ReactNode, content?: ReactNode) =>
        collapsedDesktop || content ? (
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
                : link.matchPrefixes?.some(p => pathname.startsWith(p))
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
            <Logo variant="icon" color="flat" size={27} alt="" className={styles.brandIcon} />
            {!collapsed && <Logo variant="wordmark" color="auto" size={15} alt="" className={styles.brandWordmark} />}
        </>
    );
    const toggleLabel = collapsed ? "Apri la barra laterale" : "Chiudi la barra laterale";
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

    return (
        <>
            {isMobile && mobileOpen && (
                <button
                    className={styles.backdrop}
                    aria-label="Chiudi menu"
                    onClick={onRequestClose}
                />
            )}

            <motion.aside
                className={[styles.sidebar, isMobile ? styles.mobile : styles.desktop].join(" ")}
                data-collapsed={collapsed}
                initial={false}
                animate={{
                    width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
                    x: isMobile && !mobileOpen ? -SIDEBAR_EXPANDED : 0
                }}
                // Solo la larghezza, breve e lineare (§51.15); il cassetto
                // mobile scorre come prima. Movimento ridotto: nessuna transizione.
                transition={{
                    width: { duration: reduceMotion ? 0 : 0.2, ease: "easeInOut" },
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
                        {!collapsed && toggleButton}
                    </div>
                )}
                {/* Chiusa la cima tiene solo il segno, alto come la testata: la campanella scende sotto la linea. */}
                {brand && !isMobile && collapsed && (
                    <div className={styles.brandActionsCollapsed}>
                        {toggleButton}
                        {brand.actions}
                    </div>
                )}

                {switcherSlot && !isMobile && <div className={styles.switcherSlot}>{switcherSlot}</div>}

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
                        {/* Fra i gruppi solo i titoli (aperta) e i loro trattini (chiusa), §51.15. */}
                        {groups.map((group, i) => (
                            <div key={i} className={styles.group} role="group" aria-label={group.title}>
                                {group.title && <span className={styles.groupTitle}>{group.title}</span>}
                                <ul className={styles.list}>{group.items.map(renderItem)}</ul>
                            </div>
                        ))}
                        {footerSlot}
                    </div>
                    {(footerItems.length > 0 || accountSlot || (!isMobile && !brand)) && (
                        <div className={styles.footer}>
                            {footerItems.length > 0 && <ul className={styles.list}>{footerItems.map(renderItem)}</ul>}
                            {accountSlot && <div className={styles.account}>{accountSlot}</div>}
                            {!isMobile && !brand && (
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
