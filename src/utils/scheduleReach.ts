/**
 * Portata di una regola di Programmazione: raggiunge almeno una sede?
 *
 * Definizione (Passo 4 del multi-target), valutata in quest'ordine:
 * 1. apply_to_all = true → raggiunge tutte le sedi. Vince sempre, valutato
 *    per primo — stesso contratto del resolver (scheduleResolver.ts).
 * 2. altrimenti: almeno un target activity che ESISTE.
 * 3. altrimenti: almeno un target activity_group con ALMENO UN MEMBRO.
 * Altrimenti la portata è zero.
 *
 * Il gruppo di sistema "Tutte le sedi" ha zero membri per disegno: non va
 * trattato come un gruppo normale, ma non serve un caso speciale qui — non è
 * più scritto come target reale da nessun caller (rimosso in e7786243), e
 * comunque apply_to_all viene valutato per primo.
 */

export interface RuleReachTargets {
    applyToAll: boolean;
    activityIds: string[];
    groupIds: string[];
}

export interface RuleReachContext {
    activityExists: (activityId: string) => boolean;
    groupMemberCount: (groupId: string) => number;
}

export function ruleReachesAnyActivity(
    rule: RuleReachTargets,
    ctx: RuleReachContext
): boolean {
    if (rule.applyToAll) return true;
    if (rule.activityIds.some(id => ctx.activityExists(id))) return true;
    if (rule.groupIds.some(id => ctx.groupMemberCount(id) > 0)) return true;
    return false;
}

export interface RuleReachDescribeContext extends RuleReachContext {
    groupName: (groupId: string) => string;
}

/**
 * Motivo leggibile per una regola a portata zero (già verificata con
 * `ruleReachesAnyActivity` === false). Non richiama la verifica: il chiamante
 * decide quando è pertinente chiederlo.
 */
export function describeZeroReach(
    rule: RuleReachTargets,
    ctx: RuleReachDescribeContext
): string {
    if (rule.groupIds.length > 0) {
        const emptyGroupNames = rule.groupIds
            .filter(id => ctx.groupMemberCount(id) === 0)
            .map(id => ctx.groupName(id));

        if (emptyGroupNames.length > 0 && rule.activityIds.length === 0) {
            const [first, ...rest] = emptyGroupNames;
            return rest.length > 0
                ? `Il gruppo «${first}» (+${rest.length} altri) non ha sedi`
                : `Il gruppo «${first}» non ha sedi`;
        }
    }

    if (rule.activityIds.length > 0 || rule.groupIds.length > 0) {
        return "Le sedi indicate non esistono più";
    }

    return "Nessun target selezionato";
}
