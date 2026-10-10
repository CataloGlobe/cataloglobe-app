import { describe, expect, it } from "vitest";
import type { UserPermissions, UserRole } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
import {
    ACCOUNT_ENTRIES,
    NAV_MODELS,
    businessHomePath,
    canSeeNavEntry,
    entryPath,
    isConfigurator,
    navEntryForSedeSegment,
    resolveNavContext,
    sedeLandingSegment,
    switchSedePath,
    type NavContext
} from "@/utils/navModel";

const SEDE = "sede-1";
const ALTRA = "sede-2";

function perms(role: UserRole, permissions: string[], activityIds: string[] = []): UserPermissions {
    return { tenantId: "t", role, activityIds, permissions: new Set(permissions) };
}

/** I permessi dei ruoli di sede, come in `e2e/asRole.ts` (`docs/permissions-matrix.md` §6). */
const PERMESSI_DI_SEDE: Record<"manager" | "staff" | "viewer", string[]> = {
    manager: [
        "activity.read", "activity.manage", "activity_hours.write", "activity_groups.read", "catalogs.read",
        "products.read", "product_availability.write", "featured.read", "featured.write", "stories.read",
        "stories.write", "styles.read", "scheduling.read", "scheduling.write", "tables.read", "tables.manage",
        "orders.read", "orders.manage", "reservations.read", "reservations.manage", "reviews.read",
        "reviews.moderate", "analytics.read", "notifications.receive", "team.read", "team.invite",
        "team.manage_roles", "team.remove", "tenant.read", "guests.read", "guests.manage", "seatings.read",
        "seatings.manage", "support.read", "support.write"
    ],
    staff: [
        "activity.read", "catalogs.read", "products.read", "featured.read", "stories.read", "styles.read",
        "tables.read", "tables.manage", "orders.read", "orders.manage", "reservations.read", "reservations.manage",
        "reviews.read", "reviews.moderate", "notifications.receive", "tenant.read", "seatings.read",
        "seatings.manage", "support.read", "support.write"
    ],
    viewer: [
        "activity.read", "catalogs.read", "products.read", "featured.read", "stories.read", "styles.read",
        "scheduling.read", "tables.read", "orders.read", "reservations.read", "reviews.read", "analytics.read",
        "tenant.read", "seatings.read"
    ]
};

/** Tutti i permessi del manager, per owner e admin (tenant-wide). */
const TUTTI = [...PERMESSI_DI_SEDE.manager, "activities.create", "billing.read", "settings.read"];
const owner = () => perms("owner", TUTTI);
const manager = (sedi = [SEDE]) => perms("manager", PERMESSI_DI_SEDE.manager, sedi);
const staff = (sedi = [SEDE]) => perms("staff", PERMESSI_DI_SEDE.staff, sedi);
const viewer = (sedi = [SEDE]) => perms("viewer", PERMESSI_DI_SEDE.viewer, sedi);

const pro = (): boolean => true;
const base = (f: PlanFeature): boolean => f !== "table_ordering" && f !== "table_reservation";

/** Gruppi e voci di un contesto, per titolo. */
function shape(context: NavContext): Array<[string | null, string[]]> {
    return NAV_MODELS[context].groups.map(g => [g.title, g.entries.map(e => e.label)]);
}

describe("resolveNavContext — una o più sedi leggibili (§51.2)", () => {
    it("una sede: sidebar unica, anche dentro la sede", () => {
        expect(resolveNavContext(1, false)).toBe("unica");
        expect(resolveNavContext(1, true)).toBe("unica");
    });

    it("più sedi: azienda fuori, sede dentro", () => {
        expect(resolveNavContext(2, false)).toBe("azienda");
        expect(resolveNavContext(5, true)).toBe("sede");
    });

    it("nessuna sede: azienda", () => {
        expect(resolveNavContext(0, false)).toBe("azienda");
    });

    it("sedi non ancora caricate: decide il percorso", () => {
        expect(resolveNavContext(null, true)).toBe("sede");
        expect(resolveNavContext(null, false)).toBe("azienda");
    });
});

