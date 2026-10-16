import { describe, it, expect } from "vitest";
import { buildNotifyArgs } from "./notifyArgs";

// Gli argomenti devono avere esattamente i nomi che `public.notify` legge in
// SQL (mig 20261015010000): una chiave sbagliata vuol dire zero destinatari,
// senza errori.

describe("buildNotifyArgs", () => {
    it("mappa le regole dei destinatari sui nomi SQL", () => {
        const args = buildNotifyArgs({
            eventType: "reservation.new",
            recipients: {
                users: ["u1"],
                tenantOwner: true,
                tenantRoles: ["owner", "admin"],
                tenantMembers: true,
                activityPermission: { permission: "reservations.manage", activityId: "a1" },
                exclude: ["u2"]
            },
            tenantId: "t1",
            data: { x: 1 },
            dedupeKey: "k",
            accountScope: true
        });

        expect(args).toEqual({
            p_event_type: "reservation.new",
            p_recipients: {
                users: ["u1"],
                tenant_owner: true,
                tenant_roles: ["owner", "admin"],
                tenant_members: true,
                activity_permission: { permission: "reservations.manage", activity_id: "a1" },
                exclude: ["u2"]
            },
            p_tenant_id: "t1",
            p_data: { x: 1 },
            p_dedupe_key: "k",
            p_account_scope: true
        });
    });

    it("omette le regole vuote e mette i default", () => {
        const args = buildNotifyArgs({
            eventType: "support.reply",
            recipients: { users: [], tenantRoles: [], exclude: [], tenantOwner: false }
        });

        expect(args).toEqual({
            p_event_type: "support.reply",
            p_recipients: {},
            p_tenant_id: null,
            p_data: {},
            p_dedupe_key: null,
            p_account_scope: false
        });
    });
});
