import { describe, expect, it } from "vitest";
import type { UserPermissions } from "@/lib/permissions";
import { creaAccess } from "@/pages/Dashboard/Crea/creaAccess";

const perms = (granted: string[]): UserPermissions => ({ tenantId: "t", role: "admin", activityIds: [], permissions: new Set(granted) }) as UserPermissions;

describe("creaAccess: il permesso di lettura prima di ogni caricamento del tunnel", () => {
    it("finché i permessi arrivano (o non si sono letti) si aspetta: il tunnel non legge niente", () => {
        expect(creaAccess("stile", null, true)).toBe("wait");
        expect(creaAccess("stile", perms(["styles.read"]), true)).toBe("wait");
        expect(creaAccess("stile", null, false)).toBe("wait");
    });

    it("senza styles.read lo stile è bloccato, con styles.read si apre", () => {
        expect(creaAccess("stile", perms(["catalogs.read"]), false)).toBe("locked");
        expect(creaAccess("stile", perms(["styles.read"]), false)).toBe("open");
    });

    it("ogni tunnel guarda il suo permesso di lettura", () => {
        const all = perms(["styles.read"]);
        expect(creaAccess("menu", all, false)).toBe("locked");
        expect(creaAccess("evid", all, false)).toBe("locked");
        expect(creaAccess("storia", all, false)).toBe("locked");
        expect(creaAccess("menu", perms(["catalogs.read"]), false)).toBe("open");
    });
});
