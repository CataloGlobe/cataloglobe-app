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

const TUTTI = ["orders.read", "reservations.read", "tables.read", "activity.read"];

describe("firstSedeSegment — la prima voce usabile, nell'ordine della sidebar", () => {
    it("owner col piano Pro atterra su Comande", () => {
        expect(firstSedeSegment(perms("owner", TUTTI), pro, SEDE)).toBe("comande");
    });

    it("col piano base salta le voci col lucchetto e atterra su Sala", () => {
        expect(firstSedeSegment(perms("owner", TUTTI), base, SEDE)).toBe("sala");
    });

    it("senza orders.read atterra su Prenotazioni", () => {
        expect(firstSedeSegment(perms("admin", ["reservations.read", "tables.read", "activity.read"]), pro, SEDE)).toBe(
            "prenotazioni"
        );
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
        expect(SEDE_NAV_ENTRIES.map(e => e.segment)).toEqual(["comande", "prenotazioni", "sala", "cosa-vedono", "anagrafica"]);
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

    it("un valore sconosciuto apre l'Anagrafica", () => {
        expect(legacyTabTarget("boh")).toEqual({ segment: "anagrafica" });
    });
});
