// ============================================================
// Activity-aware permissions library (post-Fase 2).
//
// Source of truth: RPC `public.get_my_permissions(p_tenant_id)`.
// Vedi `src/services/supabase/permissions.ts` per il fetch e
// `src/context/PermissionsContext.tsx` per il provider.
//
// Le funzioni qui sono pure (no side effects, no async). Devono
// replicare ESATTAMENTE le verifiche backend RPC; ogni divergenza
// è un bug.
//
// Per scope workspace (lista tenant fuori PermissionsProvider) usare
// `src/utils/workspaceRole.ts` (literal compare su tenant.user_role).
// ============================================================

export type UserRole = "owner" | "admin" | "manager" | "staff" | "viewer";

export interface UserPermissions {
    tenantId: string;
    role: UserRole;
    /** Vuoto per owner/admin (tutte le sedi del tenant implicite). Popolato
     *  con le activity_id assegnate per manager/staff/viewer. */
    activityIds: string[];
    /** Set di permission_id che il role ha grantati via role_permissions. */
    permissions: Set<string>;
    /**
     * Ruoli di sede: per ogni permesso, le sedi su cui lo dà almeno uno dei
     * ruoli del caller (RPC `get_my_permission_activities`, D35). Con ruoli
     * diversi per sede (manager qui, viewer là) `role` e `activityIds` dicono
     * solo il ruolo più alto: questa mappa dice il vero, come `has_permission`.
     * Assente per owner/admin, o finché la migration non è applicata: allora
     * valgono `activityIds` e `permissions` come prima.
     */
    activitiesByPermission?: ReadonlyMap<string, readonly string[]>;
}

/**
 * Le sedi su cui il caller ha `permissionId`, se la mappa per sede lo
 * conosce. La mappa ha solo i permessi di sede: per un permesso di tenant, o
 * che nessun ruolo dà, si resta a `permissions` e `activityIds`.
 */
function activitiesFor(perms: UserPermissions, permissionId: string): readonly string[] | undefined {
    return perms.activitiesByPermission?.get(permissionId);
}

/** True se `perms.role === 'owner'`. */
export function isOwner(perms: UserPermissions): boolean {
    return perms.role === "owner";
}

// ----------------------------------------------------------------------------
// Atomic checks
// ----------------------------------------------------------------------------

/** True se il caller ha `permissionId` grantato dal proprio role. */
export function canDoOnTenant(perms: UserPermissions, permissionId: string): boolean {
    return perms.permissions.has(permissionId);
}

/**
 * True se il caller può esercitare `permissionId` sull'activity specifica.
 * Owner/admin: sempre true se ha il permesso.
 * Manager/staff/viewer: true se ha il permesso E l'activity è nelle sue.
 */
export function canDoOnActivity(
    perms: UserPermissions,
    permissionId: string,
    activityId: string
): boolean {
    if (isTenantWide(perms)) return perms.permissions.has(permissionId);
    const activities = activitiesFor(perms, permissionId);
    if (activities) return activities.includes(activityId);
    if (!perms.permissions.has(permissionId)) return false;
    return perms.activityIds.includes(activityId);
}

/**
 * True se il caller può esercitare `permissionId` su ALMENO una activity.
 * Utile per gating UI di lista (es. "mostra menu schedule" se può editare
 * almeno uno schedule).
 */
export function canDoOnAnyActivity(perms: UserPermissions, permissionId: string): boolean {
    if (isTenantWide(perms)) return perms.permissions.has(permissionId);
    const activities = activitiesFor(perms, permissionId);
    if (activities) return activities.length > 0;
    if (!perms.permissions.has(permissionId)) return false;
    return perms.activityIds.length > 0;
}

/**
 * Può vedere perché la sede mostra quello che mostra: la banda dell'esito,
 * la provenienza per riga, il prezzo dalla regola e il menù attivo di
 * «Cosa vedono i clienti» (§50.20). È l'unico gate di quei punti.
 *
 * Il resolver del pannello legge con le RLS di chi guarda, l'Edge della
 * pagina pubblica con `service_role`. Senza `scheduling.read` sulla sede le
 * regole non si leggono affatto (`can_read_schedule`); senza
 * `activity_groups.read` non si leggono i gruppi della sede
 * (`activity_group_members`), quindi mancano le regole che puntano a un
 * gruppo. In entrambi i casi la spiegazione sarebbe falsa: oggi staff e
 * viewer vedono solo le modifiche a mano.
 */
export function canExplainActivityCatalog(perms: UserPermissions, activityId: string): boolean {
    return canDoOnActivity(perms, "scheduling.read", activityId) && canDoOnAnyActivity(perms, "activity_groups.read");
}

// ----------------------------------------------------------------------------
// Composite role checks
// ----------------------------------------------------------------------------

/** True se ruolo è owner OR admin (scope tenant-wide). */
export function isOwnerOrAdmin(perms: UserPermissions): boolean {
    return perms.role === "owner" || perms.role === "admin";
}