describe("NAV_MODELS — gruppi e ordine (§51.5)", () => {
    it("sidebar unica: 15 voci nei gruppi dell'Officina, Lingue fuori", () => {
        expect(shape("unica")).toEqual([
            [null, ["Panoramica"]],
            ["Il locale", ["Scheda", "Cosa vedono i clienti"]],
            ["Menù", ["Cataloghi", "Prodotti", "Programmazione"]],
            ["Vetrina", ["Stili", "In evidenza", "Storie"]],
            ["Servizio", ["Servizio", "Prenotazioni", "Comande", "Storico"]],
            ["Clienti e numeri", ["Analitiche", "Recensioni", "Clienti"]]
        ]);
    });

    it("azienda: Sedi sotto Panoramica, niente Ordini né Prenotazioni, niente Team né Abbonamento", () => {
        expect(shape("azienda")).toEqual([
            [null, ["Panoramica", "Sedi"]],
            ["Menù", ["Cataloghi", "Prodotti", "Programmazione"]],
            ["Vetrina", ["Stili", "In evidenza", "Storie"]],
            ["Clienti e numeri", ["Analitiche", "Recensioni", "Clienti"]]
        ]);
    });

    it("sede: il locale con la sua Programmazione, il lavoro in sala, i risultati della sede", () => {
        expect(shape("sede")).toEqual([
            ["Il locale", ["Scheda", "Cosa vedono i clienti", "Programmazione"]],
            ["Servizio", ["Servizio", "Prenotazioni", "Comande", "Storico"]],
            ["Clienti e numeri", ["Analitiche", "Recensioni"]]
        ]);
    });

    it("menù dell'account: le pagine dell'azienda fuori dalla sidebar, uguali in ogni contesto", () => {
        expect(ACCOUNT_ENTRIES.map(e => e.label)).toEqual(["Impostazioni", "Team", "Abbonamento", "Lingue", "Assistenza"]);
        expect(ACCOUNT_ENTRIES.every(e => e.level === "azienda")).toBe(true);
        expect(ACCOUNT_ENTRIES.map(e => entryPath(e, "b", null))).toEqual([
            "/business/b/settings",
            "/business/b/settings/team",
            "/business/b/settings/abbonamento",
            "/business/b/languages",
            "/business/b/support"
        ]);
    });

    it("menù dell'account: Team e Abbonamento coi gate delle loro tab", () => {
        const visibili = (p: UserPermissions) => ACCOUNT_ENTRIES.filter(e => canSeeNavEntry(e, p, null)).map(e => e.label);
        expect(visibili(owner())).toEqual(["Impostazioni", "Team", "Abbonamento", "Lingue", "Assistenza"]);
        expect(visibili(manager())).toEqual(["Impostazioni", "Team", "Lingue", "Assistenza"]);
        expect(visibili(staff())).toEqual(["Impostazioni", "Lingue", "Assistenza"]);
    });

    it("Analitiche e Recensioni sono della sede nella sidebar unica e dentro la sede, dell'azienda fuori", () => {
        const andamento = (c: NavContext) => NAV_MODELS[c].groups.find(g => g.title === "Clienti e numeri")!.entries;
        expect(andamento("unica").slice(0, 2).map(e => e.level)).toEqual(["sede", "sede"]);
        expect(andamento("sede").map(e => e.level)).toEqual(["sede", "sede"]);
        expect(andamento("azienda").slice(0, 2).map(e => e.level)).toEqual(["azienda", "azienda"]);
    });
});

describe("entryPath — dove porta una voce", () => {
    it("le voci d'azienda stanno sotto l'azienda, quelle di sede sotto la sede", () => {
        const [overview] = NAV_MODELS.unica.groups[0].entries;
        const [scheda] = NAV_MODELS.unica.groups[1].entries;
        expect(entryPath(overview, "b", SEDE)).toBe("/business/b/overview");
        expect(entryPath(scheda, "b", SEDE)).toBe(`/business/b/locations/${SEDE}/anagrafica`);
    });

    it("Analitiche e Recensioni di sede hanno le loro rotte", () => {
        const andamento = NAV_MODELS.sede.groups.find(g => g.title === "Clienti e numeri")!.entries;
        expect(andamento.map(e => entryPath(e, "b", SEDE))).toEqual([
            `/business/b/locations/${SEDE}/analitiche`,
            `/business/b/locations/${SEDE}/recensioni`
        ]);
    });
});

