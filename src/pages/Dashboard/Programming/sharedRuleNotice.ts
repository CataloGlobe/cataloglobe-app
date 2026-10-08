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
 * quando vale solo per questa sede o non vale per questa sede. Conta la
 * regola salvata, non il form.
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
    // La regola non vale per la sede del path (link scritto a mano): la barra
    // non ha niente di vero da dire.
    if (!reached.has(activityId)) return null;
    reached.delete(activityId);
    // Anche le sedi che chi guarda non vede (un manager vede solo le sue):
    // contano, ma senza nome.
    if (reached.size === 0) return null;
    if (reached.size === 1) {
        const [otherId] = reached;
        const other = seats.find(seat => seat.id === otherId)?.name ?? "un'altra sede";
        return `Vale per ${here} e anche per ${other}: se la cambi, cambia in entrambe.`;
    }
    return `Vale per ${here} e anche per altre ${reached.size} sedi: se la cambi, cambia in tutte.`;
}
