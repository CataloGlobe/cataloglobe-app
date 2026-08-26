// Fees JSONB (`{key,value}[]`) → righe label+unità per la pagina di chiusura
// del PDF. Modulo separato da loadMenuPdfData (che importa il client Supabase)
// per restare puro e testabile in isolamento.

import { FEE_DEFINITIONS_BY_KEY } from "@/constants/activityFees";
import { formatDecimal } from "@/utils/formatCurrency";
import { parseDecimalPrice } from "@/utils/priceParser";
import type { ActivityFee } from "@/types/activity";
import type { MenuPdfInfoRow } from "./menuPdfTypes";

/**
 * Solo le voci monetarie vanno normalizzate a 2 decimali: "2,50 €/persona".
 * Percentuali ed età restano intere come digitate ("10 %", "8 anni").
 */
const CURRENCY_UNIT_FORMAT_KEYS = new Set(["currency", "per_person"]);

/**
 * Il valore nel JSONB è una stringa digitata dal ristoratore e l'input
 * accetta sia "2.5" che "2,5" (vedi FeesSection): si parsa prima di
 * formattare. Se il parse fallisce (dato sporco, valore non numerico) si
 * stampa il valore grezzo — meglio una fee imperfetta che una fee assente
 * dal documento: il coperto ha valore legale.
 */
export function mapFees(fees: ActivityFee[] | null): MenuPdfInfoRow[] {
    return (fees ?? [])
        .filter(f => f.value != null && f.value !== "")
        .map(f => {
            const def = FEE_DEFINITIONS_BY_KEY[f.key];
            if (!def) return { label: f.key, value: f.value };

            let displayValue = f.value;
            if (CURRENCY_UNIT_FORMAT_KEYS.has(def.unitFormatKey)) {
                const parsed = parseDecimalPrice(f.value);
                if (!Number.isNaN(parsed)) displayValue = formatDecimal(parsed);
            }

            return { label: def.label, value: `${displayValue} ${def.unit}` };
        });
}
