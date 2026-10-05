import { describe, expect, it } from "vitest";
import {
    CRM_OBJECTION_CATEGORIES,
    CRM_OBJECTION_LABEL,
    ferdinandoAdRows,
    ferdinandoReportText,
    objectionSummary
} from "@/utils/crm/objections";
import type { CrmAppointmentWithVenue, CrmObjection, CrmVenueListItem } from "@/types/crm";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-10-05T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function objection(category: CrmObjection["category"], days: number, note: string | null = null): CrmObjection {
    return { id: `${category}-${days}`, venue_id: "v", category, note, source: "perso", created_by: null, created_at: daysAgo(days) };
}

function venue(id: string, stage: CrmVenueListItem["stage"], days: number, ad: string | null): CrmVenueListItem {
    return {
        id,
        created_at: daysAgo(days),
        stage,
        crm_leads: ad === undefined ? [] : [{ id: `l-${id}`, source: ad ? "meta_form" : "landing", received_at: daysAgo(days), ad_name: ad }]
    } as unknown as CrmVenueListItem;
}

describe("objectionSummary", () => {
    it("conta per categoria nel periodo, più frequente in cima, tre note recenti", () => {
        const rows = objectionSummary(
            [
                objection("prezzo", 1, "troppo caro"),
                objection("prezzo", 2, "costa"),
                objection("prezzo", 3, null),
                objection("prezzo", 4, "quarta"),
                objection("prezzo", 5, "quinta"),
                objection("tempo", 1, "non ho tempo"),
                objection("non_ora", 40, "vecchia")
            ],
            "30",
            NOW
        );
        expect(rows.map(r => [r.category, r.count])).toEqual([
            ["prezzo", 5],
            ["tempo", 1]
        ]);
        expect(rows[0].notes).toEqual(["troppo caro", "costa", "quarta"]);
    });
});

describe("report per Ferdinando", () => {
    it("per annuncio: lead, telefonate, prove, clienti; senza annuncio in fondo", () => {
        const venues = [
            venue("a", "cliente_pagante", 5, "Video menù"),
            venue("b", "contattato", 5, "Video menù"),
            venue("c", "in_prova", 5, "Video ordini"),
            venue("d", "nuovo", 5, null),
            venue("e", "cliente_pagante", 60, "Video menù")
        ];
        const appointments = [{ venue_id: "b", status: "confirmed" }] as CrmAppointmentWithVenue[];
        const rows = ferdinandoAdRows({ venues, appointments, period: "30", now: NOW });
        expect(rows).toEqual([
            { ad: "Video menù", leads: 2, calls: 2, trials: 1, clients: 1 },
            { ad: "Video ordini", leads: 1, calls: 1, trials: 1, clients: 0 },
            { ad: "Senza annuncio (landing, WhatsApp, a mano)", leads: 1, calls: 0, trials: 0, clients: 0 }
        ]);
        const text = ferdinandoReportText({ rows, objections: [{ category: "prezzo", count: 2, notes: [] }], period: "30" });
        expect(text).toContain("Lead: 4 · telefonate fissate: 3 · in prova o oltre: 2 · clienti paganti: 1");
        expect(text).toContain("- Video menù: 2 lead, 2 telefonate, 1 in prova, 1 cliente");
        expect(text).toContain("- Costa troppo: 2");
    });
});

describe("categorie", () => {
    it("ogni categoria ha l'etichetta ed è nel CHECK della migration", () => {
        const sql = readFileSync("supabase/migrations/20261006100000_crm_objections.sql", "utf8");
        for (const c of CRM_OBJECTION_CATEGORIES) {
            expect(CRM_OBJECTION_LABEL[c]).toBeTruthy();
            expect(sql).toContain(`'${c}'`);
        }
    });
});
