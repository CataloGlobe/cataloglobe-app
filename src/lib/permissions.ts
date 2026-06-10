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

