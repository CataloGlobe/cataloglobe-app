export type Role = "owner" | "admin" | "member";

/** True if role is owner. */
export function isOwner(role: Role | string | null | undefined): boolean {
    return role === "owner";
}

/** True if role is admin. */
export function isAdmin(role: Role | string | null | undefined): boolean {
    return role === "admin";
}

/** True if role is member. */
export function isMember(role: Role | string | null | undefined): boolean {
    return role === "member";
}

/** True if role can manage (owner OR admin): invite members, edit business, etc. */
export function canManage(role: Role | string | null | undefined): boolean {
    return role === "owner" || role === "admin";
}
