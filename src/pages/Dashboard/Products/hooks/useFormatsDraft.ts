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

    useEffect(() => {
        setMode(savedMode);
        setRows(saved);
    }, [saved, savedMode]);

    const target = useMemo(() => (mode === "formato" ? rows : []), [mode, rows]);
    const isDirty = !sameValues(target, saved);

    const add = useCallback(async (name: string, price: number) => {
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
    }, []);

    const update = useCallback(async (id: string, name: string, price: number) => {
        setRows(prev => prev.map(v => (v.id === id ? { ...v, name, absolute_price: price } : v)));
    }, []);

    const remove = useCallback(async (id: string) => {
        setRows(prev => prev.filter(v => v.id !== id));
    }, []);

    const save = useCallback(async (): Promise<boolean> => {
        if (!isDirty) return true;
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
                        await createOptionValue({
                            tenant_id: tenantId,
                            option_group_id: groupId,
                            name: v.name,
                            price_modifier: null,
                            absolute_price: v.absolute_price
                        });
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
            await onRefresh();
            return true;
        } catch {
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [isDirty, target, group, saved, tenantId, productId, onRefresh]);

    const discard = useCallback(() => {
        setMode(savedMode);
        setRows(saved);
    }, [saved, savedMode]);

    return { mode, setMode, rows, add, update, remove, isDirty, isSaving, save, discard };
}

export type FormatsDraft = ReturnType<typeof useFormatsDraft>;
