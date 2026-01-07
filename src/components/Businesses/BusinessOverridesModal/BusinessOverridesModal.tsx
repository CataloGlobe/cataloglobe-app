import { useCallback, useEffect, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";

import { getCollectionItemsWithData } from "@/services/supabase/collections";
import {
    getBusinessOverridesForItems,
    upsertBusinessItemOverride
} from "@/services/supabase/overrides";

import type { CollectionItemWithItem, OverrideRowForUI } from "@/types/database";
import { listBusinessSchedules } from "@/services/supabase/schedules";
import { Eye, EyeOff, X } from "lucide-react";
import styles from "./BusinessOverridesModal.module.scss";
import Skeleton from "@/components/ui/Skeleton/Skeleton";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    businessId: string;
    initialCollectionId?: string | null;
    title?: string;
};

type DraftRow = {
    visible: boolean;
    price: string;
    hasPriceOverride: boolean;
    hasVisibleOverride: boolean;
};

type AvailableCollection = {
    id: string;
    name: string;
    slot: "primary" | "overlay";
};

export default function BusinessOverridesModal({
    isOpen,
    onClose,
    businessId,
    initialCollectionId = null,
    title
}: Props) {
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

    const hasSchedulableCollections = availableCollections.length > 0;

    const buildDrafts = useCallback(
        (rows: CollectionItemWithItem[], ov: Record<string, OverrideRowForUI>) => {
            const next: Record<string, DraftRow> = {};

            for (const row of rows) {
                const it = row.item;
                const o = ov[it.id];

                const visibleBase = true;
                const priceBase = it.base_price;

                const visible = o?.visible_override ?? visibleBase;

                const priceToShow = o?.price_override ?? priceBase;

                next[it.id] = {
                    visible,
                    price: priceToShow != null ? String(priceToShow) : "",
                    hasPriceOverride: o?.price_override != null,
                    hasVisibleOverride: o?.visible_override != null
                };
            }

            return next;
        },
        []
    );

    const load = useCallback(async () => {
        if (!selectedCollectionId) {
            setLoadingItems(false);
            setItems([]);
            setDrafts({});
            return;
        }

        setLoadingItems(true);
        setError(null);

        try {
            const rows = await getCollectionItemsWithData(selectedCollectionId);
            setItems(rows);

            const ids = rows.map(r => r.item.id);
            const ov = await getBusinessOverridesForItems(businessId, ids);

            setDrafts(buildDrafts(rows, ov));
        } catch {
            setError("Errore nel caricamento dei contenuti.");
        } finally {
            setLoadingItems(false);
        }
    }, [businessId, selectedCollectionId, buildDrafts]);

    const loadCollectionsInUse = useCallback(async () => {
        setLoadingCollections(true);

        try {
            const rules = await listBusinessSchedules(businessId);

            const map = new Map<string, AvailableCollection>();

            for (const r of rules) {
                const id = r.collection.id;
                if (!map.has(id)) {
                    map.set(id, {
                        id,
                        name: r.collection.name,
                        slot: r.slot
                    });
                }
            }

            const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
            setAvailableCollections(list);

            setSelectedCollectionId(prev => prev ?? list[0]?.id ?? null);
        } finally {
            setLoadingCollections(false);
        }
    }, [businessId]);

    useEffect(() => {
        if (!isOpen) return;
        if (!selectedCollectionId) return;
        void load();
    }, [isOpen, selectedCollectionId, load]);

    useEffect(() => {
        if (!isOpen) return;
        void loadCollectionsInUse();
    }, [isOpen, loadCollectionsInUse]);

    const toggleVisible = useCallback((itemId: string) => {
        setDrafts(prev => {
            const cur = prev[itemId];
            if (!cur) return prev;
            return {
                ...prev,
                [itemId]: {
                    ...cur,
                    visible: !cur.visible,
                    // vuol dire: sto impostando un override esplicito
                    hasVisibleOverride: true
                }
            };
        });
    }, []);

    const changePrice = useCallback((itemId: string, value: string) => {
        setDrafts(prev => {
            const cur = prev[itemId];
            if (!cur) return prev;
            return {
                ...prev,
                [itemId]: {
                    ...cur,
                    price: value,
                    hasPriceOverride: true
                }
            };
        });
    }, []);

    const saveAll = useCallback(async () => {
        setSaving(true);
        setError(null);

        try {
            // Salviamo solo quelli che hanno override “toccati”
            const promises: Promise<void>[] = [];

            for (const row of items) {
                const id = row.item.id;
                const d = drafts[id];
                if (!d) continue;

                // price override
                let priceOverride: number | null = null;
                if (d.hasPriceOverride) {
                    const normalized = d.price.trim();
                    priceOverride = normalized === "" ? null : Number(normalized);
                    if (normalized !== "" && Number.isNaN(priceOverride)) {
                        throw new Error("Prezzo non valido.");
                    }
                }

                // visible override
                let visibleOverride: boolean | null = null;
                if (d.hasVisibleOverride) {
                    visibleOverride = d.visible;
                }

                // Se non ho override su nulla, skip
                if (!d.hasPriceOverride && !d.hasVisibleOverride) continue;

                promises.push(
                    upsertBusinessItemOverride({
                        businessId,
                        itemId: id,
                        priceOverride,
                        visibleOverride
                    })
                );
            }

            await Promise.all(promises);
            onClose();
        } catch (e: unknown) {
            console.log(e);
            setError("Errore nel salvataggio. Controlla i prezzi inseriti.");
        } finally {
            setSaving(false);
        }
    }, [items, drafts, businessId, onClose]);

    const renderSkeletonRows = (count = 7) => (
        <div className={styles.list}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={styles.row}>
                    <Skeleton width={38} height={38} radius="12px" />
                    <div className={styles.info}>
                        <Skeleton height={14} width="70%" radius="10px" />
                        <div style={{ height: 6 }} />
                        <Skeleton height={12} width="40%" radius="10px" />
                    </div>
                    <div className={styles.price}>
                        <Skeleton height={14} width={16} radius="8px" />
                        <Skeleton height={38} width="100%" radius="12px" />
                    </div>
                </div>
            ))}
        </div>
    );

    if (!isOpen) return null;

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-label="Override contenuti"
        >
            <div className={styles.modal}>
                <div className={styles.header}>
                    <Text as="h2" variant="title-md">
                        {title ?? "Gestisci disponibilità e prezzi"}
                    </Text>

                    <button className={styles.close} onClick={onClose} aria-label="Chiudi">
                        <X />
                    </button>
                </div>

                <div className={styles.body}>
                    {error ? (
                        <Text variant="body" colorVariant="warning">
                            {error}
                        </Text>
                    ) : availableCollections.length === 0 ? (
                        <Text variant="body" colorVariant="muted">
                            Nessun contenuto schedulato. Configura prima “Contenuti & Orari”.
                        </Text>
                    ) : (
                        <>
                            {/* SELECT */}
                            <div className={styles.selectorRow}>
                                <Text variant="caption" colorVariant="muted">
                                    Contenuto da configurare
                                </Text>

                                <select
                                    className={styles.select}
                                    value={selectedCollectionId ?? ""}
                                    onChange={e => setSelectedCollectionId(e.target.value || null)}
                                    aria-label="Seleziona contenuto"
                                >
                                    {availableCollections.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} {c.slot === "overlay" ? " (In evidenza)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* LIST / SKELETON */}
                            {loadingCollections || loadingItems ? (
                                renderSkeletonRows()
                            ) : (
                                <div className={styles.list}>
                                    {items.map(row => {
                                        const it = row.item;
                                        const d = drafts[it.id];

                                        if (!d) return null;

                                        return (
                                            <div key={it.id} className={styles.row}>
                                                <button
                                                    type="button"
                                                    className={styles.eye}
                                                    onClick={() => toggleVisible(it.id)}
                                                    aria-label={
                                                        d.visible
                                                            ? "Nascondi contenuto"
                                                            : "Mostra contenuto"
                                                    }
                                                >
                                                    {d.visible ? (
                                                        <Eye size={15} />
                                                    ) : (
                                                        <EyeOff size={15} />
                                                    )}
                                                </button>

                                                <div className={styles.info}>
                                                    <Text variant="body" className={styles.name}>
                                                        {it.name}
                                                    </Text>
                                                </div>

                                                <div className={styles.price}>
                                                    <Text variant="body" className={styles.euro}>
                                                        €
                                                    </Text>
                                                    <Input
                                                        value={d.price}
                                                        onChange={e =>
                                                            changePrice(it.id, e.target.value)
                                                        }
                                                        inputMode="decimal"
                                                        aria-label={`Prezzo per ${it.name}`}
                                                        label="Prezzo"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

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
                                disabled={saving || loadingItems}
                                label={saving ? "Salvataggio..." : "Salva e aggiorna"}
                            />
                        </>
                    ) : (
                        <>
                            <Button
                                variant="secondary"
                                onClick={onClose}
                                disabled={saving}
                                label="Annulla"
                            />
                            <Button variant="primary" onClick={onClose} label="Chiudi" />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
