import { useCallback, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { DataTableDragHandle, SortableDataTableRow } from "@/components/ui/DataTable/SortableDataTableRow";
import { ScrollText, Store, Utensils } from "lucide-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { useToast } from "@/context/Toast/ToastContext";
import { listStories, reorderStories, type StoryWithProduct } from "@/services/supabase/stories";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { getActivities } from "@/services/supabase/activities";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { appearanceOf, describeStoryOnAir, storyAbout, STORY_UNSEEN_LABEL, type AppearanceActivity } from "@/utils/ruleAppearance";
import { useRuleAppearance } from "@/hooks/useRuleAppearance";
import { listCatalogProductPairs } from "@/services/supabase/catalogs";
import { DB } from "../Programming/calendar/calendarFlags";
import StoryDeleteDialog from "./StoryDeleteDialog";
import { StoryBrandCard } from "./components/StoryBrandCard";
import { StoryBrandDrawer } from "./components/StoryBrandDrawer";
import { useBrandStoryDraft } from "./hooks/useBrandStoryDraft";
import styles from "./Stories.module.scss";
import { LOOK_D } from "@/styles/lookD";
import { VetrinaHead, type VetrinaView } from "../Vetrina/VetrinaHead";
import { VetrinaCrea } from "../Vetrina/VetrinaCrea";
import { TilePreview, VetrinaCard, VetrinaNone } from "../Vetrina/VetrinaCard";
import { useCompactHead } from "../Vetrina/useCompactHead";
import { sortVetrina, storieLead, type OnAir, type VetrinaSort } from "../Vetrina/vetrinaModel";
import vs from "../Vetrina/Vetrina.module.scss";

import { useTenantId } from "@/context/useTenantId";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";

import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

type StoryFilter = "all" | "drafts" | "sede" | "noCover";
/** I filtri della D (`pStr`): Tutte, In onda, «Bozze e ferme», poi i due di oggi. */
type StoryFilterD = "all" | "on" | "off";
const OFF_AIR: OnAir = { state: "off", when: null, where: null };

function reindexRows(rows: StoryWithProduct[]): StoryWithProduct[] {
    return rows.map((row, index) => ({ ...row, sort_order: index + 1 }));
}

export default function Stories() {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const tenantId = useTenantId();
    const { canEdit, ensureActive } = useEnsureActive();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "stories.write") : false;
    // Gate di lettura prima della fetch: senza `stories.read` nessuna richiesta.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "stories.read");

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [stories, setStories] = useState<StoryWithProduct[]>([]);
    const [isBrandOpen, setIsBrandOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<StoryWithProduct | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<StoryFilter>("all");
    // Dove appare (§34.7, §50.13): le sedi, per nominare quella di una storia.
    const [activities, setActivities] = useState<AppearanceActivity[]>([]);
    // Sotto 768 «Dove appare» scende sotto il titolo (DataTable: due colonne).
    const isPhone = useMediaQuery("(max-width: 767px)");
    // D (Visual Redesign 2): filtri, ordine, Fogli o Elenco e testata che si stringe.
    const [filterD, setFilterD] = useState<StoryFilterD>("all");
    const [sort, setSort] = useState<VetrinaSort>("onda");
    const [viewD, setViewD] = useState<VetrinaView>("fogli");
    const { compact, setTop } = useCompactHead();

    useEffect(() => {
        if (!tenantId || !canRead) return;
        getActivities(tenantId)
            .then(list => setActivities(list.map(a => ({ id: a.id, name: a.name, status: a.status }))))
            .catch(error => console.warn("[Stories] sedi non caricate:", error));
    }, [tenantId, canRead]);

    // «Nessuno la vede» per il prodotto (punto 18): vale da quando la storia di un
    // prodotto sta solo nella sua scheda, cioè col database nuovo. Fino ad allora
    // compare anche sotto il menù, e l'elenco non lo dice.
    const hasProductStory = stories.some(story => story.product_id !== null);
    const watchMenus = DB.ready && canRead && hasProductStory;
    const ruleAppearance = useRuleAppearance(tenantId, watchMenus);
    const [pairs, setPairs] = useState<{ catalog_id: string; product_id: string }[] | null>(null);
    useEffect(() => {
        if (!tenantId || !watchMenus) return;
        listCatalogProductPairs(tenantId)
            .then(setPairs)
            .catch(error => console.warn("[Stories] menù dei prodotti non caricati:", error));
    }, [tenantId, watchMenus]);
    // I prodotti che stanno in un menù in onda; null = non si sa.
    const liveProducts = useMemo(() => {
        const index = ruleAppearance.index;
        if (!watchMenus || !index || !pairs) return null;
        const live = new Map<string, boolean>();
        const out = new Set<string>();
        for (const pair of pairs) {
            let on = live.get(pair.catalog_id);
            if (on === undefined) {
                const summary = appearanceOf(index, { kind: "catalog", id: pair.catalog_id }).summary;
                on = summary === "liveNow" || summary === "assigned";
                live.set(pair.catalog_id, on);
            }
            if (on) out.add(pair.product_id);
        }
        return out;
    }, [watchMenus, ruleAppearance.index, pairs]);

    // Il cappello (§50.11/4): la card in cima all'elenco lo mostra com'è, il
    // drawer lo modifica e salva subito.
    const brand = useBrandStoryDraft(tenantId ?? null, canRead);

    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;
        try {
            setLoading(true);
            setLoadError(false);
            const data = await listStories(tenantId);
            setStories(data);
        } catch (error) {
            // Un errore non è un elenco vuoto: la pagina lo dice, con «Riprova».
            console.error("Caricamento storie:", error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [tenantId, canRead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // «Crea storia» apre il tunnel di creazione (D124); finito, si atterra sulla storia.
    const handleCreate = useCallback(() => {
        if (!ensureActive()) return;
        navigate(`/business/${tenantId}/crea/storia?da=storie`);
    }, [ensureActive, navigate, tenantId]);

    const handleEditBrand = useCallback(() => {
        if (!ensureActive()) return;
        setIsBrandOpen(true);
    }, [ensureActive]);

    const actions = useMemo(
        () => (
            <>
                <ToolbarSearch value={searchQuery} onChange={setSearchQuery} placeholder="Cerca storie..." />
                {canWrite && (
                    <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                        Crea storia
                    </Button>
                )}
            </>
        ),
        [handleCreate, canEdit, canWrite, searchQuery]
    );

    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({
            search: { value: searchQuery, onChange: setSearchQuery, placeholder: "Cerca storie..." },
            primaryAction: canWrite ? { label: "Crea storia", onClick: handleCreate, disabled: !canEdit } : undefined
        }),
        [canWrite, canEdit, handleCreate, searchQuery]
    );

    usePageHeader({
        title: "Storie",
        subtitle: LOOK_D ? undefined : "Ogni storia sta con la cosa che racconta.",
        actions: LOOK_D ? undefined : actions,
        compact: LOOK_D ? undefined : headerCompact
    });

    // L'ordine è quello in cui i clienti trovano le storie: si salva subito
    // (§27.2, spostare una riga è struttura).
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        if (!ensureActive()) return;

        const oldIndex = stories.findIndex(row => row.id === active.id);
        const newIndex = stories.findIndex(row => row.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reindexed = reindexRows(arrayMove(stories, oldIndex, newIndex));
        setStories(reindexed);

        if (!tenantId) return;
        try {
            await reorderStories(
                tenantId,
                reindexed.map(row => ({ id: row.id, sort_order: row.sort_order }))
            );
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio dell'ordine." });
            await loadData();
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const storyUrl = (item: StoryWithProduct) => `/business/${tenantId}/crea/storia/${item.id}?da=storie`;

    // Chip e ricerca: filtrando non si riordina, l'ordine è quello dell'elenco intero.
    const matchesFilter = (item: StoryWithProduct, which: StoryFilter) =>
        which === "drafts" ? item.status !== "published" : which === "sede" ? item.activity_id !== null : which === "noCover" ? !item.cover_media : true;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleStories = stories.filter(
        item =>
            matchesFilter(item, filter) &&
            (!normalizedQuery || `${item.title} ${item.eyebrow ?? ""}`.toLowerCase().includes(normalizedQuery))
    );
    const isFiltered = (LOOK_D ? filterD : filter) !== "all" || normalizedQuery.length > 0;
    const canReorder = canWrite && !isFiltered;
    const filterOptions = (
        [
            { value: "all", label: "Tutte" },
            { value: "drafts", label: "Pronte, non in onda" },
            { value: "sede", label: "Legate a una sede" },
            { value: "noCover", label: "Senza copertina" }
        ] as const
    ).map(option => ({ ...option, count: stories.filter(item => matchesFilter(item, option.value)).length }));

    // Di cosa parla (punto 18): il prodotto, oppure il locale con la sua sede.
    const aboutCell = (item: StoryWithProduct) => {
        const about = storyAbout(item, activities);
        return (
            <span className={styles.about}>
                {about.kind === "product" ? <Utensils aria-hidden="true" /> : <Store aria-hidden="true" />}
                <Text as="span" variant={isPhone ? "caption" : "body-sm"} colorVariant={isPhone ? "muted" : undefined} className={styles.aboutLabel}>
                    {about.label}
                </Text>
            </span>
        );
    };
    const onAirOf = (item: StoryWithProduct) =>
        describeStoryOnAir(item, activities, !canEdit, item.product_id && liveProducts ? liveProducts.has(item.product_id) : null);
    // D: «In onda adesso» per le storie che i clienti vedono, le altre spente.
    const onAirD = (item: StoryWithProduct): OnAir => {
        if (onAirOf(item).state !== "on") return OFF_AIR;
        const seat = item.activity_id && activities.length > 1 ? activities.find(a => a.id === item.activity_id)?.name : undefined;
        // copia v70: una storia di tutte le sedi lo dice («· tutte le sedi»)
        return { state: "now", when: null, where: seat ?? (!item.activity_id && activities.length > 1 ? "tutte le sedi" : null) };
    };
    const matchesD = (item: StoryWithProduct, which: StoryFilterD) =>
        which === "on" ? onAirD(item).state !== "off" : which === "off" ? onAirD(item).state === "off" : matchesFilter(item, which);
    const filterOptionsD = (
        [
            { value: "all", label: "Tutte" },
            { value: "on", label: "In onda" },
            { value: "off", label: "Bozze e ferme" }
        ] as const
    ).map(option => ({ ...option, count: stories.filter(item => matchesD(item, option.value)).length }));
    const visibleD = stories.filter(
        item => matchesD(item, filterD) && (!normalizedQuery || `${item.title} ${item.eyebrow ?? ""}`.toLowerCase().includes(normalizedQuery))
    );
    const cardsD = sortVetrina(
        visibleD.map(item => ({ ...item, name: item.title })),
        sort,
        onAirD
    );
    const leadD = storieLead(
        stories.filter(item => onAirD(item).state !== "off").length,
        stories.filter(item => item.status !== "published").length,
        stories.filter(item => item.status === "published" && onAirD(item).state === "off").length
    );
    const clearD = () => {
        setFilterD("all");
        setSearchQuery("");
    };
    const unseenProduct = stories.some(item => item.product_id !== null && liveProducts !== null && onAirOf(item).state === "unseen");

    const rowActionsOf = (item: StoryWithProduct) => (
        <TableRowActions
            ariaLabel={`Azioni storia ${item.title}`}
            actions={[
                rowAction.edit(() => navigate(storyUrl(item)), { readOnly: !canWrite }),
                rowAction.remove(
                    () => {
                        if (ensureActive()) setDeleteTarget(item);
                    },
                    { hidden: !canWrite }
                )
            ]}
        />
    );

    const columns: ColumnDefinition<StoryWithProduct>[] = [
        ...(canReorder
            ? [
                  {
                      id: "drag",
                      header: "",
                      width: "40px",
                      align: "center" as const,
                      cell: (_value: unknown, row: StoryWithProduct, _rowIndex: number, dragHandleProps?: unknown) => (
                          <DataTableDragHandle
                              aria-label={`Riordina ${row.title}`}
                              {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                          />
                      )
                  }
              ]
            : []),
        {
            id: "title",
            header: "Storia",
            width: "1fr",
            cell: (_value, item) => (
                <div className={styles.titleCell}>
                    {item.eyebrow && (
                        <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                            {item.eyebrow}
                        </Text>
                    )}
                    <Text variant="body-sm" weight={600}>
                        {item.title}
                    </Text>
                    {isPhone && aboutCell(item)}
                </div>
            )
        },
        {
            id: "about",
            header: "Di cosa parla",
            width: "0.8fr",
            hideOnPhone: true,
            cell: (_value, item) => aboutCell(item)
        },
        {
            id: "status",
            header: "Stato",
            width: "200px",
            align: "right",
            cell: (_value, item) => {
                const onAir = onAirOf(item);
                return (
                    <div className={styles.statusCell}>
                        <StatusBadge variant={onAir.tone} label={onAir.label} />
                        {onAir.why && !isPhone && (
                            <Text variant="caption" colorVariant="muted">
                                {onAir.why}
                            </Text>
                        )}
                    </div>
                );
            }
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_value, item) => rowActionsOf(item)
        }
    ];

    const renderList = () => {
        if (loadError) {
            return (
                <EmptyState
                    icon={<ScrollText />}
                    title="Non è stato possibile caricare le storie"
                    description="Controlla la connessione e riprova."
                    action={
                        <Button variant="secondary" onClick={() => loadData()}>
                            Riprova
                        </Button>
                    }
                />
            );
        }
        if (!loading && stories.length === 0) {
            return (
                <EmptyState
                    icon={<ScrollText />}
                    title="Non hai ancora creato storie"
                    description="Le storie compaiono nella sezione approfondimenti del tuo catalogo pubblico."
                    action={
                        canWrite ? (
                            <Button variant="primary" onClick={handleCreate} disabled={!canEdit}>
                                Crea la prima storia
                            </Button>
                        ) : undefined
                    }
                />
            );
        }
        if (LOOK_D && !loading && visibleD.length === 0) return <VetrinaNone onClear={clearD} />;
        // D: le card con occhiello e titolo sulla tinta (al telefono sempre Fogli).
        if (LOOK_D && (viewD === "fogli" || isPhone)) {
            return (
                <div className={vs.grid}>
                    <ul className={vs.cards} aria-label="Storie">
                        {cardsD.map(item => (
                            <li key={item.id}>
                                <VetrinaCard
                                    family="story"
                                    to={storyUrl(item)}
                                    preview={<TilePreview kind={item.eyebrow} title={item.title} />}
                                    name={item.title}
                                    nameInPreview
                                    label={item.title}
                                    meta={item.product_id ? `Prodotto collegato: ${storyAbout(item, activities).label}` : storyAbout(item, activities).label}
                                    onAir={onAirD(item)}
                                    onMetti={
                                        canWrite && canEdit && item.status !== "published"
                                            ? () => navigate(`/business/${tenantId}/crea/storia/${item.id}?da=storie&metti=1`)
                                            : undefined
                                    }
                                    actions={rowActionsOf(item)}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            );
        }
        const rows = LOOK_D ? visibleD : visibleStories;
        return (
            <>
                {!loading && !LOOK_D && (
                    <ChipGroupSingle<StoryFilter>
                        ariaLabel="Filtra le storie"
                        layout="auto"
                        shape="pill"
                        options={filterOptions}
                        value={filter}
                        onChange={setFilter}
                    />
                )}
                {canReorder && stories.length > 1 && (
                    <Text variant="caption" colorVariant="muted">
                        Trascina per cambiare l'ordine: è quello in cui i clienti le trovano.
                    </Text>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={rows.map(story => story.id)} strategy={verticalListSortingStrategy}>
                        <DataTable<StoryWithProduct>
                            data={rows}
                            columns={columns}
                            isLoading={loading}
                            isFiltered={isFiltered}
                            onClearFilters={() => {
                                setFilter("all");
                                clearD();
                            }}
                            ariaLabel="Storie"
                            onRowClick={item => navigate(storyUrl(item))}
                            rowWrapper={(row, rowData) => (
                                <SortableDataTableRow key={rowData.id} id={rowData.id} draggingOpacity={0.55}>
                                    {row}
                                </SortableDataTableRow>
                            )}
                        />
                    </SortableContext>
                </DndContext>
                {unseenProduct && (
                    <Text variant="caption" colorVariant="muted">
                        «{STORY_UNSEEN_LABEL}»: il prodotto oggi non è in nessun menù in onda.
                    </Text>
                )}
            </>
        );
    };

    if (permissions != null && !canRead) {
        return <PageGate readPermission="stories.read">{() => null}</PageGate>;
    }

    return (
        <PageGate readPermission="stories.read">
            {() => (
                <>
                    <div className={LOOK_D ? `${styles.wrapper} ${vs.page}` : styles.wrapper}>
                        {LOOK_D && stories.length > 0 && (
                            <VetrinaHead<StoryFilterD>
                                family="story"
                                lead={leadD}
                                filter={filterD}
                                onFilter={setFilterD}
                                filterOptions={filterOptionsD}
                                filterAll="all"
                                sort={sort}
                                onSort={setSort}
                                query={searchQuery}
                                onQuery={setSearchQuery}
                                placeholder="Cerca storie"
                                view={{ value: viewD, onChange: setViewD }}
                                crea={<VetrinaCrea da="storie" disabled={!canEdit} />}
                                compact={compact}
                                setTop={setTop}
                            />
                        )}
                        <StoryBrandCard
                            saved={brand.saved}
                            loadError={brand.loadError}
                            onRetry={brand.reload}
                            onEdit={canWrite ? handleEditBrand : undefined}
                        />
                        {renderList()}
                    </div>

                    <StoryBrandDrawer open={isBrandOpen} onClose={() => setIsBrandOpen(false)} brand={brand} />

                    <StoryDeleteDialog
                        open={Boolean(deleteTarget) && Boolean(tenantId)}
                        onClose={() => setDeleteTarget(null)}
                        storyData={deleteTarget}
                        onSuccess={() => {
                            setDeleteTarget(null);
                            loadData();
                        }}
                    />
                </>
            )}
        </PageGate>
    );
}
