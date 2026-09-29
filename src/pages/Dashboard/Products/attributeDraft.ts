import type {
    AttributeValuePayload,
    V2ProductAttributeDefinition,
    V2ProductAttributeValue
} from "@/services/supabase/attributes";

/**
 * Il valore di un attributo come stringa di bozza, e ritorno (lotto Prodotti
 * P8). Logica pura, coi suoi test: la bozza confronta stringhe, il DB vuole
 * il campo tipato giusto.
 *
 * - `boolean`: "true" / "false"
 * - `number`: la cifra come scritta (virgola ammessa)
 * - `multi_select`: le opzioni separate da ", "
 * - `text`, `select` e gli altri: il testo
 */
export function attributeDraftFromRow(
    def: Pick<V2ProductAttributeDefinition, "type">,
    row: Pick<V2ProductAttributeValue, "value_text" | "value_number" | "value_boolean" | "value_json"> | undefined
): string {
    if (!row) return def.type === "boolean" ? "false" : "";
    switch (def.type) {
        case "number":
            return row.value_number !== null && row.value_number !== undefined ? String(row.value_number) : "";
        case "boolean":
            return row.value_boolean === true ? "true" : "false";
        case "multi_select":
            return Array.isArray(row.value_json) ? (row.value_json as string[]).join(", ") : "";
        default:
            return row.value_text ?? "";
    }
}

export function attributePayloadFromDraft(
    def: Pick<V2ProductAttributeDefinition, "type">,
    draft: string | undefined
): AttributeValuePayload {
    const value = draft ?? "";
    switch (def.type) {
        case "number": {
            const n = parseFloat(value.replace(",", "."));
            return { value_number: isNaN(n) ? null : n };
        }
        case "boolean":
            return { value_boolean: value === "true" };
        case "multi_select": {
            const list = value.split(",").map(s => s.trim()).filter(Boolean);
            return { value_json: list.length > 0 ? list : null };
        }
        default:
            return { value_text: value.trim() || null };
    }
}

/** «Campo obbligatorio» per un richiesto vuoto; un sì/no non è mai vuoto. */
export function requiredError(
    def: Pick<V2ProductAttributeDefinition, "type" | "is_required">,
    payload: AttributeValuePayload
): string | null {
    if (!def.is_required || def.type === "boolean") return null;
    const empty =
        def.type === "number"
            ? payload.value_number === null || payload.value_number === undefined
            : def.type === "multi_select"
              ? !payload.value_json || (Array.isArray(payload.value_json) && payload.value_json.length === 0)
              : !payload.value_text || payload.value_text.trim() === "";
    return empty ? "Campo obbligatorio" : null;
}
