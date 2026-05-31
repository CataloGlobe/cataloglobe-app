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
    canEditSchedule,
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
        permissions: opts.permissions ?? new Set()
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
// Scheduling
// ============================================================

describe("canEditSchedule", () => {
    it("senza scheduling.write su any activity: false", () => {
        expect(canEditSchedule(viewer, {
            apply_to_all: false,
            targets: [{ target_type: "activity", target_id: ACT_A }]
        })).toBe(false);
    });

    it("owner/admin: true sempre se hanno scheduling.write", () => {
        expect(canEditSchedule(owner, { apply_to_all: true, targets: [] })).toBe(true);
        expect(canEditSchedule(admin, {
            apply_to_all: false,
            targets: [{ target_type: "activity", target_id: ACT_C }]
        })).toBe(true);
    });

    it("manager: apply_to_all=true → false", () => {
        expect(canEditSchedule(manager, { apply_to_all: true, targets: [] })).toBe(false);
    });

    it("manager: tutti i target activity nelle sue sedi → true", () => {
        expect(canEditSchedule(manager, {
            apply_to_all: false,
            targets: [
                { target_type: "activity", target_id: ACT_A },
                { target_type: "activity", target_id: ACT_B }
            ]
        })).toBe(true);
    });

    it("manager: anche un solo target fuori scope → false", () => {
        expect(canEditSchedule(manager, {
            apply_to_all: false,
            targets: [
                { target_type: "activity", target_id: ACT_A },
                { target_type: "activity", target_id: ACT_C }
            ]
        })).toBe(false);
    });

    it("manager: activity_group target → false conservativo", () => {
        expect(canEditSchedule(manager, {
            apply_to_all: false,
            targets: [{ target_type: "activity_group", target_id: "some-group" }]
        })).toBe(false);
    });
});
