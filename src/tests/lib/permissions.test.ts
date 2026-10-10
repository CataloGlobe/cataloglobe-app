import { describe, it, expect } from "vitest";
import {
    isOwner,
    canDoOnTenant,
    canDoOnActivity,
    canDoOnAnyActivity,
    isOwnerOrAdmin,
    isTenantWide,
    canInviteRole,
    canChangeRoleOf,
    canRemoveMember,
    canWriteRule,
    type UserPermissions
} from "@/lib/permissions";

// ============================================================
// Test fixtures
// ============================================================

const ACT_A = "11111111-1111-1111-1111-111111111111";
const ACT_B = "22222222-2222-2222-2222-222222222222";
const ACT_C = "33333333-3333-3333-3333-333333333333";

function mk(role: UserPermissions["role"], opts: Partial<Omit<UserPermissions, "role" | "tenantId">> = {}): UserPermissions {
    return {
        tenantId: "tenant-1",
        role,
        activityIds: opts.activityIds ?? [],
        permissions: opts.permissions ?? new Set(),
        activitiesByPermission: opts.activitiesByPermission
    };
}

const ALL_PERMS = new Set([
    "team.invite", "team.manage_roles", "team.remove",
    "scheduling.write", "scheduling.read",
    "products.write", "tenant.manage", "tenant.delete"
]);

const owner = mk("owner", { permissions: ALL_PERMS });
const admin = mk("admin", { permissions: ALL_PERMS });
const manager = mk("manager", {
    activityIds: [ACT_A, ACT_B],
    permissions: new Set(["team.invite", "team.manage_roles", "team.remove", "scheduling.write", "scheduling.read"])
});
const staff = mk("staff", {
    activityIds: [ACT_A],
    permissions: new Set(["scheduling.read"])
});
const viewer = mk("viewer", {
    activityIds: [ACT_A],
    permissions: new Set(["scheduling.read"])
});

// ============================================================
// isOwner (UserPermissions)
// ============================================================

describe("isOwner", () => {
    it("true se role=owner, false altrimenti", () => {
        expect(isOwner(owner)).toBe(true);
        expect(isOwner(admin)).toBe(false);
        expect(isOwner(manager)).toBe(false);
        expect(isOwner(staff)).toBe(false);
        expect(isOwner(viewer)).toBe(false);
    });
});

// ============================================================
// Atomic checks
// ============================================================

describe("canDoOnTenant", () => {
    it("true se permission presente", () => {
        expect(canDoOnTenant(owner, "team.invite")).toBe(true);
        expect(canDoOnTenant(manager, "team.invite")).toBe(true);
    });

    it("false se permission assente", () => {
        expect(canDoOnTenant(staff, "team.invite")).toBe(false);
        expect(canDoOnTenant(viewer, "scheduling.write")).toBe(false);
    });
});

describe("canDoOnActivity", () => {
    it("owner: true se ha la permission, qualsiasi activity", () => {
        expect(canDoOnActivity(owner, "scheduling.write", ACT_C)).toBe(true);
    });

    it("admin: true se ha la permission, qualsiasi activity", () => {
        expect(canDoOnActivity(admin, "scheduling.write", ACT_C)).toBe(true);
    });

    it("manager: true solo sulle sue activity", () => {
        expect(canDoOnActivity(manager, "scheduling.write", ACT_A)).toBe(true);
        expect(canDoOnActivity(manager, "scheduling.write", ACT_B)).toBe(true);
        expect(canDoOnActivity(manager, "scheduling.write", ACT_C)).toBe(false);
    });

    it("manager: false se gli manca la permission anche sulla sua activity", () => {
        expect(canDoOnActivity(manager, "products.write", ACT_A)).toBe(false);
    });

    it("staff senza permission: false sempre", () => {
        expect(canDoOnActivity(staff, "scheduling.write", ACT_A)).toBe(false);
    });
});

describe("canDoOnAnyActivity", () => {
    it("owner/admin: true se ha la permission", () => {
        expect(canDoOnAnyActivity(owner, "scheduling.write")).toBe(true);
        expect(canDoOnAnyActivity(admin, "scheduling.write")).toBe(true);
    });

    it("manager con >=1 sede: true", () => {
        expect(canDoOnAnyActivity(manager, "scheduling.write")).toBe(true);
    });

    it("manager senza sedi (edge): false", () => {
        const m0 = mk("manager", { activityIds: [], permissions: new Set(["scheduling.write"]) });
        expect(canDoOnAnyActivity(m0, "scheduling.write")).toBe(false);
    });

    it("staff senza permission: false", () => {
        expect(canDoOnAnyActivity(staff, "scheduling.write")).toBe(false);
    });
});

