/**
 * Utility per scope workspace dove non c'è PermissionsProvider.
 *
 * Confronto literal su `user_role` da get_user_tenants view. Differente
 * dalla nuova API permissions (canDoOnTenant ecc.) che richiede
 * PermissionsProvider: workspace lista TUTTI i tenant del caller quindi
 * non può montare un provider per ognuno.
 *
 * Tenant scoped (manager/staff/viewer) hanno user_role=NULL nella view
 * perché post-Fase 2 tm.role è NULL per loro. workspaceRoleIsScoped
 * cattura sia loro sia null per robustezza.
 */

export type WorkspaceRoleStr = string | null | undefined;

export function workspaceRoleIsOwner(role: WorkspaceRoleStr): boolean {
    return role === "owner";
}

export function workspaceRoleIsAdmin(role: WorkspaceRoleStr): boolean {
    return role === "admin";
}

/** "Scoped" = né owner né admin. Manager/staff/viewer + null. */
export function workspaceRoleIsScoped(role: WorkspaceRoleStr): boolean {
    return role !== "owner" && role !== "admin";
}
