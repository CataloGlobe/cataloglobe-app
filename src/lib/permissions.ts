// ============================================================
// LEGACY API — deprecated, will be removed in Fase 5 cleanup.
//
// The 3-role enum ("owner" | "admin" | "member") predates the
// activity-scoped permission model introduced in Fase 2. Helpers
// here are kept to avoid breaking the 9 existing callers while
// the new permission library is rolled out incrementally.
//
// New code MUST use the UserPermissions-based helpers in the
// section below.
// ============================================================

/**
 * @deprecated Use {@link UserRole} (5 valori) e {@link UserPermissions}.
 * Enum legacy 3-ruoli. `member` non è più valido lato DB post-Fase 2:
 * i ruoli activity-scoped (manager/staff/viewer) hanno
 * `tenant_memberships.role = NULL`, quindi user_tenants_view.user_role
 * ritorna NULL per loro.
 */
export type Role = "owner" | "admin" | "member";

/**
 * @deprecated Use {@link isOwner} overload con `UserPermissions` per nuovo code.
 * Legacy: matcha la stringa 'owner' contro un input role.
 */
export function isOwner(role: Role | string | null | undefined): boolean;
/**
 * Nuovo: true se `perms.role === 'owner'`.
 */
export function isOwner(perms: UserPermissions): boolean;
export function isOwner(input: Role | string | UserPermissions | null | undefined): boolean {
    if (input == null) return false;
    if (typeof input === "string") return input === "owner";
    return input.role === "owner";
}

/**
 * @deprecated Legacy. Per nuovo code usare `perms.role === 'admin'` direttamente.
 */
export function isAdmin(role: Role | string | null | undefined): boolean {
    return role === "admin";
}

/**
 * @deprecated Legacy. `member` non esiste più come ruolo DB. Per nuovo code
 * differenziare manager/staff/viewer esplicitamente via `perms.role`.
 */
export function isMember(role: Role | string | null | undefined): boolean {
    return role === "member";
}

/**
 * @deprecated Use {@link isOwnerOrAdmin} con `UserPermissions`.
 * True if role is owner or admin.
 */
export function canManage(role: Role | string | null | undefined): boolean {
    return role === "owner" || role === "admin";
}

// ============================================================
// NEW API — activity-aware permissions (post-Fase 2)
//
// Source of truth: RPC `public.get_my_permissions(p_tenant_id)`.
// Vedi `src/services/supabase/permissions.ts` per il fetch e
// `src/context/PermissionsContext.tsx` per il provider.
//
// Le funzioni qui sono pure (no side effects, no async). Devono
// replicare ESATTAMENTE le verifiche backend RPC; ogni divergenza
// è un bug.
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
    if (!perms.permissions.has(permissionId)) return false;
    if (isTenantWide(perms)) return true;
    return perms.activityIds.includes(activityId);
}

/**
 * True se il caller può esercitare `permissionId` su ALMENO una activity.
 * Utile per gating UI di lista (es. "mostra menu schedule" se può editare
 * almeno uno schedule).
 */
export function canDoOnAnyActivity(perms: UserPermissions, permissionId: string): boolean {
    if (!perms.permissions.has(permissionId)) return false;
    if (isTenantWide(perms)) return true;
    return perms.activityIds.length > 0;
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
// Composite checks — scheduling
// ----------------------------------------------------------------------------

interface ScheduleShape {
    apply_to_all: boolean;
    targets: Array<{ target_type: string; target_id: string }>;
}

/**
 * True se il caller può editare lo schedule.
 * Replica la logica di `public.update_schedule_targets` RPC:
 *  - serve `scheduling.write` su almeno una sede
 *  - owner/admin: sempre true se ha il permesso
 *  - manager: schedule.apply_to_all=true non editabile
 *  - manager: schedule.targets con target_type='activity_group' → false
 *    conservativo (espansione members non disponibile lato client)
 *  - manager: schedule.targets con target_type='activity' → tutti devono
 *    essere nelle sue activityIds
 */
export function canEditSchedule(perms: UserPermissions, schedule: ScheduleShape): boolean {
    if (!canDoOnAnyActivity(perms, "scheduling.write")) return false;
    if (isTenantWide(perms)) return true;
    if (schedule.apply_to_all) return false;
    return schedule.targets.every(t => {
        if (t.target_type === "activity") return perms.activityIds.includes(t.target_id);
        // activity_group: conservativo. Espansione members richiederebbe
        // fetch sincrono. Manager con group target → editi via RPC che
        // valida server-side; UI nasconde l'edit.
        return false;
    });
}
