import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import {
    type V2ProductAttributeDefinition,
    type V2ProductAttributeValue,
    type AttributeValuePayload,
    listAttributeDefinitions,
    getProductAttributes,
    setProductAttributeValue,
    removeProductAttributeValue
} from "@/services/supabase/attributes";
import { attributeDraftFromRow, attributePayloadFromDraft, requiredError } from "../attributeDraft";

type Options = {
    productId: string;
    tenantId: string;
    vertical?: string;
    /** Solo nei verticali con attributi (`productSections.customAttributes`). */
    enabled: boolean;
};

/**
 * I valori degli attributi di un prodotto nella bozza di pagina (§27, lotto
 * Prodotti P8). Prima si salvavano `onBlur`, campo per campo: nella stessa
 * fila di tab la Scheda aspettava «Salva» e gli Attributi no. Ora sono campi
 * del draft come gli altri, sopravvivono al cambio tab, e li salva l'header.
 *
 * Restano immediate le azioni strutturali: assegnare un attributo al
 * prodotto (drawer) e toglierlo. Ricaricando dopo una di queste, i valori
 * già modificati nella bozza restano.
 */
export function useAttributeValuesDraft({ productId, tenantId, vertical, enabled }: Options) {
    const { showToast } = useToast();
    const [definitions, setDefinitions] = useState<V2ProductAttributeDefinition[]>([]);
    const [values, setValues] = useState<V2ProductAttributeValue[]>([]);
    const [loading, setLoading] = useState(enabled);
    const [saved, setSaved] = useState<Record<string, string>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    // L'ultimo salvato, letto dalla ricarica per riconoscere i valori toccati.
    const savedRef = useRef(saved);
    useEffect(() => {
        savedRef.current = saved;
    }, [saved]);

    const load = useCallback(async () => {
        if (!enabled || !productId || !tenantId) return;
        try {
            setLoading(true);
            const [defs, vals] = await Promise.all([
                listAttributeDefinitions(tenantId, vertical),
                getProductAttributes(productId, tenantId)
            ]);
            const rowByDef = new Map(vals.map(v => [v.attribute_definition_id, v]));
            const nextSaved: Record<string, string> = {};
            for (const def of defs) nextSaved[def.id] = attributeDraftFromRow(def, rowByDef.get(def.id));
            setDefinitions(defs);
            setValues(vals);
            // Un valore già toccato nella bozza resta com'è: la ricarica viene
            // da un'azione strutturale (assegna, togli), non da un salvataggio.
            setDrafts(prevDrafts => {
                const next: Record<string, string> = {};
                for (const def of defs) {
                    const touched = def.id in prevDrafts && prevDrafts[def.id] !== savedRef.current[def.id];
                    next[def.id] = touched ? prevDrafts[def.id] : nextSaved[def.id];
                }
                return next;
            });
            setSaved(nextSaved);
            // Un attributo richiesto già assegnato ma vuoto si segnala subito.
            const nextErrors: Record<string, string> = {};
            for (const def of defs) {
                const row = rowByDef.get(def.id);
                if (!row) continue;
                const error = requiredError(def, attributePayloadFromDraft(def, nextSaved[def.id]));
                if (error) nextErrors[def.id] = error;
            }
            setErrors(nextErrors);
        } catch {
            showToast({ message: "Errore nel caricamento degli attributi", type: "error" });
        } finally {
            setLoading(false);
        }
    }, [enabled, productId, tenantId, vertical, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const linkedIds = useMemo(() => new Set(values.map(v => v.attribute_definition_id)), [values]);

    const dirtyIds = useMemo(
        () => [...linkedIds].filter(id => id in drafts && drafts[id] !== saved[id]),
        [linkedIds, drafts, saved]
    );
    const isDirty = dirtyIds.length > 0;

    const setDraft = useCallback((defId: string, value: string) => {
        setDrafts(prev => ({ ...prev, [defId]: value }));
        setErrors(prev => {
            if (!prev[defId]) return prev;
            const next = { ...prev };
            delete next[defId];
            return next;
        });
    }, []);

    const discard = useCallback(() => {
        setDrafts(saved);
        setErrors({});
    }, [saved]);

    /** Salva i valori toccati. `false` se un richiesto è vuoto o se una scrittura fallisce. */
    const save = useCallback(async (): Promise<boolean> => {
        const byId = new Map(definitions.map(d => [d.id, d]));
        const payloads: Array<{ def: V2ProductAttributeDefinition; payload: AttributeValuePayload }> = [];
        const nextErrors: Record<string, string> = {};
        for (const id of dirtyIds) {
            const def = byId.get(id);
            if (!def) continue;
            const payload = attributePayloadFromDraft(def, drafts[id]);
            const error = requiredError(def, payload);
            if (error) nextErrors[id] = error;
            else payloads.push({ def, payload });
        }
        if (Object.keys(nextErrors).length > 0) {
            setErrors(prev => ({ ...prev, ...nextErrors }));
            return false;
        }
        setIsSaving(true);
        try {
            for (const { def, payload } of payloads) {
                await setProductAttributeValue(tenantId, productId, def.id, payload);
                setSaved(prev => ({ ...prev, [def.id]: drafts[def.id] }));
            }
            return true;
        } catch {
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [definitions, dirtyIds, drafts, tenantId, productId]);

    /** Toglie un attributo dal prodotto: strutturale, subito (§27.2). */
    const remove = useCallback(
        async (defIds: string[]) => {
            try {
                await Promise.all(defIds.map(id => removeProductAttributeValue(tenantId, productId, id)));
                showToast({
                    message: defIds.length === 1 ? "Attributo tolto." : `${defIds.length} attributi tolti.`,
                    type: "success"
                });
            } catch {
                showToast({ message: "Errore nella rimozione", type: "error" });
            }
            // Il valore tolto non è più una modifica da salvare.
            setDrafts(prev => {
                const next = { ...prev };
                for (const id of defIds) next[id] = saved[id] ?? next[id];
                return next;
            });
            await load();
        },
        [tenantId, productId, showToast, load, saved]
    );

    return {
        enabled,
        loading,
        definitions,
        values,
        linkedIds,
        drafts,
        errors,
        dirtyIds,
        isDirty,
        isSaving,
        setDraft,
        discard,
        save,
        remove,
        reload: load
    };
}

export type AttributeValuesDraft = ReturnType<typeof useAttributeValuesDraft>;
