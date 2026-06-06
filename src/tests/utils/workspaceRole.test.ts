import { describe, it, expect } from "vitest";
import {
    workspaceRoleIsOwner,
    workspaceRoleIsAdmin,
    workspaceRoleIsScoped
} from "@/utils/workspaceRole";

describe("workspaceRoleIsOwner", () => {
    it("true per 'owner'", () => {
        expect(workspaceRoleIsOwner("owner")).toBe(true);
    });
    it("false per admin / null / undefined / altro", () => {
        expect(workspaceRoleIsOwner("admin")).toBe(false);
        expect(workspaceRoleIsOwner(null)).toBe(false);
        expect(workspaceRoleIsOwner(undefined)).toBe(false);
        expect(workspaceRoleIsOwner("manager")).toBe(false);
    });
});

describe("workspaceRoleIsAdmin", () => {
    it("true per 'admin'", () => {
        expect(workspaceRoleIsAdmin("admin")).toBe(true);
    });
    it("false per owner / null / altri", () => {
        expect(workspaceRoleIsAdmin("owner")).toBe(false);
        expect(workspaceRoleIsAdmin(null)).toBe(false);
        expect(workspaceRoleIsAdmin("staff")).toBe(false);
    });
});

describe("workspaceRoleIsScoped", () => {
    it("true per ruoli non tenant-wide (null/manager/staff/viewer/anything else)", () => {
        expect(workspaceRoleIsScoped(null)).toBe(true);
        expect(workspaceRoleIsScoped(undefined)).toBe(true);
        expect(workspaceRoleIsScoped("manager")).toBe(true);
        expect(workspaceRoleIsScoped("staff")).toBe(true);
        expect(workspaceRoleIsScoped("viewer")).toBe(true);
    });
    it("false per owner/admin", () => {
        expect(workspaceRoleIsScoped("owner")).toBe(false);
        expect(workspaceRoleIsScoped("admin")).toBe(false);
    });
});
