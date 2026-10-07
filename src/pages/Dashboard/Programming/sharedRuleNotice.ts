interface Seat {
    id: string;
    name: string;
}

interface RuleReach {
    applyToAll: boolean;
    activityIds: string[];
    groupIds: string[];
}

/**
 * La riga della barra di una regola aperta dalla sede (T9b, PG7): se la
 * regola vale anche per altre sedi, cambiandola cambia anche lì. `null`
 * quando vale solo per questa sede. Conta la regola salvata, non il form.
 */
export function sharedRuleNotice(
    rule: RuleReach,
    activityId: string,
    seats: readonly Seat[],
    groupMembers: ReadonlyMap<string, readonly string[]>
): string | null {
    const here = seats.find(seat => seat.id === activityId)?.name ?? "questa sede";
    if (rule.applyToAll) {
        return `Vale per tutte le sedi: se la cambi, cambia anche fuori da ${here}.`;
    }
    const reached = new Set(rule.activityIds);
    for (const groupId of rule.groupIds) {
        for (const id of groupMembers.get(groupId) ?? []) reached.add(id);
    }
    reached.delete(activityId);
    const others = seats.filter(seat => reached.has(seat.id));
    if (others.length === 0) return null;
    if (others.length === 1) {
        return `Vale per ${here} e anche per ${others[0].name}: se la cambi, cambia in entrambe.`;
    }
    return `Vale per ${here} e anche per altre ${others.length} sedi: se la cambi, cambia in tutte.`;
}