// ============================================================
// Role checks
// ============================================================

describe("isOwnerOrAdmin / isTenantWide", () => {
    it("true per owner e admin", () => {
        expect(isOwnerOrAdmin(owner)).toBe(true);
        expect(isOwnerOrAdmin(admin)).toBe(true);
        expect(isTenantWide(owner)).toBe(true);
        expect(isTenantWide(admin)).toBe(true);
    });

    it("false per activity-scoped", () => {
        expect(isOwnerOrAdmin(manager)).toBe(false);
        expect(isOwnerOrAdmin(staff)).toBe(false);
        expect(isOwnerOrAdmin(viewer)).toBe(false);
    });
});

// ============================================================
// Team management
// ============================================================

describe("canInviteRole", () => {
    it("owner mai invitabile", () => {
        expect(canInviteRole(owner, "owner")).toBe(false);
        expect(canInviteRole(admin, "owner")).toBe(false);
        expect(canInviteRole(manager, "owner")).toBe(false);
    });

    it("admin invitabile solo da owner/admin", () => {
        expect(canInviteRole(owner, "admin")).toBe(true);
        expect(canInviteRole(admin, "admin")).toBe(true);
        expect(canInviteRole(manager, "admin")).toBe(false);
        expect(canInviteRole(staff, "admin")).toBe(false);
    });

    it("manager/staff/viewer invitabili da chi ha team.invite", () => {
        for (const r of ["manager", "staff", "viewer"] as const) {
            expect(canInviteRole(owner, r)).toBe(true);
            expect(canInviteRole(admin, r)).toBe(true);
            expect(canInviteRole(manager, r)).toBe(true);
            expect(canInviteRole(staff, r)).toBe(false);
            expect(canInviteRole(viewer, r)).toBe(false);
        }
    });
});

describe("canChangeRoleOf", () => {
    it("owner target: mai modificabile", () => {
        expect(canChangeRoleOf(owner, { role: "owner", activityIds: [] })).toBe(false);
    });

    it("senza team.manage_roles: sempre false", () => {
        const noPerm = mk("manager", { activityIds: [ACT_A], permissions: new Set() });
        expect(canChangeRoleOf(noPerm, { role: "staff", activityIds: [ACT_A] })).toBe(false);
    });

    it("manager: non può modificare admin", () => {
        expect(canChangeRoleOf(manager, { role: "admin", activityIds: [] })).toBe(false);
    });

    it("owner/admin: modificano qualsiasi non-owner", () => {
        expect(canChangeRoleOf(owner, { role: "admin", activityIds: [] })).toBe(true);
        expect(canChangeRoleOf(admin, { role: "manager", activityIds: [ACT_A, ACT_C] })).toBe(true);
    });

    it("manager: target tma tutte nelle sue sedi → true", () => {
        expect(canChangeRoleOf(manager, { role: "staff", activityIds: [ACT_A] })).toBe(true);
        expect(canChangeRoleOf(manager, { role: "viewer", activityIds: [ACT_A, ACT_B] })).toBe(true);
    });

    it("manager: target con tma fuori scope → false", () => {
        expect(canChangeRoleOf(manager, { role: "staff", activityIds: [ACT_C] })).toBe(false);
        expect(canChangeRoleOf(manager, { role: "viewer", activityIds: [ACT_A, ACT_C] })).toBe(false);
    });
});

describe("canChangeRoleOf — self-modification guard", () => {
    const CALLER_UID = "caller-uid-123";

    it("target.userId === callerUserId → false (admin caller)", () => {
        expect(canChangeRoleOf(
            admin,
            { role: "admin", activityIds: [], userId: CALLER_UID },
            CALLER_UID
        )).toBe(false);
    });

    it("target.userId === callerUserId → false (manager caller)", () => {
        expect(canChangeRoleOf(
            manager,
            { role: "manager", activityIds: [ACT_A], userId: CALLER_UID },
            CALLER_UID
        )).toBe(false);
    });

    it("target.userId !== callerUserId → comportamento normale", () => {
        expect(canChangeRoleOf(
            admin,
            { role: "manager", activityIds: [ACT_A], userId: "other-uid" },
            CALLER_UID
        )).toBe(true);
    });

    it("callerUserId omesso → backward compat, no self-check", () => {
        expect(canChangeRoleOf(
            admin,
            { role: "admin", activityIds: [], userId: CALLER_UID }
        )).toBe(true);
    });

    it("target.userId omesso → no self-check", () => {
        expect(canChangeRoleOf(
            admin,
            { role: "admin", activityIds: [] },
            CALLER_UID
        )).toBe(true);
    });
});

