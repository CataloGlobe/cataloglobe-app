import { describe, expect, it } from "vitest";
import type { UserPermissions, UserRole } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
import { SERVIZIO_MODES, canSeeServizio, modeAccess, resolveServizioMode } from "@/utils/servizioModes";

const SEDE = "sede-1";

function perms(role: UserRole, permissions: string[], activityIds: string[] = [SEDE]): UserPermissions {
    return { tenantId: "t", role, activityIds, permissions: new Set(permissions) };
}

const pro = (): boolean => true;
const base = (f: PlanFeature): boolean => f !== "table_ordering" && f !== "table_reservation";
const mappa = SERVIZIO_MODES.find(m => m.mode === "mappa")!;
const elenco = SERVIZIO_MODES.find(m => m.mode === "elenco")!;
const LEGGE = ["tables.read", "orders.read"];
/** Staff e viewer della matrice (§6): leggono tavoli, ordini, prenotazioni e tavolate. */
const TUTTO = ["tables.read", "orders.read", "reservations.read", "seatings.read"];

// La Sala (tavoli, zone, QR) è il terzo modo di Servizio, senza lucchetto
// (Officina 3: con la Scheda C+++ esce dalla Scheda e torna qui).
describe("canSeeServizio", () => {
    it("chi ha i permessi di un modo, anche col lucchetto del piano", () => {
        expect(canSeeServizio(perms("viewer", LEGGE), SEDE)).toBe(true);
        expect(canSeeServizio(perms("viewer", ["reservations.read", "seatings.read"]), SEDE)).toBe(true);
    });

    it("chi legge solo i tavoli vede Servizio: c'è la Sala", () => {
        expect(canSeeServizio(perms("viewer", ["tables.read"]), SEDE)).toBe(true);
    });

    it("senza nessun permesso dei modi non lo vede", () => {
        expect(canSeeServizio(perms("viewer", ["orders.read"]), SEDE)).toBe(false);
    });

    it("i permessi valgono su questa sede", () => {
        expect(canSeeServizio(perms("manager", LEGGE, ["sede-2"]), SEDE)).toBe(false);
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
        expect(SERVIZIO_MODES.map(m => m.mode)).toEqual(["elenco", "mappa", "sala"]);
    });
});

describe("resolveServizioMode", () => {
    it("col piano Pro e tutti i permessi si atterra sull'Elenco", () => {
        expect(resolveServizioMode(null, perms("staff", TUTTO), pro, SEDE)).toBe("elenco");
    });

    it("col piano base si atterra sulla Sala, anche chiedendo l'Elenco", () => {
        expect(resolveServizioMode(null, perms("staff", TUTTO), base, SEDE)).toBe("sala");
        expect(resolveServizioMode("elenco", perms("staff", TUTTO), base, SEDE)).toBe("sala");
    });

    it("col piano base e senza i tavoli nessun modo si usa: la pagina dice che è del piano Pro", () => {
        expect(resolveServizioMode(null, perms("staff", ["reservations.read", "seatings.read"]), base, SEDE)).toBeNull();
    });

    it("senza ?modo= il primo usabile: la Mappa col piano Pro", () => {
        expect(resolveServizioMode(null, perms("staff", LEGGE), pro, SEDE)).toBe("mappa");
    });

    it("il modo chiesto, se si può usare", () => {
        expect(resolveServizioMode("mappa", perms("staff", TUTTO), pro, SEDE)).toBe("mappa");
    });

    it("un ?modo= sconosciuto passa al primo usabile", () => {
        expect(resolveServizioMode("boh", perms("staff", TUTTO), pro, SEDE)).toBe("elenco");
    });

    it("chi legge solo i tavoli arriva alla Sala", () => {
        expect(resolveServizioMode(null, perms("staff", ["tables.read"]), pro, SEDE)).toBe("sala");
    });

    it("nessun modo usabile: null, la pagina dice che non c'è accesso", () => {
        expect(resolveServizioMode(null, perms("staff", ["orders.read"]), pro, SEDE)).toBeNull();
    });
});