describe("canSeeNavEntry — i permessi di oggi, sulla sede dentro la sede", () => {
    const voci = (c: NavContext, p: UserPermissions, activityId: string | null) =>
        NAV_MODELS[c].groups
            .flatMap(g => g.entries)
            .filter(e => canSeeNavEntry(e, p, activityId))
            .map(e => e.label);

    it("lo staff di una sede vede Operatività, non Programmazione né Analitiche", () => {
        const visibili = voci("unica", staff(), SEDE);
        expect(visibili).toEqual(expect.arrayContaining(["Servizio", "Prenotazioni", "Comande", "Storico"]));
        expect(visibili).not.toContain("Programmazione");
        expect(visibili).not.toContain("Analitiche");
    });

    it("dentro la sede i permessi valgono su quella sede", () => {
        expect(voci("sede", manager([ALTRA]), SEDE)).toEqual([]);
        expect(voci("sede", manager([SEDE]), SEDE)).toEqual([
            "Scheda",
            "Cosa vedono i clienti",
            "Programmazione",
            "Servizio",
            "Prenotazioni",
            "Comande",
            "Storico",
            "Analitiche",
            "Recensioni"
        ]);
    });

    it("Programmazione della sede: chi legge le regole della sede, non lo staff (T9b)", () => {
        expect(voci("sede", viewer(), SEDE)).toContain("Programmazione");
        expect(voci("sede", staff(), SEDE)).not.toContain("Programmazione");
        expect(voci("sede", viewer([ALTRA]), SEDE)).not.toContain("Programmazione");
        const entry = NAV_MODELS.sede.groups.flatMap(g => g.entries).find(e => e.label === "Programmazione")!;
        expect(entry.level).toBe("sede");
        expect(entry.segment).toBe("programmazione");
    });

    it("owner vede tutto, nei tre contesti", () => {
        for (const c of ["unica", "azienda", "sede"] as const) {
            const all = NAV_MODELS[c].groups.flatMap(g => g.entries);
            expect(voci(c, owner(), SEDE)).toEqual(all.map(e => e.label));
        }
    });
});

describe("isConfigurator — chi configura (§51.6)", () => {
    it("owner, admin e chi gestisce una sede", () => {
        expect(isConfigurator(owner())).toBe(true);
        expect(isConfigurator(perms("admin", TUTTI))).toBe(true);
        expect(isConfigurator(manager())).toBe(true);
    });

    it("staff e viewer no", () => {
        expect(isConfigurator(staff())).toBe(false);
        expect(isConfigurator(viewer())).toBe(false);
    });
});

describe("sedeLandingSegment — entrando in una sede", () => {
    it("chi configura atterra sulla Scheda", () => {
        expect(sedeLandingSegment(owner(), pro, SEDE)).toBe("anagrafica");
        expect(sedeLandingSegment(manager(), pro, SEDE)).toBe("anagrafica");
    });

    it("staff e viewer: la prima voce di Operatività che possono usare", () => {
        expect(sedeLandingSegment(staff(), pro, SEDE)).toBe("servizio");
        expect(sedeLandingSegment(viewer(), pro, SEDE)).toBe("servizio");
    });

    it("col piano Base Servizio ha solo modi col lucchetto: la Sala della Scheda (SV3)", () => {
        expect(sedeLandingSegment(staff(), base, SEDE)).toBe("sala");
        expect(sedeLandingSegment(viewer(), base, SEDE)).toBe("sala");
    });

    it("senza tavoli Servizio non si usa: Prenotazioni, poi Comande", () => {
        const p = perms("staff", ["activity.read", "orders.read", "reservations.read"], [SEDE]);
        expect(sedeLandingSegment(p, pro, SEDE)).toBe("prenotazioni");
        const q = perms("staff", ["activity.read", "orders.read"], [SEDE]);
        expect(sedeLandingSegment(q, pro, SEDE)).toBe("comande");
    });

    it("nessuna voce di Operatività usabile: la Scheda", () => {
        const p = perms("staff", ["activity.read", "orders.read"], [SEDE]);
        expect(sedeLandingSegment(p, base, SEDE)).toBe("anagrafica");
        expect(sedeLandingSegment(perms("staff", [], [SEDE]), pro, SEDE)).toBe("anagrafica");
    });

    it("i permessi valgono su questa sede", () => {
        expect(sedeLandingSegment(manager([ALTRA]), pro, SEDE)).toBe("anagrafica");
        expect(sedeLandingSegment(staff([ALTRA]), pro, SEDE)).toBe("anagrafica");
    });
});

