import { useEffect, useState, useMemo, useCallback } from "react";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconPalette } from "@tabler/icons-react";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { TableRowActions, type TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import styles from "./Styles.module.scss";

import { useNavigate } from "react-router-dom";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnTenant } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { listStyles, duplicateStyle, deleteStyle, V2Style } from "@/services/supabase/styles";
import { StyleSwatch } from "@/components/ui/StyleSwatch/StyleSwatch";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { useRuleAppearance } from "@/hooks/useRuleAppearance";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { appearanceOf } from "@/utils/ruleAppearance";
import { StyleDeleteDrawer } from "./StyleDeleteDrawer";
import { stylePalette } from "@/components/ui/StyleSwatch/stylePalette";
import { LOOK_D } from "@/styles/lookD";
import { VetrinaHead, type VetrinaView } from "../Vetrina/VetrinaHead";
import { VetrinaCrea } from "../Vetrina/VetrinaCrea";
import { StylePhone, VetrinaCard, VetrinaNone } from "../Vetrina/VetrinaCard";
import { useCompactHead } from "../Vetrina/useCompactHead";
import { leadOf, matchesOnAir, onAirOf, sortVetrina, type OnAir, type OnAirFilter, type VetrinaSort } from "../Vetrina/vetrinaModel";
import vs from "../Vetrina/Vetrina.module.scss";

const OFF_AIR: OnAir = { state: "off", when: null, where: null };

const VIEW_MODE_KEY = "cataloglobe-styles-view-mode";

/**
 * Il numero delle regole che lo nominano, a riga secondaria (§34.3): lo stato
 * vivo sta nel badge, da `ruleAppearance`.
 */
function usageLabel(style: V2Style): string {
    const count = style.usage_count || 0;
    if (count === 0) return "In nessuna regola";
    return `Usato in ${count} ${count === 1 ? "regola" : "regole"}`;
}

/** ST3: «Di sistema» è testo, davanti all'uso: «Di sistema · in nessuna regola». */
function usageLine(style: V2Style): string {
    const usage = usageLabel(style);
    return style.is_system ? `Di sistema · ${usage.charAt(0).toLowerCase()}${usage.slice(1)}` : usage;
}

