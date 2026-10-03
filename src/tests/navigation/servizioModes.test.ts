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
const mappa = SERVIZIO_MODES.find(m => m.mode === "mappa")!;
const elenco = SERVIZIO_MODES.find(m => m.mode === "elenco")!;
const LEGGE = ["tables.read", "orders.read"];
/** Staff e viewer della matrice (§6): leggono tavoli, ordini, prenotazioni e tavolate. */
const TUTTO = ["tables.read", "orders.read", "reservations.read", "seatings.read"];

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

describe("modeAccess — Mappa", () => {
    it("col piano Pro chi legge tavoli e ordini", () => {
        expect(modeAccess(mappa, perms("viewer", LEGGE), pro, SEDE)).toBe("usable");
    });

    it("col piano base si vede col lucchetto", () => {
        expect(modeAccess(mappa, perms("viewer", LEGGE), base, SEDE)).toBe("locked");
    });

    it("senza orders.read non si mostra", () => {
        expect(modeAccess(mappa, perms("viewer", ["tables.read"]), pro, SEDE)).toBe("hidden");
    });
});

describe("modeAccess — Elenco (lotto B-b)", () => {
    it("col piano Pro chi legge prenotazioni e tavolate", () => {
        expect(modeAccess(elenco, perms("viewer", ["reservations.read", "seatings.read"]), pro, SEDE)).toBe("usable");
    });

    it("col piano base si vede col lucchetto", () => {
        expect(modeAccess(elenco, perms("viewer", ["reservations.read", "seatings.read"]), base, SEDE)).toBe("locked");
    });

    it("senza reservations.read non si mostra", () => {
        expect(modeAccess(elenco, perms("viewer", ["seatings.read", "tables.read"]), pro, SEDE)).toBe("hidden");
    });

    it("è il primo modo", () => {
        expect(SERVIZIO_MODES.map(m => m.mode)).toEqual(["elenco", "mappa", "gestisci"]);
    });
});

describe("resolveServizioMode", () => {
    it("col piano Pro e tutti i permessi si atterra sull'Elenco", () => {
        expect(resolveServizioMode(null, perms("staff", TUTTO), pro, SEDE)).toBe("elenco");
    });

    it("col piano base, coi permessi di tutto, Gestisci la sala", () => {
        expect(resolveServizioMode(null, perms("staff", TUTTO), base, SEDE)).toBe("gestisci");
        expect(resolveServizioMode("elenco", perms("staff", TUTTO), base, SEDE)).toBe("gestisci");
    });

    it("senza ?modo= il primo usabile: la Mappa col piano Pro", () => {
        expect(resolveServizioMode(null, perms("staff", LEGGE), pro, SEDE)).toBe("mappa");
    });

    it("col piano base Gestisci la sala, anche se si chiede la Mappa", () => {
        expect(resolveServizioMode(null, perms("staff", LEGGE), base, SEDE)).toBe("gestisci");
        expect(resolveServizioMode("mappa", perms("staff", LEGGE), base, SEDE)).toBe("gestisci");
    });

    it("il modo chiesto, se si può usare", () => {
        expect(resolveServizioMode("gestisci", perms("staff", LEGGE), pro, SEDE)).toBe("gestisci");
    });

    it("senza orders.read la Mappa non c'è: Gestisci la sala", () => {
        expect(resolveServizioMode(null, perms("staff", ["tables.read"]), pro, SEDE)).toBe("gestisci");
    });

    it("un ?modo= sconosciuto passa al primo usabile", () => {
        expect(resolveServizioMode("boh", perms("staff", ["tables.read"]), pro, SEDE)).toBe("gestisci");
    });

    it("nessun modo usabile: null, la pagina dice che non c'è accesso", () => {
        expect(resolveServizioMode(null, perms("staff", ["seatings.read"]), pro, SEDE)).toBeNull();
    });
});
