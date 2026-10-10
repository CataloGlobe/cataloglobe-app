import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    createOptionValue,
    createProductOptionGroup,
    deleteOptionValue,
    deleteProductOptionGroup,
    updateOptionValue,
    type GroupWithValues,
    type V2ProductOptionValue
} from "@/services/supabase/productOptions";
import type { PriceMode } from "../priceMode";

const NEW_PREFIX = "nuovo-";

function sameValues(a: V2ProductOptionValue[], b: V2ProductOptionValue[]): boolean {
    return (
        a.length === b.length &&
        a.every((v, i) => v.id === b[i].id && v.name === b[i].name && v.absolute_price === b[i].absolute_price)
    );
}

/**
 * Prezzo per formato nella bozza della pagina (Officina 3, D103 A): il modo
 * e i formati si cambiano nel riquadro e partono col «Salva» in alto. Al
 * salvataggio il gruppo «Formato» (PRIMARY_PRICE) nasce col primo formato e
 * si toglie quando non ne resta nessuno: mai un gruppo vuoto.
 *
 * Una ricarica delle opzioni (una domanda salvata in «Scelte», «Crea una
 * variante») non tocca la bozza: si riparte dal salvato solo se non ci sono
 * modifiche, o subito dopo un Salva. Un Salva interrotto a metà ricarica
 * comunque e tiene nella bozza gli id dei formati già creati, così il Salva
 * dopo non rifà né il gruppo né i formati.
 */
export function useFormatsDraft(
    productId: string,
    tenantId: string,
    group: GroupWithValues | null,
    onRefresh: () => Promise<void>
) {
    const saved = useMemo(() => group?.values ?? [], [group]);
    const savedMode: PriceMode = group !== null ? "formato" : "unico";

    const [mode, setMode] = useState<PriceMode>(savedMode);
    const [rows, setRows] = useState<V2ProductOptionValue[]>(saved);
    const [isSaving, setIsSaving] = useState(false);
    const nextId = useRef(0);
    const savingRef = useRef(false);

    const target = useMemo(() => (mode === "formato" ? rows : []), [mode, rows]);
    const isDirty = !sameValues(target, saved);

    // Si riparte dal salvato quando arriva un salvato nuovo e la bozza era
    // pulita rispetto al salvato di prima, o dopo un Salva riuscito; una
    // modifica a mano spegne il «dopo».
    const targetRef = useRef(target);
    targetRef.current = target;
    const previousSaved = useRef(saved);
    const resyncNext = useRef(false);
    useEffect(() => {
        const wasDirty = !sameValues(targetRef.current, previousSaved.current);
        previousSaved.current = saved;
        if (wasDirty && !resyncNext.current) return;
        resyncNext.current = false;
        setMode(savedMode);
        setRows(saved);
    }, [saved, savedMode]);
    const edited = useCallback(() => {
        resyncNext.current = false;
    }, []);

    const add = useCallback(async (name: string, price: number) => {
        edited();
        nextId.current += 1;
        const id = `${NEW_PREFIX}${nextId.current}`;
        setRows(prev => [
            ...prev,
            {
                id,
                tenant_id: "",
                option_group_id: "",
                name,
                price_modifier: null,
                absolute_price: price,
                created_at: ""
            }
        ]);
    }, [edited]);

    const update = useCallback(
        async (id: string, name: string, price: number) => {
            edited();
            setRows(prev => prev.map(v => (v.id === id ? { ...v, name, absolute_price: price } : v)));
        },
        [edited]
    );

    const remove = useCallback(
        async (id: string) => {
            edited();
            setRows(prev => prev.filter(v => v.id !== id));
        },
        [edited]
    );

    const changeMode = useCallback(
        (next: PriceMode) => {
            edited();
            setMode(next);
        },
        [edited]
    );

    const save = useCallback(async (): Promise<boolean> => {
        if (!isDirty) return true;
        // Un secondo Salva mentre il primo corre non rifà nulla.
        if (savingRef.current) return false;
        savingRef.current = true;
        setIsSaving(true);
        try {
            if (target.length === 0) {
                if (group) await deleteProductOptionGroup(group.id, tenantId);
            } else {
                let groupId = group?.id ?? null;
                if (groupId === null) {
                    const created = await createProductOptionGroup({
                        tenant_id: tenantId,
                        product_id: productId,
                        name: "Formato",
                        is_required: true,
                        max_selectable: 1,
                        group_kind: "PRIMARY_PRICE",
                        pricing_mode: "ABSOLUTE"
                    });
                    groupId = created.id;
                }
                const kept = new Set(target.map(v => v.id));
                for (const v of saved) {
                    if (!kept.has(v.id)) await deleteOptionValue(v.id);
                }
                for (const v of target) {
                    if (v.id.startsWith(NEW_PREFIX)) {
                        const created = await createOptionValue({
                            tenant_id: tenantId,
                            option_group_id: groupId,
                            name: v.name,
                            price_modifier: null,
                            absolute_price: v.absolute_price
                        });
                        // Già nel database: se il Salva si ferma più avanti, non si ricrea.
                        setRows(prev => prev.map(r => (r.id === v.id ? created : r)));
                        continue;
                    }
                    const before = saved.find(s => s.id === v.id);
                    if (before && (before.name !== v.name || before.absolute_price !== v.absolute_price)) {
                        await updateOptionValue(v.id, {
                            name: v.name,
                            price_modifier: null,
                            absolute_price: v.absolute_price
                        });
                    }
                }
            }
            resyncNext.current = true;
            await onRefresh();
            return true;
        } catch {
            // Il gruppo o qualche formato può essere già nato: si ricarica
            // lo stesso, così il Salva dopo li ritrova invece di rifarli.
            await onRefresh().catch(() => undefined);
            return false;
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [isDirty, target, group, saved, tenantId, productId, onRefresh]);

    const discard = useCallback(() => {
        resyncNext.current = false;
        setMode(savedMode);
        setRows(saved);
    }, [saved, savedMode]);

    return { mode, setMode: changeMode, rows, add, update, remove, isDirty, isSaving, save, discard };
}

export type FormatsDraft = ReturnType<typeof useFormatsDraft>;