describe("canRemoveMember — self-removal guard", () => {
    const CALLER_UID = "caller-uid-456";

    it("target.userId === callerUserId → false", () => {
        const withRemove = mk("manager", {
            activityIds: [ACT_A],
            permissions: new Set(["team.remove"])
        });
        expect(canRemoveMember(
            withRemove,
            { role: "staff", activityIds: [ACT_A], userId: CALLER_UID },
            CALLER_UID
        )).toBe(false);
    });

    it("target.userId !== callerUserId → comportamento normale", () => {
        const withRemove = mk("manager", {
            activityIds: [ACT_A],
            permissions: new Set(["team.remove"])
        });
        expect(canRemoveMember(
            withRemove,
            { role: "staff", activityIds: [ACT_A], userId: "other-uid" },
            CALLER_UID
        )).toBe(true);
    });

    it("callerUserId omesso → backward compat", () => {
        const withRemove = mk("manager", {
            activityIds: [ACT_A],
            permissions: new Set(["team.remove"])
        });
        expect(canRemoveMember(
            withRemove,
            { role: "staff", activityIds: [ACT_A], userId: CALLER_UID }
        )).toBe(true);
    });
});

describe("canRemoveMember", () => {
    it("usa team.remove non team.manage_roles", () => {
        const onlyManageRoles = mk("manager", {
            activityIds: [ACT_A],
            permissions: new Set(["team.manage_roles"])
        });
        expect(canRemoveMember(onlyManageRoles, { role: "staff", activityIds: [ACT_A] })).toBe(false);

        const withRemove = mk("manager", {
            activityIds: [ACT_A],
            permissions: new Set(["team.remove"])
        });
        expect(canRemoveMember(withRemove, { role: "staff", activityIds: [ACT_A] })).toBe(true);
    });

    it("owner target: mai rimovibile", () => {
        expect(canRemoveMember(owner, { role: "owner", activityIds: [] })).toBe(false);
    });
});


// ============================================================
// canWriteRule — specchio di public.can_write_schedule
// ============================================================

describe("canWriteRule", () => {
    const rule = (opts: { applyToAll?: boolean; activityIds?: string[]; groupIds?: string[] }) => ({
        applyToAll: opts.applyToAll ?? false,
        activityIds: opts.activityIds ?? [],
        groupIds: opts.groupIds ?? []
    });
    const GROUP = "group-1";

    it("owner e admin: sempre, anche su tutte le sedi o senza sedi", () => {
        expect(canWriteRule(owner, rule({ applyToAll: true }))).toBe(true);
        expect(canWriteRule(admin, rule({ activityIds: [ACT_C] }))).toBe(true);
        expect(canWriteRule(admin, rule({}))).toBe(true);
    });

    it("manager: regola solo sulle sue sedi", () => {
        expect(canWriteRule(manager, rule({ activityIds: [ACT_A] }))).toBe(true);
        expect(canWriteRule(manager, rule({ activityIds: [ACT_A, ACT_B] }))).toBe(true);
    });

    it("manager: una sede non sua basta a rendere la regola di sola lettura", () => {
        expect(canWriteRule(manager, rule({ activityIds: [ACT_A, ACT_C] }))).toBe(false);
    });

    it("manager: mai su una regola di tutte le sedi o senza sedi", () => {
        expect(canWriteRule(manager, rule({ applyToAll: true }))).toBe(false);
        expect(canWriteRule(manager, rule({}))).toBe(false);
    });

    it("manager: gruppo con tutte le sue sedi (D13)", () => {
        const mio = new Map([[GROUP, [ACT_A, ACT_B]]]);
        expect(canWriteRule(manager, rule({ groupIds: [GROUP] }), mio)).toBe(true);
    });

    it("manager: una sede del gruppo non sua basta a renderlo di sola lettura (D13)", () => {
        const misto = new Map([[GROUP, [ACT_A, ACT_C]]]);
        expect(canWriteRule(manager, rule({ groupIds: [GROUP] }), misto)).toBe(false);
        const altrui = new Map([[GROUP, [ACT_C]]]);
        expect(canWriteRule(manager, rule({ groupIds: [GROUP] }), altrui)).toBe(false);
    });

    it("manager: gruppo vuoto resta in sola lettura, come il DB", () => {
        const vuoto = new Map([[GROUP, [] as string[]]]);
        expect(canWriteRule(manager, rule({ groupIds: [GROUP] }), vuoto)).toBe(false);
    });

    it("manager: gruppo di cui non si conoscono le sedi resta in sola lettura", () => {
        expect(canWriteRule(manager, rule({ groupIds: [GROUP] }))).toBe(false);
    });

    it("staff e viewer: mai", () => {
        expect(canWriteRule(staff, rule({ activityIds: [ACT_A] }))).toBe(false);
        expect(canWriteRule(viewer, rule({ activityIds: [ACT_A] }))).toBe(false);
    });
});

