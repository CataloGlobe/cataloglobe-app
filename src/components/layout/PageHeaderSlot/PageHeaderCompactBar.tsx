// ============================================================
// <PageHeaderCompactBar>
//
// Versione della toolbar di sezione per schermi stretti. NON è la
// stessa UI riorganizzata su due righe: è un'interfaccia diversa,
// costruita per progressive disclosure invece che per "far stare
// tutto". Una riga sola, sempre:
//
//   [Sezione ▾] [🔍] [vista] [⋯] [ Azione primaria ]
//
// La ricerca non ha mai un campo inline: si apre come overlay che
// prende l'intera riga, e la richiude un tap sulla freccia.
// ============================================================

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, MoreHorizontal, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@components/ui/Button/Button";
import { Menu } from "@components/ui/Menu";
import { SearchInput } from "@components/ui/Input/SearchInput";
import { SegmentedControl } from "@components/ui/SegmentedControl/SegmentedControl";
import type {
    PageHeaderAction,
    PageHeaderCompactConfig,
    PageHeaderFilterControl
} from "@/context/PageHeaderContext";
import styles from "./PageHeaderCompactBar.module.scss";

interface PageHeaderCompactBarProps {
    config: PageHeaderCompactConfig;
}

function renderMenuItems(actions: PageHeaderAction[]) {
    return actions.map(action => (
        <Fragment key={action.label}>
            {action.separatorBefore && <Menu.Separator />}
            <Menu.Item
                disabled={action.disabled}
                variant={action.variant}
                href={action.href}
                target={action.target}
                onSelect={action.href ? undefined : action.onClick}
            >
                {action.label}
            </Menu.Item>
        </Fragment>
    ));
}

