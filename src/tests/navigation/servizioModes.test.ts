import { describe, expect, it } from "vitest";
import type { UserPermissions, UserRole } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
import { SERVIZIO_MODES, modeAccess, resolveServizioMode } from "@/utils/servizioModes";

const SEDE = "sede-1";

function perms(role: UserRole, permissions: string[], activityIds: string[] = [SEDE]): UserPermissions {
    return { tenantId: "t", role, activityIds, permissions: new Set(permissions) };
}

const pro = (): boolean => true;
const base = (f: PlanFeature): boolean => f !== "table_ordering" && f !== "table_reservation";
const gestisci = SERVIZIO_MODES.find(m => m.mode === "gestisci")!;

describe("modeAccess", () => {
    it("Gestisci la sala: chi legge i tavoli, con ogni piano", () => {
        expect(modeAccess(gestisci, perms("viewer", ["tables.read"]), base, SEDE)).toBe("usable");
    });

    it("senza il permesso il modo non si mostra", () => {
        expect(modeAccess(gestisci, perms("viewer", ["seatings.read"]), pro, SEDE)).toBe("hidden");
    });

    it("i permessi valgono su questa sede", () => {
        expect(modeAccess(gestisci, perms("manager", ["tables.read"], ["sede-2"]), pro, SEDE)).toBe("hidden");
    });
});

describe("resolveServizioMode", () => {
    it("senza ?modo= il primo usabile", () => {
        expect(resolveServizioMode(null, perms("staff", ["tables.read"]), pro, SEDE)).toBe("gestisci");
    });

    it("un ?modo= sconosciuto passa al primo usabile", () => {
        expect(resolveServizioMode("boh", perms("staff", ["tables.read"]), pro, SEDE)).toBe("gestisci");
    });

    it("nessun modo usabile: null, la pagina dice che non c'è accesso", () => {
        expect(resolveServizioMode(null, perms("staff", ["seatings.read"]), pro, SEDE)).toBeNull();
    });
});
