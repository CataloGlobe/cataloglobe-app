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
import { Eye, EyeOff, X } from "lucide-react";
import styles from "./BusinessOverridesModal.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    businessId: string;
    /** la collezione da cui leggere gli item (es: active_collection_id) */
    collectionId: string;
    title?: string;
};

type DraftRow = {
    visible: boolean;
    price: string; // string per input controllato
    hasPriceOverride: boolean;
    hasVisibleOverride: boolean;
};

export default function BusinessOverridesModal({
    isOpen,
    onClose,
    businessId,
    collectionId,
    title
}: Props) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<CollectionItemWithItem[]>([]);
    const [overridesMap, setOverridesMap] = useState<Record<string, OverrideRowForUI>>({});
    const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

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
        setLoading(true);
        setError(null);

        try {
            const rows = await getCollectionItemsWithData(collectionId);
            setItems(rows);

            const ids = rows.map(r => r.item.id);
            const ov = await getBusinessOverridesForItems(businessId, ids);
            setOverridesMap(ov);

            setDrafts(buildDrafts(rows, ov));
        } catch (e: unknown) {
            setError("Errore nel caricamento dei contenuti.");
        } finally {
            setLoading(false);
        }
    }, [businessId, collectionId, buildDrafts]);

    useEffect(() => {
        if (!isOpen) return;
        void load();
    }, [isOpen, load]);

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
            setError("Errore nel salvataggio. Controlla i prezzi inseriti.");
        } finally {
            setSaving(false);
        }
    }, [items, drafts, businessId, onClose]);

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
                    {loading ? (
                        <Text variant="body" colorVariant="muted">
                            Caricamento...
                        </Text>
                    ) : error ? (
                        <Text variant="body" colorVariant="warning">
                            {error}
                        </Text>
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
                                            {d.visible ? <Eye size={15} /> : <EyeOff size={15} />}
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
                                                onChange={e => changePrice(it.id, e.target.value)}
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
                </div>

                <div className={styles.footer}>
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={saving}
                        label="Annulla"
                    />
                    <Button
                        onClick={saveAll}
                        disabled={saving || loading}
                        label={saving ? "Salvataggio..." : "Salva e aggiorna"}
                    />
                </div>
            </div>
        </div>
    );
}
