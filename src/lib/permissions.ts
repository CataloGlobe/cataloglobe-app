export type Role = "owner" | "admin" | "member";

export const permissions = {
    activity: {
        create: (role: Role) => role === "owner" || role === "admin",
        update: (role: Role) => role === "owner" || role === "admin",
        delete: (role: Role) => role === "owner" || role === "admin"
    },
    tenant: {
        invite: (role: Role) => role === "owner" || role === "admin",
        changeRole: (role: Role) => role === "owner",
        transferOwnership: (role: Role) => role === "owner"
    }
} as const;
