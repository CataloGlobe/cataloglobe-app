import { describe, it, expect } from "vitest";
import {
    buildNotificationEmail,
    buildTenantDeletionOwnerEmail,
    dataString,
    nextRetryDelayMinutes,
    NOTIFICATION_EMAIL_MAX_ATTEMPTS,
    type NotificationEmailBuilder
} from "./notificationEmails";

const CTX = { siteUrl: "https://app.example.it" };

describe("buildNotificationEmail", () => {
    const templates: Record<string, NotificationEmailBuilder> = {
        prova: data => {
            const name = dataString(data, "name");
            if (!name) return null;
            return { subject: `Ciao ${name}`, html: "<p>x</p>", text: "x" };
        }
    };

    it("usa il modello con quel nome", () => {
        expect(buildNotificationEmail("prova", { name: "Ada" }, CTX, templates)?.subject).toBe("Ciao Ada");
    });

    it("modello sconosciuto → null", () => {
        expect(buildNotificationEmail("nessuno", {}, CTX, templates)).toBeNull();
    });

    it("non scambia le proprietà di Object per modelli", () => {
        expect(buildNotificationEmail("toString", {}, CTX, templates)).toBeNull();
        expect(buildNotificationEmail("constructor", {}, CTX, templates)).toBeNull();
    });

    it("dati che non bastano → null dal modello", () => {
        expect(buildNotificationEmail("prova", { name: "  " }, CTX, templates)).toBeNull();
    });
});

describe("nextRetryDelayMinutes", () => {
    it("5 minuti dopo il primo errore, 30 dopo il secondo", () => {
        expect(nextRetryDelayMinutes(1)).toBe(5);
        expect(nextRetryDelayMinutes(2)).toBe(30);
    });

    it("al cap niente più tentativi", () => {
        expect(nextRetryDelayMinutes(NOTIFICATION_EMAIL_MAX_ATTEMPTS)).toBeNull();
        expect(nextRetryDelayMinutes(NOTIFICATION_EMAIL_MAX_ATTEMPTS + 1)).toBeNull();
    });
});

describe("dataString", () => {
    it("stringhe e numeri sì, il resto no", () => {
        expect(dataString({ a: "x" }, "a")).toBe("x");
        expect(dataString({ a: 7 }, "a")).toBe("7");
        expect(dataString({ a: "" }, "a")).toBeNull();
        expect(dataString({ a: null }, "a")).toBeNull();
        expect(dataString({}, "a")).toBeNull();
    });
});

describe("tenant_deletion_owner", () => {
    const base = { tenant_name: "Bar <Sole>", purge_date_label: "14/11/2026" };

    it("subito: oggetto, data e link al Workspace", () => {
        const e = buildNotificationEmail("tenant_deletion_owner", { ...base, kind: "scheduled" }, CTX);
        expect(e?.subject).toBe("«Bar <Sole>» è in eliminazione");
        expect(e?.html).toContain("Bar &lt;Sole&gt;");
        expect(e?.html).not.toContain("Bar <Sole>");
        expect(e?.html).toContain("14/11/2026");
        expect(e?.html).toContain('href="https://app.example.it/workspace"');
        expect(e?.text).toContain("https://app.example.it/workspace");
    });

    it("promemoria: quando nell'oggetto", () => {
        const e = buildTenantDeletionOwnerEmail(
            { ...base, kind: "reminder", days_left_label: "domani" },
            CTX
        );
        expect(e?.subject).toBe("«Bar <Sole>» sarà eliminata domani");
        expect(e?.text).toContain("sarà eliminata definitivamente il 14/11/2026");
    });

    it("senza URL del sito parte senza bottone", () => {
        const e = buildTenantDeletionOwnerEmail({ ...base, kind: "scheduled" }, { siteUrl: null });
        expect(e?.html).not.toContain("/workspace\"");
        expect(e?.html).not.toContain("Apri il Workspace");
        expect(e?.text).not.toContain("/workspace");
    });

    it("senza nome o data → null", () => {
        expect(buildTenantDeletionOwnerEmail({ purge_date_label: "x" }, CTX)).toBeNull();
        expect(buildTenantDeletionOwnerEmail({ tenant_name: "x" }, CTX)).toBeNull();
    });
});