// ============================================================
// D35: ruoli diversi per sede (manager su A, viewer su B)
// ============================================================

describe("ruoli diversi per sede (D35)", () => {
    // get_my_permissions risolve «manager» e dà solo la sede A;
    // get_my_permission_activities dice il vero per ogni permesso.
    const mixed = mk("manager", {
        activityIds: [ACT_A],
        permissions: new Set(["scheduling.write", "scheduling.read", "orders.manage", "orders.read"]),
        activitiesByPermission: new Map([
            ["scheduling.write", [ACT_A]],
            ["orders.manage", [ACT_A]],
            ["scheduling.read", [ACT_A, ACT_B]],
            ["orders.read", [ACT_A, ACT_B]]
        ])
    });

    it("scrive solo dove è manager, legge anche dove è viewer", () => {
        expect(canDoOnActivity(mixed, "orders.manage", ACT_A)).toBe(true);
        expect(canDoOnActivity(mixed, "orders.manage", ACT_B)).toBe(false);
        expect(canDoOnActivity(mixed, "orders.read", ACT_B)).toBe(true);
        expect(canDoOnActivity(mixed, "orders.read", ACT_C)).toBe(false);
    });

    it("permesso assente dalla mappa: nessuna sede", () => {
        expect(canDoOnActivity(mixed, "tables.manage", ACT_A)).toBe(false);
        expect(canDoOnAnyActivity(mixed, "tables.manage")).toBe(false);
        expect(canDoOnAnyActivity(mixed, "orders.read")).toBe(true);
    });

    it("canWriteRule: una regola sulla sede da viewer non si può modificare", () => {
        expect(canWriteRule(mixed, { applyToAll: false, activityIds: [ACT_A], groupIds: [] })).toBe(true);
        expect(canWriteRule(mixed, { applyToAll: false, activityIds: [ACT_A, ACT_B], groupIds: [] })).toBe(false);
        const groups = new Map([["g1", [ACT_A, ACT_B]]]);
        expect(canWriteRule(mixed, { applyToAll: false, activityIds: [], groupIds: ["g1"] }, groups)).toBe(false);
    });

    it("viewer su B e basta, con scheduling.write solo altrove: niente regole su B", () => {
        const viewerOnly = mk("viewer", {
            activityIds: [ACT_B],
            permissions: new Set(["scheduling.read"]),
            activitiesByPermission: new Map([["scheduling.read", [ACT_B]]])
        });
        expect(canWriteRule(viewerOnly, { applyToAll: false, activityIds: [ACT_B], groupIds: [] })).toBe(false);
    });

    it("senza mappa (migration non applicata) resta come prima", () => {
        const before = mk("manager", { activityIds: [ACT_A], permissions: new Set(["orders.manage"]) });
        expect(canDoOnActivity(before, "orders.manage", ACT_A)).toBe(true);
        expect(canDoOnActivity(before, "orders.manage", ACT_B)).toBe(false);
    });

    it("owner e admin ignorano la mappa", () => {
        expect(canDoOnActivity(owner, "scheduling.write", ACT_C)).toBe(true);
        expect(canWriteRule(admin, { applyToAll: true, activityIds: [], groupIds: [] })).toBe(true);
    });
});
