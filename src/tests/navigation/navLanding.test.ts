import { describe, expect, it } from "vitest";
import type { UserPermissions, UserRole } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
import {
    SEDE_NAV_ENTRIES,
    businessHomePath,
    firstSedeSegment,
    legacyTabTarget
} from "@/utils/navLanding";

const SEDE = "sede-1";
const ALTRA = "sede-2";

function perms(role: UserRole, permissions: string[], activityIds: string[] = []): UserPermissions {
    return { tenantId: "t", role, activityIds, permissions: new Set(permissions) };
}

const pro = (): boolean => true;
const base = (f: PlanFeature): boolean => f !== "table_ordering" && f !== "table_reservation";

const TUTTI = ["orders.read", "reservations.read", "tables.read", "seatings.read", "activity.read"];

describe("firstSedeSegment — la prima voce usabile, nell'ordine della sidebar", () => {
    it("owner col piano Pro atterra su Servizio", () => {
        expect(firstSedeSegment(perms("owner", TUTTI), pro, SEDE)).toBe("servizio");
    });

    it("col piano base atterra comunque su Servizio: Gestisci la sala non ha lucchetto", () => {
        expect(firstSedeSegment(perms("owner", TUTTI), base, SEDE)).toBe("servizio");
    });

    it("senza tables.read Servizio non ha un modo da usare: si atterra su Comande", () => {
        expect(firstSedeSegment(perms("admin", ["orders.read", "seatings.read", "activity.read"]), pro, SEDE)).toBe("comande");
    });

    it("senza tavoli né ordini atterra su Prenotazioni", () => {
        expect(firstSedeSegment(perms("admin", ["reservations.read", "activity.read"]), pro, SEDE)).toBe("prenotazioni");
    });

    it("chi legge solo la sede atterra su Cosa vedono i clienti", () => {
        expect(firstSedeSegment(perms("viewer", ["activity.read"], [SEDE]), pro, SEDE)).toBe("cosa-vedono");
    });

    it("i permessi valgono su questa sede, non su un'altra", () => {
        expect(firstSedeSegment(perms("manager", TUTTI, [ALTRA]), pro, SEDE)).toBe("anagrafica");
    });

    it("nessuna voce usabile: l'Anagrafica, che dice il perché", () => {
        expect(firstSedeSegment(perms("staff", [], [SEDE]), pro, SEDE)).toBe("anagrafica");
    });

    it("l'ordine è quello della sidebar", () => {
        expect(SEDE_NAV_ENTRIES.map(e => e.segment)).toEqual([
            "servizio",
            "comande",
            "storico",
            "prenotazioni",
            "cosa-vedono",
            "anagrafica"
        ]);
    });
});

describe("businessHomePath — l'ingresso nell'azienda (D1)", () => {
    it("una sede sola: dentro la sede", () => {
        expect(businessHomePath("b", [SEDE])).toBe(`/business/b/locations/${SEDE}`);
    });

    it("più sedi: la Panoramica", () => {
        expect(businessHomePath("b", [SEDE, ALTRA])).toBe("/business/b/overview");
    });

    it("nessuna sede leggibile: la Panoramica", () => {
        expect(businessHomePath("b", [])).toBe("/business/b/overview");
    });
});

describe("legacyTabTarget — i vecchi ?tab= della scheda", () => {
    it("porta alla rotta e all'ancora", () => {
        expect(legacyTabTarget("hours")).toEqual({ segment: "orari" });
        expect(legacyTabTarget("reservations")).toEqual({ segment: "ordini-prenotazioni", hash: "prenotazioni" });
        expect(legacyTabTarget("availability")).toEqual({ segment: "cosa-vedono" });
    });

    it("la Sala è il modo Gestisci la sala di Servizio", () => {
        expect(legacyTabTarget("sala")).toEqual({ segment: "servizio", search: "modo=gestisci" });
        expect(legacyTabTarget("tables")).toEqual({ segment: "servizio", search: "modo=gestisci" });
    });

    it("un valore sconosciuto apre l'Anagrafica", () => {
        expect(legacyTabTarget("boh")).toEqual({ segment: "anagrafica" });
    });
});