function readViewMode(): "list" | "grid" {
    try {
        return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

export default function Styles() {
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnTenant(permissions, "styles.write") : false;
    // Gate di lettura prima della fetch: chi non ha `styles.read` vede il
    // blocco di `PageGate` e nessuna richiesta parte.
    const canRead = permissions != null && canDoOnTenant(permissions, "styles.read");

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [allStyles, setAllStyles] = useState<V2Style[]>([]);
    // Lo stato d'uso vivo (§34.3, §50.13): la stessa competizione di Programmazione.
    const appearance = useRuleAppearance(currentTenantId, canRead);
    // Sotto 768 la colonna «Utilizzo» esce: lo stato sta sotto il nome.
    const isPhone = useMediaQuery("(max-width: 767px)");

    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">(readViewMode);

    const handleViewModeChange = useCallback((mode: "list" | "grid") => {
        setViewMode(mode);
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch {
            // Preferenza di vista: senza storage vale per la sessione.
        }
    }, []);

    // D (Visual Redesign 2): filtri «In onda», ordine e testata che si stringe.
    const [onAirFilter, setOnAirFilter] = useState<OnAirFilter>("all");
    const [sort, setSort] = useState<VetrinaSort>("onda");
    const { compact, setTop } = useCompactHead();

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [styleToDelete, setStyleToDelete] = useState<V2Style | null>(null);

    const loadData = useCallback(async () => {
        if (!currentTenantId || !canRead) return;
        try {
            setIsLoading(true);
            setLoadError(false);
            const data = await listStyles(currentTenantId);
            setAllStyles(data);
        } catch (error) {
            // Un errore non è un elenco vuoto: la pagina lo dice, con «Riprova».
            console.error("Caricamento stili:", error);
            setLoadError(true);
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, canRead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ST3: la pillola dice solo «Attivo adesso»; il resto lo dice la riga dell'uso.
    const isLiveNow = useCallback(
        (style: V2Style) =>
            appearance.index !== null && appearanceOf(appearance.index, { kind: "style", id: style.id }).summary === "liveNow",
        [appearance.index]
    );

    // ST2: prima gli stili attivi adesso, poi per nome.
    const filteredStyles = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        return allStyles
            .filter(style => !normalizedQuery || style.name.toLowerCase().includes(normalizedQuery))
            .sort((a, b) => {
                const live = Number(isLiveNow(b)) - Number(isLiveNow(a));
                return live !== 0 ? live : a.name.localeCompare(b.name, "it");
            });
    }, [allStyles, isLiveNow, searchQuery]);
    const hasSearch = searchQuery.trim().length > 0;

    // D: la riga «In onda» di ogni stile e la frase in cima.
    const onAirById = useMemo(() => {
        const map = new Map<string, OnAir>();
        if (!appearance.index) return map;
        for (const style of allStyles) {
            map.set(style.id, onAirOf(appearanceOf(appearance.index, { kind: "style", id: style.id }), appearance.activities));
        }
        return map;
    }, [appearance.index, appearance.activities, allStyles]);
    const onAirOfStyle = useCallback((style: V2Style) => onAirById.get(style.id) ?? OFF_AIR, [onAirById]);
    const lead = useMemo(() => {
        if (!LOOK_D || !appearance.index) return null;
        const index = appearance.index;
        return leadOf(
            allStyles.map(st => ({ name: st.name, appearance: appearanceOf(index, { kind: "style", id: st.id }) })),
            appearance.activities,
            { none: "nessuno stile", lead: "Adesso la pagina si veste con" }
        );
    }, [appearance.index, appearance.activities, allStyles]);
    const onAirCounts = {
        all: allStyles.length,
        on: allStyles.filter(st => onAirOfStyle(st).state !== "off").length,
        off: allStyles.filter(st => onAirOfStyle(st).state === "off").length
    };
    const dStyles = sortVetrina(
        filteredStyles.filter(st => matchesOnAir(onAirFilter, onAirOfStyle(st))),
        sort,
        onAirOfStyle
    );
    const clearD = () => {
        setSearchQuery("");
        setOnAirFilter("all");
    };

    // «Crea stile» apre il tunnel di creazione (D124); finito, si atterra sull'editor.
    const handleCreateClick = useCallback(() => {
        if (!ensureActive()) return;
        navigate(`/business/${currentTenantId}/crea/stile?da=stili`);
    }, [ensureActive, navigate, currentTenantId]);

    const headerActions = useMemo(() => (
        <>
            <ToolbarSearch value={searchQuery} onChange={setSearchQuery} placeholder="Cerca stili..." />
            <SegmentedControl<"list" | "grid">
                iconsOnly
                value={viewMode}
                onChange={handleViewModeChange}
                options={[
                    { value: "grid", icon: <LayoutGrid size={16} />, label: "Vista griglia" },
                    { value: "list", icon: <ListIcon size={16} />, label: "Vista lista" }
                ]}
            />
            {canWrite && (
                <Button variant="primary" onClick={handleCreateClick} disabled={!canEdit}>
                    Crea stile
                </Button>
            )}
        </>
    ), [handleCreateClick, canEdit, canWrite, searchQuery, viewMode, handleViewModeChange]);

    // Stessa toolbar a dati per lo stato compatto: nessuna tab, quindi niente
    // `sections` — la riga parte dalle icone.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        search: { value: searchQuery, onChange: setSearchQuery, placeholder: "Cerca stili..." },
        persistentIcons: [
            viewMode === "list"
                ? { icon: <LayoutGrid size={18} />, label: "Vista griglia", onClick: () => handleViewModeChange("grid") }
                : { icon: <ListIcon size={18} />, label: "Vista lista", onClick: () => handleViewModeChange("list") }
        ],
        primaryAction: canWrite ? { label: "Crea stile", onClick: handleCreateClick, disabled: !canEdit } : undefined
    }), [searchQuery, viewMode, handleViewModeChange, canWrite, handleCreateClick, canEdit]);

    usePageHeader({
        title: "Stili",
        // Nella D i comandi stanno nella pagina, sotto la frase.
        actions: LOOK_D ? undefined : headerActions,
        compact: LOOK_D ? undefined : headerCompact
    });

    // L'editor è il tunnel, per creare e per modificare (D186).
    const styleUrl = useCallback(
        (style: V2Style) => `/business/${currentTenantId}/crea/stile/${style.id}?da=stili`,
        [currentTenantId]
    );

    const handleDuplicateClick = useCallback(
        async (style: V2Style) => {
            if (!ensureActive() || !currentTenantId) return;
            try {
                const copy = await duplicateStyle(style.id, `Copia di ${style.name}`, currentTenantId);
                if (LOOK_D) {
                    // D: la copia si può togliere subito, dal toast.
                    showToast({
                        message: `«${copy.name}» creato. Nessuno lo vede finché non lo metti in onda.`,
                        type: "success",
                        actionLabel: "Annulla",
                        onAction: () => void deleteStyle(copy.id, currentTenantId).then(loadData, () => {})
                    });
                } else {
                    showToast({ message: "Stile duplicato con successo.", type: "success" });
                }
                loadData();
            } catch (error) {
                console.error("Errore duplicazione stile:", error);
                showToast({ message: "Impossibile duplicare lo stile.", type: "error" });
            }
        },
        [loadData, showToast, ensureActive, currentTenantId]
    );

    const handleDeleteClick = useCallback((style: V2Style) => {
        if (!ensureActive()) return;
        // D: quello in onda non si elimina; prima si toglie dal Calendario.
        if (LOOK_D && onAirOfStyle(style).state !== "off") {
            showToast({ message: `«${style.name}» è in onda: prima toglilo dal Calendario, poi si può eliminare.`, type: "info" });
            return;
        }
        setStyleToDelete(style);
        setIsDeleteOpen(true);
    }, [ensureActive, onAirOfStyle, showToast]);

    // Niente selezione multipla: eliminare uno stile in uso chiede il suo
    // sostitutivo, e quella scelta non si fa una volta per N stili (§34.2).
    const renderRowActions = useCallback(
        (style: V2Style) => {
            const actions: TableRowAction[] = [
                rowAction.edit(() => navigate(styleUrl(style)), { readOnly: !canWrite })
            ];
            if (canWrite) {
                actions.push(rowAction.duplicate(() => handleDuplicateClick(style)));
                if (!style.is_system) actions.push(rowAction.remove(() => handleDeleteClick(style)));
            }
            return <TableRowActions actions={actions} ariaLabel={`Azioni stile ${style.name}`} />;
        },
        [handleDeleteClick, handleDuplicateClick, canWrite, navigate, styleUrl]
    );

    const usageBadge = useCallback(
        (style: V2Style) => (isLiveNow(style) ? <StatusBadge variant="success" label="Attivo adesso" /> : undefined),
        [isLiveNow]
    );

    const columns = useMemo<ColumnDefinition<V2Style>[]>(
        () => [
            {
                id: "preview",
                header: "Anteprima",
                width: "88px",
                cell: (_value, style) => <StyleSwatch style={style} compact />
            },
            {
                id: "name",
                header: "Nome stile",
                width: "1fr",
                accessor: style => style.name,
                cell: (_value, style) => (
                    <div className={styles.cellTwoLine}>
                        <span className={styles.nameLine}>
                            <Text variant="body-sm" weight={600}>{style.name}</Text>
                        </span>
                        <Text variant="caption" colorVariant="muted">
                            {isPhone ? usageLine(style) : `Versione ${style.current_version?.version || "0"} · ${usageLine(style)}`}
                        </Text>
                        {isPhone && usageBadge(style)}
                    </div>
                )
            },
            {
                id: "usage",
                header: "Utilizzo",
                width: "160px",
                hideOnPhone: true,
                cell: (_value, style) => usageBadge(style)
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_value, style) => renderRowActions(style)
            }
        ],
        [renderRowActions, usageBadge, isPhone]
    );

    const renderContent = () => {
        if (loadError) {
            return (
                <EmptyState
                    icon={<IconPalette />}
                    title="Non è stato possibile caricare gli stili"
                    description="Controlla la connessione e riprova."
                    action={
                        <Button variant="secondary" onClick={() => loadData()}>
                            Riprova
                        </Button>
                    }
                />
            );
        }

        if (!isLoading && allStyles.length === 0) {
            return (
                <EmptyState
                    icon={<IconPalette />}
                    title="Nessuno stile"
                    description="Uno stile decide colori, forme e caratteri della pagina che i clienti vedono."
                    action={
                        canWrite ? (
                            <Button variant="primary" onClick={handleCreateClick} disabled={!canEdit}>
                                Crea stile
                            </Button>
                        ) : undefined
                    }
                />
            );
        }

        if (LOOK_D && !isLoading && allStyles.length > 0 && dStyles.length === 0) {
            return <VetrinaNone onClear={clearD} />;
        }

        // D: le card con il telefono nei colori dello stile (al telefono sempre Fogli).
        if (LOOK_D && (viewMode === "grid" || isPhone)) {
            if (isLoading) return <CardGrid loading skeletonShape={{ media: true, mediaHeight: 140 }} minColumnWidth={232} />;
            return (
                <div className={vs.grid}>
                    <ul className={vs.cards} aria-label="Stili">
                        {dStyles.map(style => (
                            <li key={style.id}>
                                <VetrinaCard
                                    family="style"
                                    to={styleUrl(style)}
                                    preview={<StylePhone palette={stylePalette(style)} />}
                                    name={
                                        <>
                                            {style.name}
                                            {style.is_system && <i className={vs.sys}>Di sistema</i>}
                                        </>
                                    }
                                    label={style.name}
                                    meta={`Versione ${style.current_version?.version || "0"}`}
                                    onAir={onAirOfStyle(style)}
                                    onMetti={canWrite && canEdit ? () => navigate(`/business/${currentTenantId}/crea/stile/${style.id}?da=stili&metti=1`) : undefined}
                                    actions={renderRowActions(style)}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            );
        }

        if (viewMode === "list") {
            return (
                <DataTable<V2Style>
                    data={LOOK_D ? dStyles : filteredStyles}
                    columns={columns}
                    isLoading={isLoading}
                    ariaLabel="Stili"
                    isFiltered={hasSearch}
                    onClearFilters={() => setSearchQuery("")}
                    onRowClick={style => navigate(styleUrl(style))}
                />
            );
        }

        if (!isLoading && filteredStyles.length === 0) {
            return <EmptyState variant="filtered" title="Nessun risultato" onClearFilters={() => setSearchQuery("")} />;
        }

        return (
            <CardGrid loading={isLoading} skeletonShape={{ media: true, mediaHeight: 140 }} minColumnWidth={260} aria-label="Stili">
                {filteredStyles.map(style => (
                    <CardGridItem
                        key={style.id}
                        to={styleUrl(style)}
                        aria-label={style.name}
                        media={<StyleSwatch style={style} />}
                        mediaHeight={140}
                        title={style.name}
                        subtitle={usageLine(style)}
                        badge={usageBadge(style)}
                        actions={renderRowActions(style)}
                    />
                ))}
            </CardGrid>
        );
    };

    if (permissions != null && !canRead) {
        return <PageGate readPermission="styles.read">{() => null}</PageGate>;
    }

    return (
        <PageGate readPermission="styles.read">
            {() => (
                <section className={LOOK_D ? `${styles.listPage} ${vs.page}` : styles.listPage}>
                    {LOOK_D && allStyles.length > 0 && (
                        <VetrinaHead
                            family="style"
                            lead={lead}
                            filter={onAirFilter}
                            onFilter={setOnAirFilter}
                            counts={onAirCounts}
                            sort={sort}
                            onSort={setSort}
                            query={searchQuery}
                            onQuery={setSearchQuery}
                            placeholder="Cerca stili"
                            view={{
                                value: viewMode === "list" ? "elenco" : "fogli",
                                onChange: (v: VetrinaView) => handleViewModeChange(v === "elenco" ? "list" : "grid")
                            }}
                            crea={<VetrinaCrea da="stili" disabled={!canEdit} />}
                            compact={compact}
                            setTop={setTop}
                        />
                    )}
                    <div className={styles.listContent} data-view-mode={viewMode}>
                        {renderContent()}
                    </div>

                    <StyleDeleteDrawer
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        styleData={styleToDelete}
                        allStyles={allStyles}
                        onSuccess={loadData}
                    />
                </section>
            )}
        </PageGate>
    );
}