/** Alias semantico di {@link isOwnerOrAdmin}. */
export function isTenantWide(perms: UserPermissions): boolean {
    return isOwnerOrAdmin(perms);
}

// ----------------------------------------------------------------------------
// Composite checks — team management (drawer membri Fase 5)
// ----------------------------------------------------------------------------

/**
 * True se il caller può invitare un nuovo membro con `targetRole`.
 * Replica la logica di `public.invite_tenant_member` RPC:
 *  - owner non invitabile (transfer_ownership separato)
 *  - admin invitabile solo da owner/admin
 *  - manager/staff/viewer invitabili da chiunque abbia `team.invite`
 */
export function canInviteRole(perms: UserPermissions, targetRole: UserRole): boolean {
    if (targetRole === "owner") return false;
    if (targetRole === "admin") return isOwnerOrAdmin(perms);
    return canDoOnTenant(perms, "team.invite");
}

interface MembershipTarget {
    role: UserRole;
    /** Per ruoli activity-scoped: array di activity_id assegnate al membro target. */
    activityIds: string[];
    /** Opzionale: user_id del target. Se passato insieme a `callerUserId`,
     *  abilita il check self-modification. */
    userId?: string;
}

/**
 * True se il caller può cambiare il ruolo del membro target.
 * Replica la logica di `public.change_member_role` RPC:
 *  - owner non modificabile via questa RPC
 *  - self-modification bloccata (se `callerUserId` e `target.userId` passati)
 *  - serve `team.manage_roles`
 *  - solo owner/admin possono cambiare un admin OR promuovere a admin
 *  - manager può modificare solo membri con tma TUTTE nelle sue sedi
 *
 * `callerUserId` è opzionale per backward compat con i call site che non
 * lo passano (il gating self-modification viene saltato in quel caso).
 */
export function canChangeRoleOf(
    perms: UserPermissions,
    target: MembershipTarget,
    callerUserId?: string
): boolean {
    if (target.role === "owner") return false;
    if (callerUserId && target.userId && target.userId === callerUserId) return false;
    if (!canDoOnTenant(perms, "team.manage_roles")) return false;
    if (!isOwnerOrAdmin(perms) && target.role === "admin") return false;
    if (!isOwnerOrAdmin(perms)) {
        // Manager: deve gestire TUTTE le sedi del target
        return target.activityIds.every(a => perms.activityIds.includes(a));
    }
    return true;
}

/**
 * True se il caller può rimuovere il membro target. Stessa logica di
 * {@link canChangeRoleOf} ma controlla `team.remove` invece di
 * `team.manage_roles`. Anche qui self-removal bloccata.
 */
export function canRemoveMember(
    perms: UserPermissions,
    target: MembershipTarget,
    callerUserId?: string
): boolean {
    if (target.role === "owner") return false;
    if (callerUserId && target.userId && target.userId === callerUserId) return false;
    if (!canDoOnTenant(perms, "team.remove")) return false;
    if (!isOwnerOrAdmin(perms) && target.role === "admin") return false;
    if (!isOwnerOrAdmin(perms)) {
        return target.activityIds.every(a => perms.activityIds.includes(a));
    }
    return true;
}


// ----------------------------------------------------------------------------
// Composite checks — Programmazione
// ----------------------------------------------------------------------------

interface RuleTargets {
    applyToAll: boolean;
    activityIds: string[];
    groupIds: string[];
}

/**
 * True se il caller può modificare la regola. Replica
 * `public.can_write_schedule`:
 *  - owner/admin con `scheduling.write`: sempre;
 *  - ruoli di sede con `scheduling.write`: mai su una regola di tutte le
 *    sedi, mai su una regola senza sedi; ogni sede tra le proprie e ogni
 *    gruppo con tutte le sedi tra le proprie (D13, come assegnarlo).
 *
 * `groupMembers` (gruppo → sedi): un gruppo vuoto o di cui non si conoscono
 * le sedi conta come non proprio, così l'interfaccia non promette una
 * modifica che il DB rifiuterebbe.
 */
export function canWriteRule(
    perms: UserPermissions,
    rule: RuleTargets,
    groupMembers?: ReadonlyMap<string, readonly string[]>
): boolean {
    if (isTenantWide(perms)) return perms.permissions.has("scheduling.write");
    // Le sedi dove il caller ha davvero `scheduling.write` (D35): una sede da
    // viewer non conta, anche se è manager altrove.
    const writable = activitiesFor(perms, "scheduling.write") ?? (perms.permissions.has("scheduling.write") ? perms.activityIds : []);
    if (writable.length === 0) return false;
    if (rule.applyToAll) return false;
    if (rule.activityIds.length === 0 && rule.groupIds.length === 0) return false;
    const mine = (activityId: string) => writable.includes(activityId);
    return (
        rule.activityIds.every(mine) &&
        rule.groupIds.every(groupId => {
            const members = groupMembers?.get(groupId) ?? [];
            return members.length > 0 && members.every(mine);
        })
    );
}
