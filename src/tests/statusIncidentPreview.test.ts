import { describe, expect, it } from "vitest";
import { previewIncidentUpdate } from "@/utils/statusIncidentPreview";
import type { StatusIncident } from "@/services/status/statusPage";

const INCIDENT: StatusIncident = {
    id: "i1",
    title: "Menu pubblico lento",
    description: null,
    status: "investigating",
    severity: "minor",
    affected_services: ["public-menu"],
    started_at: "2026-10-05T10:05:00Z",
    resolved_at: null,
    updates: [{ timestamp: "2026-10-05T10:05:00Z", message: "Alcuni menù sono lenti.", status: "investigating" }],
    created_at: "2026-10-05T10:05:00Z",
    updated_at: "2026-10-05T10:05:00Z"
};
const NOW = new Date("2026-10-05T10:40:00Z");

describe("anteprima dell'aggiornamento", () => {
    it("col messaggio vuoto resta com'è", () => {
        expect(previewIncidentUpdate(INCIDENT, "  ", "monitoring", NOW)).toBe(INCIDENT);
    });

    it("aggiunge il messaggio in coda e cambia lo stato se scelto", () => {
        const p = previewIncidentUpdate(INCIDENT, " Tempi normali. ", "monitoring", NOW);
        expect(p.status).toBe("monitoring");
        expect(p.updates.at(-1)).toEqual({ timestamp: NOW.toISOString(), message: "Tempi normali.", status: "monitoring" });
        expect(INCIDENT.updates).toHaveLength(1);
    });

    it("stato invariato: niente stato sull'aggiornamento", () => {
        const p = previewIncidentUpdate(INCIDENT, "Ancora lento.", "", NOW);
        expect(p.status).toBe("investigating");
        expect(p.updates.at(-1)).toEqual({ timestamp: NOW.toISOString(), message: "Ancora lento." });
    });
});