export function PageHeaderCompactBar({ config }: PageHeaderCompactBarProps) {
    const { sections, activeSection, onSectionChange, search, primaryAction, secondaryActions, persistentIcons, statusControl, filterControls, leadingFilter, backAction, statusIndicator, loading } = config;

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    // Quale filtro ha l'overlay aperto (per `label`, unica nella pagina): con
    // più filtri sulla stessa riga un booleano non basterebbe a dire quale.
    const [openFilterLabel, setOpenFilterLabel] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isSearchOpen) searchRef.current?.focus();
    }, [isSearchOpen]);

    // I controlli spariscono dalla config (la pagina cambia tab, o passa a una
    // vista che non li ha) mentre il rispettivo overlay è aperto: senza questo
    // resterebbe una riga con dentro qualcosa che non appartiene più a nessuno.
    useEffect(() => {
        if (!search) setIsSearchOpen(false);
    }, [search]);

    // Tutti i filtri della riga in un elenco solo: il `leadingFilter` sta in un
    // posto diverso ma si comporta identico, quindi overlay e chiusura sono
    // scritti una volta per entrambi.
    const allFilters = useMemo(
        () => [...(leadingFilter ? [leadingFilter] : []), ...(filterControls ?? [])],
        [leadingFilter, filterControls]
    );

    const openFilter = allFilters.find(filter => filter.label === openFilterLabel);

    useEffect(() => {
        if (openFilterLabel && !allFilters.some(filter => filter.label === openFilterLabel)) {
            setOpenFilterLabel(null);
        }
    }, [allFilters, openFilterLabel]);

    if (isSearchOpen && search) {
        return (
            <div className={styles.bar}>
                <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setIsSearchOpen(false)}
                    aria-label="Chiudi ricerca"
                >
                    <ArrowLeft size={18} />
                </button>
                <SearchInput
                    ref={searchRef}
                    value={search.value}
                    onChange={event => search.onChange(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === "Escape") setIsSearchOpen(false);
                    }}
                    placeholder={search.placeholder}
                    allowClear
                    onClear={() => search.onChange("")}
                    containerClassName={styles.searchField}
                    inputClassName={styles.searchInput}
                />
            </div>
        );
    }

    // Overlay filtro: stesso meccanismo della ricerca — prende la riga, si
    // torna con la freccia. Scelta singola, quindi l'opzione si applica al tocco
    // e chiude: un "conferma" chiederebbe di confermare una scelta già fatta.
    if (openFilter) {
        return (
            <div className={styles.filterOverlay}>
                <div className={styles.bar}>
                    <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setOpenFilterLabel(null)}
                        aria-label="Chiudi filtro"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className={styles.filterTitle}>{openFilter.label}</span>
                </div>

                <ul className={styles.filterOptions} role="listbox" aria-label={openFilter.label}>
                    {openFilter.options.map(option => {
                        const isSelected = option.value === openFilter.value;
                        return (
                            <li key={option.value}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`${styles.filterOption} ${isSelected ? styles.filterOptionSelected : ""}`}
                                    onClick={() => {
                                        openFilter.onChange(option.value);
                                        setOpenFilterLabel(null);
                                    }}
                                >
                                    <span>{option.label}</span>
                                    {isSelected && <Check size={16} aria-hidden />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    const activeLabel =
        sections?.find(section => section.value === activeSection)?.label ?? sections?.[0]?.label;
    const hasSections = Boolean(sections && sections.length > 0 && activeLabel);

    // Chip solo per i filtri fra le icone: quello in leading mostra già il
    // proprio valore nella pillola, ripeterlo sotto sarebbe dire due volte la
    // stessa cosa nello stesso sguardo.
    const activeIconFilters = (filterControls ?? [])
        .map(filter => ({
            filter,
            activeLabel: filter.value !== filter.defaultValue
                ? filter.options.find(option => option.value === filter.value)?.label
                : undefined
        }))
        .filter((entry): entry is { filter: PageHeaderFilterControl; activeLabel: string } =>
            Boolean(entry.activeLabel)
        );

    const leadingFilterLabel = leadingFilter
        ? leadingFilter.options.find(option => option.value === leadingFilter.value)?.label
        : undefined;
    const isLeadingFilterActive = Boolean(leadingFilter) && leadingFilter!.value !== leadingFilter!.defaultValue;

    const mainRow = (
        <div className={styles.bar}>
            {hasSections && (
                <Menu
                    align="start"
                    trigger={
                        <button type="button" className={styles.sectionPicker}>
                            <span className={styles.sectionLabel}>{activeLabel}</span>
                            <ChevronDown size={16} aria-hidden className={styles.sectionChevron} />
                        </button>
                    }
                >
                    {sections!.map(section => (
                        <Menu.Item
                            key={section.value}
                            disabled={section.disabled}
                            onSelect={
                                section.disabled ? undefined : () => onSectionChange?.(section.value)
                            }
                        >
                            {/* Il perché di una sezione spenta si legge qui, nella
                                lista: un tooltip al tocco su mobile non si vede. */}
                            {section.description ? (
                                <span className={styles.sectionOption}>
                                    {section.label}
                                    <span className={styles.sectionOptionHint}>
                                        {section.description}
                                    </span>
                                </span>
                            ) : (
                                section.label
                            )}
                        </Menu.Item>
                    ))}
                </Menu>
            )}

            {/* Filtro al posto del picker: la pagina non ha sezioni, quindi
                quello spazio ospita il filtro principale col valore in chiaro. */}
            {!hasSections && leadingFilter && (
                <button
                    type="button"
                    className={[styles.sectionPicker, isLeadingFilterActive ? styles.sectionPickerActive : ""]
                        .filter(Boolean)
                        .join(" ")}
                    onClick={() => setOpenFilterLabel(leadingFilter.label)}
                    aria-label={`${leadingFilter.label}: ${leadingFilterLabel}. Cambia filtro`}
                >
                    <SlidersHorizontal size={15} aria-hidden className={styles.sectionFilterIcon} />
                    <span className={styles.sectionLabel}>{leadingFilterLabel}</span>
                    <ChevronDown size={16} aria-hidden className={styles.sectionChevron} />
                </button>
            )}

            {/* Ritorno alla lista: un bersaglio solo, nessun menu da aprire. */}
            {!hasSections && !leadingFilter && backAction && (
                <button
                    type="button"
                    className={styles.backAction}
                    onClick={backAction.onClick}
                >
                    <ArrowLeft size={18} aria-hidden />
                    <span className={styles.sectionLabel}>{backAction.label}</span>
                </button>
            )}

            {/* Spinge il gruppo di destra al bordo anche quando manca il selettore
                sezione (pagine senza tab): niente placeholder, niente vuoti. */}
            <div className={styles.spacer} />

            {search && (
                <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setIsSearchOpen(true)}
                    aria-label="Cerca"
                >
                    <Search size={18} />
                </button>
            )}

            {filterControls?.map(filter => {
                const current = filter.value !== filter.defaultValue
                    ? filter.options.find(option => option.value === filter.value)?.label
                    : undefined;
                return (
                    <button
                        key={filter.label}
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setOpenFilterLabel(filter.label)}
                        aria-label={
                            current
                                ? `${filter.label}: ${current}`
                                : `Filtra per ${filter.label.toLowerCase()}`
                        }
                    >
                        {filter.icon ?? <SlidersHorizontal size={18} />}
                        {/* Il pallino dice "c'è un filtro attivo" senza dover
                            aprire nulla: la chip sotto la riga dice quale. */}
                        {current && <span className={styles.filterDot} aria-hidden />}
                    </button>
                );
            })}

            {/* Stato dell'entità: prima del cluster azioni, stesso ordine di
                lettura della toolbar comoda. Sempre reso — è la condizione di
                ciò che si sta modificando, non un'opzione da riporre. */}
            {statusControl && (
                <div
                    role="group"
                    aria-label={statusControl.label}
                    className={[styles.statusControl, statusControl.disabled ? styles.readonly : ""]
                        .filter(Boolean)
                        .join(" ")}
                >
                    <SegmentedControl<string>
                        size="sm"
                        value={statusControl.value}
                        onChange={statusControl.onChange}
                        options={statusControl.options}
                    />
                </div>
            )}

            {persistentIcons?.map(item => (
                <button
                    key={item.label}
                    type="button"
                    className={styles.iconButton}
                    onClick={item.onClick}
                    aria-label={item.label}
                    title={item.label}
                >
                    {item.icon}
                </button>
            ))}

            {secondaryActions && secondaryActions.length > 0 && (
                <Menu
                    align="end"
                    trigger={
                        <button type="button" className={styles.iconButton} aria-label="Altre azioni">
                            <MoreHorizontal size={18} />
                        </button>
                    }
                >
                    {renderMenuItems(secondaryActions)}
                </Menu>
            )}

            {/* Stato invece dell'azione: reso solo quando non c'è una primaria,
                così i due non competono mai per lo stesso posto in fondo alla
                riga. `role="status"` — si legge, non si tocca. */}
            {!primaryAction && statusIndicator && (
                <span className={styles.status} role="status">
                    {statusIndicator.icon}
                    {statusIndicator.label}
                </span>
            )}

            {primaryAction &&
                (primaryAction.items ? (
                    <Menu
                        align="end"
                        trigger={
                            <Button
                                variant="primary"
                                loading={loading}
                                disabled={primaryAction.disabled}
                                className={styles.primary}
                            >
                                {primaryAction.label}
                            </Button>
                        }
                    >
                        {renderMenuItems(primaryAction.items)}
                    </Menu>
                ) : primaryAction.href ? (
                    // Primaria che porta altrove: `<a>` vero, non un bottone che
                    // finge di navigare.
                    <Button
                        as="a"
                        variant="primary"
                        href={primaryAction.href}
                        target={primaryAction.target}
                        rel={primaryAction.target === "_blank" ? "noopener noreferrer" : undefined}
                        className={styles.primary}
                    >
                        {primaryAction.label}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        loading={loading}
                        disabled={primaryAction.disabled}
                        onClick={primaryAction.onClick}
                        className={styles.primary}
                    >
                        {primaryAction.label}
                    </Button>
                ))}
        </div>
    );

    // Senza filtri attivi la barra resta una riga sola: le chip compaiono solo
    // quando c'è davvero qualcosa da ricordare all'utente.
    if (activeIconFilters.length === 0) return mainRow;

    return (
        <div className={styles.stack}>
            {mainRow}
            <div className={styles.filterChips}>
                {/* Due bersagli distinti dentro una pillola sola: il corpo
                    riapre l'overlay (stesso gesto dell'icona), la × azzera senza
                    passare da lì. Bottoni fratelli e non annidati — un bottone
                    dentro un bottone non è HTML valido. */}
                {activeIconFilters.map(({ filter, activeLabel: value }) => (
                    <span key={filter.label} className={styles.filterChip}>
                        <button
                            type="button"
                            className={styles.filterChipMain}
                            onClick={() => setOpenFilterLabel(filter.label)}
                            aria-label={`${filter.label}: ${value}. Cambia filtro`}
                        >
                            <span className={styles.filterChipLabel}>{filter.label}:</span>
                            {value}
                        </button>
                        <button
                            type="button"
                            className={styles.filterChipClear}
                            onClick={() => filter.onChange(filter.defaultValue)}
                            aria-label={`Rimuovi filtro ${filter.label.toLowerCase()}`}
                        >
                            <X size={13} aria-hidden />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
}
