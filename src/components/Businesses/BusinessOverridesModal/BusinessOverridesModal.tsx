import { useCallback, useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import Skeleton from "@/components/ui/Skeleton/Skeleton";

import { Eye, EyeOff, AlertTriangle, History } from "lucide-react";

import { getCollectionItemsWithData } from "@/services/supabase/collections";
import {
    getBusinessOverridesForItems,
    upsertBusinessItemOverride
} from "@/services/supabase/overrides";
import { listBusinessSchedules } from "@/services/supabase/schedules";

import type { CollectionItemWithItem, OverrideRowForUI } from "@/types/database";
import styles from "./BusinessOverridesModal.module.scss";
import { isNowActive } from "@/domain/schedules/scheduleUtils";
import { resolveBusinessCollections } from "@/services/supabase/resolveBusinessCollections";
import { TextInput } from "@/components/ui/Input/TextInput";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type Props = {
    isOpen: boolean;
    onClose: () => void;
    businessId: string;
    initialCollectionId?: string | null;
    title?: string;
};

type DraftRow = {
    // valori mostrati in UI
    visible: boolean;
    price: string;

    // base (senza override)
    baseVisible: boolean;
    basePrice: number | null;

    // override attualmente presenti nel DB (prima delle modifiche)
    originalVisibleOverride: boolean | null;
    originalPriceOverride: number | null;

    // stato "intenzionale" corrente
    hasPriceOverride: boolean;
    hasVisibleOverride: boolean;

    // azione esplicita
    removePriceOverride?: boolean;

    initialVisible: boolean;
};

type AvailableCollection = {
    id: string;
    name: string;
    slot: "primary" | "overlay" | "mixed";
    isActiveNow: boolean;
};

/* -------------------------------------------------------------------------- */
/*                                 COMPONENT                                  */
/* -------------------------------------------------------------------------- */

export default function BusinessOverridesModal({
    isOpen,
    onClose,
    businessId,
    initialCollectionId = null,
    title
}: Props) {
    /* ---------------------------------- STATE --------------------------------- */

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<CollectionItemWithItem[]>([]);
    const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

    const [availableCollections, setAvailableCollections] = useState<AvailableCollection[]>([]);
    const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(
        initialCollectionId
    );

    const [loadingCollections, setLoadingCollections] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);

    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");

    const [activeNow, setActiveNow] = useState<{
        primaryId: string | null;
        overlayId: string | null;
        isFallback: boolean;
    } | null>(null);

    const hasSchedulableCollections = availableCollections.length > 0;
    const hasChanges = Object.values(drafts).some(d => {
        const currentPriceOverride = d.removePriceOverride
            ? null
            : d.hasPriceOverride
            ? d.price.trim() === ""
                ? null
                : Number(d.price)
            : d.originalPriceOverride;

        const currentVisibleOverride = d.hasVisibleOverride ? d.visible : d.originalVisibleOverride;

        const priceChanged = currentPriceOverride !== d.originalPriceOverride;
        const visibleChanged = currentVisibleOverride !== d.originalVisibleOverride;

        return priceChanged || visibleChanged;
    });

    /* ------------------------------- BUILD DRAFTS ------------------------------ */

    const buildDrafts = useCallback(
        (rows: CollectionItemWithItem[], overrides: Record<string, OverrideRowForUI>) => {
            const next: Record<string, DraftRow> = {};

            for (const row of rows) {
                const item = row.item;
                const override = overrides[item.id];

                const baseVisible = row.visible;
                const basePrice = item.base_price ?? null;

                const originalVisibleOverride =
                    override?.visible_override != null ? override.visible_override : null;

                const originalPriceOverride =
                    override?.price_override != null ? override.price_override : null;

                const visibleShown = originalVisibleOverride ?? baseVisible;

                const priceShown =
                    originalPriceOverride != null
                        ? String(originalPriceOverride)
                        : basePrice != null
                        ? String(basePrice)
                        : "";

                next[item.id] = {
                    visible: visibleShown,
                    price: priceShown,

                    baseVisible,
                    basePrice,
                    initialVisible: visibleShown,

                    originalVisibleOverride,
                    originalPriceOverride,

                    hasPriceOverride: originalPriceOverride != null,
                    hasVisibleOverride: originalVisibleOverride != null,

                    removePriceOverride: false
                };
            }

            return next;
        },
        []
    );

    /* ------------------------------- LOAD ITEMS -------------------------------- */

    const loadItems = useCallback(async () => {
        if (!selectedCollectionId) return;

        setLoadingItems(true);
        setError(null);

        try {
            const rows = await getCollectionItemsWithData(selectedCollectionId);
            const itemIds = rows.map(r => r.item.id);
            const overrides = await getBusinessOverridesForItems(businessId, itemIds);

            setItems(rows);
            setDrafts(buildDrafts(rows, overrides));
        } catch {
            setError("Errore nel caricamento dei contenuti.");
        } finally {
            setLoadingItems(false);
        }
    }, [businessId, selectedCollectionId, buildDrafts]);

    /* ---------------------------- LOAD COLLECTIONS ----------------------------- */

    const loadCollectionsInUse = useCallback(async () => {
        setLoadingCollections(true);

        try {
            const schedules = await listBusinessSchedules(businessId);

            const resolved = await resolveBusinessCollections(businessId, new Date());

            const hasActivePrimaryRule = schedules.some(
                s => s.slot === "primary" && isNowActive(s)
            );

            setActiveNow({
                primaryId: resolved.primary,
                overlayId: resolved.overlay,
                isFallback: !!resolved.primary && !hasActivePrimaryRule
            });

            const map = new Map<string, AvailableCollection>();

            for (const s of schedules) {
                if (!s.collection) continue;

                const isActiveNow =
                    (s.slot === "primary" && resolved.primary === s.collection.id) ||
                    (s.slot === "overlay" && resolved.overlay === s.collection.id);

                if (!map.has(s.collection.id)) {
                    map.set(s.collection.id, {
                        id: s.collection.id,
                        name: s.collection.name,
                        slot: s.slot,
                        isActiveNow
                    });
                } else if (isActiveNow) {
                    // se la stessa collection compare più volte, basta che una sia vincente
                    map.get(s.collection.id)!.isActiveNow = true;
                } else {
                    const entry = map.get(s.collection.id)!;
                    if (entry.slot !== s.slot) {
                        entry.slot = "mixed";
                    }
                }
            }

            const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

            setAvailableCollections(list);

            setSelectedCollectionId(prev => {
                if (prev) return prev;

                const active = list.find(c => c.isActiveNow);
                if (active) return active.id;

                const primary = list.find(c => c.slot === "primary");
                return primary?.id ?? list[0]?.id ?? null;
            });
        } finally {
            setLoadingCollections(false);
        }
    }, [businessId]);

    /* --------------------------------- EFFECTS --------------------------------- */

    useEffect(() => {
        if (!isOpen) return;
        void loadCollectionsInUse();
    }, [isOpen, loadCollectionsInUse]);

    useEffect(() => {
        if (!isOpen || !selectedCollectionId) return;
        void loadItems();
    }, [isOpen, selectedCollectionId, loadItems]);

    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    /* ------------------------------- USER ACTIONS ------------------------------- */

    const toggleVisible = useCallback((itemId: string) => {
        setDrafts(prev => {
            const cur = prev[itemId];
            if (!cur) return prev;

            const nextVisible = !cur.visible;
            const hasVisibleOverride = nextVisible !== cur.initialVisible;

            return {
                ...prev,
                [itemId]: {
                    ...cur,
                    visible: nextVisible,
                    hasVisibleOverride
                }
            };
        });
    }, []);

    const changePrice = useCallback((itemId: string, value: string) => {
        setDrafts(prev => {
            const cur = prev[itemId];
            if (!cur) return prev;

            const trimmed = value.trim();
            const baseStr = cur.basePrice != null ? String(cur.basePrice) : "";

            const isSameAsBase = trimmed === baseStr;

            return {
                ...prev,
                [itemId]: {
                    ...cur,
                    price: value,
                    hasPriceOverride: !isSameAsBase,
                    // se avevi un override DB e torni uguale al base, al salvataggio va rimosso
                    removePriceOverride: isSameAsBase && cur.originalPriceOverride != null
                }
            };
        });
    }, []);

    const resetPrice = useCallback((itemId: string) => {
        setDrafts(prev => {
            const cur = prev[itemId];
            if (!cur) return prev;

            const baseStr = cur.basePrice != null ? String(cur.basePrice) : "";

            return {
                ...prev,
                [itemId]: {
                    ...cur,
                    price: baseStr, // ✅ mostra subito il prezzo originale
                    hasPriceOverride: false,
                    removePriceOverride: cur.originalPriceOverride != null // ✅ rimuovi override solo se c’era
                }
            };
        });
    }, []);

    /* -------------------------------- SAVE ALL --------------------------------- */

    const saveAll = useCallback(async () => {
        setSaving(true);
        setError(null);

        try {
            const ops: Promise<void>[] = [];

            for (const row of items) {
                const d = drafts[row.item.id];
                if (!d) continue;

                // --- calcola prezzo da inviare ---
                let priceOverrideToSend: number | null = d.originalPriceOverride;

                if (d.removePriceOverride) {
                    priceOverrideToSend = null;
                } else if (d.hasPriceOverride) {
                    const trimmed = d.price.trim();
                    const parsed = trimmed !== "" ? Number(trimmed) : null;

                    if (parsed !== null && Number.isNaN(parsed)) {
                        throw new Error("Prezzo non valido");
                    }

                    priceOverrideToSend = parsed;
                }

                // --- calcola visibilità da inviare ---
                let visibleOverrideToSend: boolean | null = d.originalVisibleOverride;

                if (d.hasVisibleOverride) {
                    visibleOverrideToSend = d.visible;
                }

                // --- capire se serve davvero salvare ---
                const priceChanged = priceOverrideToSend !== d.originalPriceOverride;
                const visibleChanged = visibleOverrideToSend !== d.originalVisibleOverride;

                if (!priceChanged && !visibleChanged) continue;

                ops.push(
                    upsertBusinessItemOverride({
                        businessId,
                        itemId: row.item.id,
                        priceOverride: priceOverrideToSend,
                        visibleOverride: visibleOverrideToSend
                    })
                );
            }

            await Promise.all(ops);

            await loadItems();

            onClose();
        } catch {
            setError("Errore nel salvataggio. Controlla i prezzi inseriti.");
        } finally {
            setSaving(false);
        }
    }, [items, drafts, businessId, onClose, loadItems]);

    /* ------------------------------- RENDER HELPERS ----------------------------- */

    const renderSkeletonRows = (count = 7) => (
        <div className={styles.list}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={styles.row}>
                    <Skeleton width={36} height={36} radius="12px" />
                    <Skeleton height={14} width="60%" radius="8px" />
                    <Skeleton height={36} width="100%" radius="12px" />
                </div>
            ))}
        </div>
    );

    const categories = useMemo(() => {
        const set = new Set<string>();

        for (const row of items) {
            set.add(row.item.category?.name ?? "Senza categoria");
        }

        return Array.from(set).sort();
    }, [items]);

    const groupedItems = useMemo(() => {
        const map = new Map<string, typeof items>();
        const q = search.trim().toLowerCase();

        for (const row of items) {
            const categoryName = row.item.category?.name ?? "Senza categoria";

            // filtro categoria
            if (categoryFilter !== "all" && categoryName !== categoryFilter) continue;

            // filtro search
            if (q && !row.item.name.toLowerCase().includes(q)) continue;

            if (!map.has(categoryName)) {
                map.set(categoryName, []);
            }

            map.get(categoryName)!.push(row);
        }

        return Array.from(map.entries()).filter(([, rows]) => rows.length > 0);
    }, [items, search, categoryFilter]);

    if (!isOpen) return null;

    /* ----------------------------------- JSX ----------------------------------- */

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            onMouseDown={e => {
                // click overlay to close (only if clicking the backdrop)
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className={styles.modal}>
                {/* HEADER */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Text variant="title-md">{title}</Text>
                    </div>

                    {availableCollections.length > 0 && (
                        <div className={styles.headerRight}>
                            <select
                                className={styles.collectionSelect}
                                value={selectedCollectionId ?? ""}
                                onChange={e => setSelectedCollectionId(e.target.value)}
                            >
                                {availableCollections.map(c => {
                                    const label =
                                        c.id === activeNow?.primaryId
                                            ? `${c.name} · In uso ora${
                                                  activeNow.isFallback ? " (Fallback)" : ""
                                              }`
                                            : c.name;

                                    return (
                                        <option key={c.id} value={c.id}>
                                            {label}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    )}

                    {activeNow && (
                        <div className={styles.activeNowBanner}>
                            <Text variant="caption" weight={600}>
                                Attivo ora:
                            </Text>

                            {activeNow.primaryId ? (
                                <Text variant="caption">
                                    {availableCollections.find(c => c.id === activeNow.primaryId)
                                        ?.name ?? "Contenuto"}
                                    {activeNow.isFallback && (
                                        <span className={styles.fallbackBadge}>Fallback</span>
                                    )}
                                </Text>
                            ) : (
                                <Text variant="caption" colorVariant="muted">
                                    Nessun contenuto attivo
                                </Text>
                            )}

                            {activeNow?.overlayId && (
                                <div className={styles.activeNowBanner}>
                                    <Text variant="caption" weight={600}>
                                        Contenuto in evidenza:
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        {
                                            availableCollections.find(
                                                c => c.id === activeNow.overlayId
                                            )?.name
                                        }
                                    </Text>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* BODY */}
                <div className={styles.body}>
                    {error ? (
                        <Text variant="body" colorVariant="warning">
                            {error}
                        </Text>
                    ) : !hasSchedulableCollections ? (
                        <Text variant="body" colorVariant="muted">
                            Nessun contenuto schedulato. Configura prima “Contenuti & Orari”.
                        </Text>
                    ) : (
                        <>
                            <div className={styles.filtersBlock}>
                                <TextInput
                                    className={styles.searchInput}
                                    placeholder="Cerca elemento…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />

                                <select
                                    className={styles.select}
                                    value={categoryFilter}
                                    onChange={e => setCategoryFilter(e.target.value)}
                                >
                                    <option value="all">Tutte le categorie</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {hasChanges && (
                                <div className={styles.changesHint}>
                                    <AlertTriangle size={14} />
                                    <Text variant="caption" colorVariant="muted">
                                        Modifiche non ancora salvate
                                    </Text>
                                </div>
                            )}

                            {/* LIST */}
                            {loadingCollections || loadingItems ? (
                                renderSkeletonRows()
                            ) : (
                                <div className={styles.list}>
                                    {groupedItems.map(([category, rows]) => (
                                        <div key={category} className={styles.categoryGroup}>
                                            {categoryFilter === "all" && (
                                                <Text variant="caption">{category}</Text>
                                            )}

                                            {rows.map(row => {
                                                const d = drafts[row.item.id];
                                                if (!d) return null;

                                                return (
                                                    <div
                                                        key={row.item.id}
                                                        className={styles.row}
                                                        data-hidden={!d.visible}
                                                    >
                                                        <button
                                                            type="button"
                                                            className={styles.eye}
                                                            onClick={() =>
                                                                toggleVisible(row.item.id)
                                                            }
                                                        >
                                                            {d.visible ? (
                                                                <Eye size={15} />
                                                            ) : (
                                                                <EyeOff size={15} />
                                                            )}
                                                        </button>

                                                        <Text variant="body">{row.item.name}</Text>

                                                        <div className={styles.price}>
                                                            <span className={styles.euro}>€</span>

                                                            <div className={styles.priceField}>
                                                                <TextInput
                                                                    placeholder="es. 10"
                                                                    value={d.price}
                                                                    onChange={e =>
                                                                        changePrice(
                                                                            row.item.id,
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />

                                                                {d.hasPriceOverride && (
                                                                    <div
                                                                        className={
                                                                            styles.priceActions
                                                                        }
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            className={
                                                                                styles.resetPrice
                                                                            }
                                                                            onClick={() =>
                                                                                resetPrice(
                                                                                    row.item.id
                                                                                )
                                                                            }
                                                                            title="Ripristina prezzo originale"
                                                                        >
                                                                            <History size={16} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* FOOTER */}
                <div className={styles.footer}>
                    {hasSchedulableCollections ? (
                        <>
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                disabled={saving}
                                label="Annulla"
                            />
                            <Button
                                onClick={saveAll}
                                disabled={saving || loadingItems || !hasChanges}
                                label={saving ? "Salvataggio..." : "Salva e aggiorna"}
                            />
                        </>
                    ) : (
                        <Button variant="primary" onClick={onClose} label="Chiudi" />
                    )}
                </div>
            </div>
        </div>
    );
}