describe("businessHomePath — l'ingresso nell'azienda (§51.6)", () => {
    it("chi configura: la Panoramica, con una o più sedi", () => {
        expect(businessHomePath("b", owner(), pro, [SEDE])).toBe("/business/b/overview");
        expect(businessHomePath("b", owner(), pro, [SEDE, ALTRA])).toBe("/business/b/overview");
        expect(businessHomePath("b", manager(), pro, [SEDE])).toBe("/business/b/overview");
    });

    it("staff con una sede: la prima voce di Operatività", () => {
        expect(businessHomePath("b", staff(), pro, [SEDE])).toBe(`/business/b/locations/${SEDE}/servizio`);
        expect(businessHomePath("b", viewer(), base, [SEDE])).toBe(`/business/b/locations/${SEDE}/sala`);
    });

    it("staff con più sedi: Sedi, per scegliere il locale", () => {
        expect(businessHomePath("b", staff([SEDE, ALTRA]), pro, [SEDE, ALTRA])).toBe("/business/b/locations");
    });

    it("nessuna sede leggibile: la Panoramica", () => {
        expect(businessHomePath("b", staff([]), pro, [])).toBe("/business/b/overview");
    });
});

describe("switchSedePath — cambiare sede resta sulla stessa pagina (§51.7)", () => {
    it("Comande di A → Comande di B", () => {
        expect(switchSedePath("comande", "b", ALTRA, owner(), pro)).toBe(`/business/b/locations/${ALTRA}/comande`);
    });

    it("le pagine della Scheda restano la stessa pagina", () => {
        expect(switchSedePath("orari", "b", ALTRA, owner(), pro)).toBe(`/business/b/locations/${ALTRA}/orari`);
    });

    it("pagina non usabile nella sede nuova: si atterra come entrando", () => {
        // Comande col piano base ha il lucchetto: il manager atterra sulla
        // Scheda, lo staff sulla prima voce di Operatività che può usare.
        const p = perms("manager", PERMESSI_DI_SEDE.manager, [SEDE, ALTRA]);
        expect(switchSedePath("comande", "b", ALTRA, p, base)).toBe(`/business/b/locations/${ALTRA}/anagrafica`);
        expect(switchSedePath("comande", "b", ALTRA, staff([SEDE, ALTRA]), base)).toBe(
            `/business/b/locations/${ALTRA}/sala`
        );
    });

    it("segmento sconosciuto: si atterra come entrando", () => {
        expect(switchSedePath(null, "b", ALTRA, staff([SEDE, ALTRA]), pro)).toBe(`/business/b/locations/${ALTRA}/servizio`);
    });
});

describe("navEntryForSedeSegment — la voce accesa per un segmento di sede", () => {
    it("le sei pagine della Scheda accendono la Scheda", () => {
        for (const s of ["anagrafica", "orari", "ordini-al-tavolo", "prenotazioni-online", "sala", "pubblicazione"]) {
            expect(navEntryForSedeSegment(s)?.key).toBe("anagrafica");
        }
    });

    it("le rotte di Andamento sono voci di sede", () => {
        expect(navEntryForSedeSegment("analitiche")?.key).toBe("analitiche");
        expect(navEntryForSedeSegment("recensioni")?.key).toBe("recensioni");
        expect(navEntryForSedeSegment("boh")).toBeNull();
    });
});
