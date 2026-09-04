import type { LayoutRule } from "@services/supabase/layoutScheduling";
import { isLayoutRuleDraft } from "@utils/scheduleDraft";

/**
 * Union discriminata: quando `canToggle` è false il motivo è sempre presente,
 * così i chiamanti non hanno bisogno di non-null assertion sul messaggio.
 */
export type RuleToggleGuardResult =
    | { canToggle: true; reason?: undefined }
    | { canToggle: false; reason: string };

/**
 * Guardie business sull'attivazione di una regola di programmazione.
 *
 * Valgono solo in direzione ON: disattivare una regola è sempre consentito,
 * quindi il chiamante deve invocare questo helper unicamente quando il nuovo
 * valore è `true`.
 *
 * 1. Regola scaduta (`end_at` nel passato) → va aggiornata la data di fine.
 * 2. Bozza incompleta (`isLayoutRuleDraft`) → mancano campi obbligatori.
 */
export function getToggleGuardResult(rule: LayoutRule): RuleToggleGuardResult {
    if (rule.end_at && new Date(rule.end_at) < new Date()) {
        return {
            canToggle: false,
            reason: "Questa regola è scaduta. Aggiorna la data di fine prima di riattivarla."
        };
    }
    if (isLayoutRuleDraft(rule)) {
        return {
            canToggle: false,
            reason: "Completa i campi obbligatori prima di attivare la regola."
        };
    }
    return { canToggle: true };
}
