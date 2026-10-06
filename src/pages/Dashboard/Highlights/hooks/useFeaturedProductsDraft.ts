import type { MediaFraming } from "@/services/supabase/featuredContents";
import { useCallback, useEffect, useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import {
    listFeaturedContentProducts,
    syncFeaturedContentProducts,
    updateFeaturedContentProductNote,
    updateFeaturedContentProductsSortOrder,
    type FeaturedContentProductRow,
    type FeaturedPickerProduct
} from "@/services/supabase/featuredContents";
import { formatPrice } from "@/utils/formatCurrency";

/** Una riga della bozza: collegata (`id`) o da collegare al Salva (`id` null). */
export type FeaturedProductDraftRow = {
    /** Chiave stabile per React e dnd-kit: l'id se c'è, se no il prodotto. */
    key: string;
    id: string | null;
    productId: string;
    name: string;
    priceLabel: string | null;
    note: string;
    /** Miniatura (EV7); null per i prodotti appena aggiunti dal picker. */
    imageUrl: string | null;
    imageFraming: MediaFraming | null;
};

type PriceSource = Pick<FeaturedPickerProduct, "base_price" | "option_groups">;

/** «€ 7,90», «da € 3,20» per chi ha formati, null senza prezzo. */
export function priceLabelOf(product: PriceSource | null): string | null {
    if (!product) return null;
    if (product.base_price != null) return formatPrice(product.base_price);
    const primary = (product.option_groups ?? []).find(g => g.group_kind === "PRIMARY_PRICE");
    const prices = (primary?.values ?? []).map(v => v.absolute_price).filter((p): p is number => p != null);
    return prices.length > 0 ? `da ${formatPrice(Math.min(...prices))}` : null;
}

function fromSaved(row: FeaturedContentProductRow): FeaturedProductDraftRow {
    return {
        key: row.id,
        id: row.id,
        productId: row.product_id,
        name: row.products?.name ?? "Prodotto non trovato",
        priceLabel: priceLabelOf(row.products),
        note: row.note ?? "",
        imageUrl: row.products?.image_url ?? null,
        imageFraming: row.products?.image_framing ?? null
    };
}

const normalizeNote = (note: string): string | null => (note.trim() === "" ? null : note);

/**
 * I prodotti di un contenuto in evidenza nella bozza della pagina (§50.11/2,
 * come Menù §49.1/2): nota, ordine, togliere e aggiungere esistenti si
 * scrivono solo al Salva della pagina. Il salvataggio non è transazionale
 * (collega/scollega, poi ordine, poi note), come i singoli servizi di prima.
 */
export function useFeaturedProductsDraft(featuredId: string | undefined, tenantId: string | null, enabled: boolean) {
    const [saved, setSaved] = useState<FeaturedContentProductRow[] | null>(null);
    const [rows, setRows] = useState<FeaturedProductDraftRow[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        if (!featuredId || !tenantId) return;
        try {
            setLoadError(false);
            const data = await listFeaturedContentProducts(featuredId, tenantId);
            setSaved(data);
            setRows(data.map(fromSaved));
        } catch (err) {
            console.error("Caricamento prodotti del contenuto:", err);
            setLoadError(true);
        }
    }, [featuredId, tenantId]);

    useEffect(() => {
        if (enabled && saved === null) void load();
    }, [enabled, saved, load]);

    const savedByKey = useMemo(() => new Map((saved ?? []).map(row => [row.id, row])), [saved]);

    const dirtyNoteKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const row of rows) {
            const before = row.id ? savedByKey.get(row.id)?.note ?? null : null;
            if (normalizeNote(row.note) !== before) keys.add(row.key);
        }
        return keys;
    }, [rows, savedByKey]);

    const isDirty = useMemo(() => {
        if (!saved) return false;
        if (rows.length !== saved.length) return true;
        if (rows.some((row, index) => row.id !== saved[index]?.id)) return true;
        return dirtyNoteKeys.size > 0;
    }, [rows, saved, dirtyNoteKeys]);

    const move = useCallback((fromKey: string, toKey: string) => {
        setRows(prev => {
            const from = prev.findIndex(r => r.key === fromKey);
            const to = prev.findIndex(r => r.key === toKey);
            return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
        });
    }, []);

    const setNote = useCallback((key: string, note: string) => {
        setRows(prev => prev.map(row => (row.key === key ? { ...row, note } : row)));
    }, []);

    const remove = useCallback((key: string) => {
        setRows(prev => prev.filter(row => row.key !== key));
    }, []);

    /**
     * La selezione del picker (come prima: togliere la spunta scollega). Le
     * righe che restano tengono ordine e nota; le nuove vanno in fondo.
     */
    const applySelection = useCallback((productIds: string[], catalog: FeaturedPickerProduct[]) => {
        const wanted = new Set(productIds);
        const byId = new Map(catalog.map(p => [p.id, p]));
        setRows(prev => {
            const kept = prev.filter(row => wanted.has(row.productId));
            const present = new Set(kept.map(row => row.productId));
            const added = productIds
                .filter(id => !present.has(id))
                .map(id => {
                    const product = byId.get(id) ?? null;
                    return {
                        key: `new:${id}`,
                        id: null,
                        productId: id,
                        name: product?.name ?? "Prodotto",
                        priceLabel: priceLabelOf(product),
                        note: "",
                        imageUrl: null,
                        imageFraming: null
                    };
                });
            return [...kept, ...added];
        });
    }, []);

    const save = useCallback(async (): Promise<void> => {
        if (!featuredId || !tenantId || !saved) return;
        setIsSaving(true);
        try {
            const keptIds = new Set(rows.filter(r => r.id).map(r => r.id as string));
            const toRemove = saved.filter(row => !keptIds.has(row.id)).map(row => row.id);
            const toAdd = rows
                .map((row, index) => ({ row, sortOrder: index + 1 }))
                .filter(({ row }) => row.id === null)
                .map(({ row, sortOrder }) => ({ productId: row.productId, sortOrder }));
            if (toRemove.length > 0 || toAdd.length > 0) {
                await syncFeaturedContentProducts(featuredId, tenantId, toRemove, toAdd);
            }

            // Le righe nuove hanno un id solo adesso: si rilegge, poi ordine e note.
            const current = toAdd.length > 0 ? await listFeaturedContentProducts(featuredId, tenantId) : saved;
            const idOfProduct = new Map(current.map(row => [row.product_id, row]));
            const sortUpdates: { id: string; sort_order: number }[] = [];
            const noteUpdates: { id: string; note: string | null }[] = [];
            rows.forEach((row, index) => {
                const live = row.id ? current.find(r => r.id === row.id) : idOfProduct.get(row.productId);
                if (!live) return;
                if (live.sort_order !== index + 1) sortUpdates.push({ id: live.id, sort_order: index + 1 });
                const note = normalizeNote(row.note);
                if (note !== (live.note ?? null)) noteUpdates.push({ id: live.id, note });
            });
            if (sortUpdates.length > 0) await updateFeaturedContentProductsSortOrder(sortUpdates, tenantId);
            for (const update of noteUpdates) {
                await updateFeaturedContentProductNote(update.id, tenantId, update.note);
            }
            await load();
        } finally {
            setIsSaving(false);
        }
    }, [featuredId, tenantId, saved, rows, load]);

    const discard = useCallback(() => {
        if (saved) setRows(saved.map(fromSaved));
    }, [saved]);

    return {
        loaded: saved !== null,
        loadError,
        reload: load,
        rows,
        linkedProductIds: rows.map(row => row.productId),
        dirtyNoteKeys,
        isDirty,
        isSaving,
        move,
        setNote,
        remove,
        applySelection,
        save,
        discard
    };
}
