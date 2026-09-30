import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, freezeClock, sediOf } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Assistenza (lotto `ds-5-coda`, P0).
 *
 * Richieste, messaggi e sedi rispondono da qui (`restStub.ts`: scritture
 * intercettate, 500 per quelle non registrate); i nomi dei colleghi da una RPC
 * servita dallo stub. Permessi, azienda e sidebar restano veri.
 *
 * | Richiesta | Stato | Sede | Ultimo messaggio |
 * |---|---|---|---|
 * | Il QR del tavolo 4 e2e | In lavorazione, risposta non letta | Centro e2e | 22/09 |
 * | Fattura di agosto e2e | Aperta | — | 20/09 |
 * | Logo sfocato e2e | Chiusa | Porto e2e | 10/09 |
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5a000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const TICKET = { qr: uuid(1), fattura: uuid(2), logo: uuid(3) } as const;
export const MISSING_TICKET = uuid(999);
export const MEMBER = { anna: uuid(501), marco: uuid(502) } as const;
export const { SEDE } = sediOf("e2e5a000");

function ticket(id: string, subject: string, extra: Row = {}): Row {
    return {
        id,
        tenant_id: TENANT_ID,
        activity_id: null,
        subject,
        status: "open",
        created_by: MEMBER.anna,
        created_at: "2026-09-01T09:00:00.000Z",
        updated_at: "2026-09-01T09:00:00.000Z",
        last_message_at: "2026-09-01T09:00:00.000Z",
        closed_at: null,
        customer_last_read_at: "2026-09-01T09:00:00.000Z",
        last_message_kind: "customer",
        ...extra
    };
}

function message(id: number, ticketId: string, body: string, extra: Row = {}): Row {
    return {
        id: uuid(700 + id),
        ticket_id: ticketId,
        body,
        author_user_id: MEMBER.anna,
        author_kind: "customer",
        created_at: "2026-09-01T09:00:00.000Z",
        ...extra
    };
}

export function makeTables(): Tables {
    const sedi = appearanceTables("e2e5a000", []);
    return {
        support_tickets: [
            ticket(TICKET.qr, "Il QR del tavolo 4 e2e", {
                activity_id: SEDE.centro,
                status: "in_progress",
                created_at: "2026-09-21T08:30:00.000Z",
                last_message_at: "2026-09-22T10:15:00.000Z",
                customer_last_read_at: "2026-09-21T08:30:00.000Z",
                last_message_kind: "platform"
            }),
            ticket(TICKET.fattura, "Fattura di agosto e2e", {
                created_by: MEMBER.marco,
                created_at: "2026-09-20T14:00:00.000Z",
                last_message_at: "2026-09-20T14:00:00.000Z"
            }),
            ticket(TICKET.logo, "Logo sfocato e2e", {
                activity_id: SEDE.porto,
                status: "closed",
                closed_at: "2026-09-10T12:00:00.000Z",
                created_at: "2026-09-08T12:00:00.000Z",
                last_message_at: "2026-09-10T12:00:00.000Z"
            })
        ],
        support_messages: [
            message(1, TICKET.qr, "Il QR del tavolo 4 apre una pagina bianca.", { created_at: "2026-09-21T08:30:00.000Z" }),
            message(2, TICKET.qr, "Stiamo verificando, ti aggiorniamo entro sera.", {
                author_user_id: null,
                author_kind: "platform",
                created_at: "2026-09-22T10:15:00.000Z"
            }),
            message(3, TICKET.fattura, "Non trovo la fattura di agosto.", {
                author_user_id: MEMBER.marco,
                created_at: "2026-09-20T14:00:00.000Z"
            }),
            message(4, TICKET.logo, "Il logo sulla pagina pubblica è sfocato.", { created_at: "2026-09-08T12:00:00.000Z" })
        ],
        activities: sedi.activities
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type AssistenzaStub = RestStub & { tables: Tables };

export async function stubAssistenza(page: Page, options: { empty?: boolean } = {}): Promise<AssistenzaStub> {
    const tables = makeTables();
    if (options.empty) {
        tables.support_tickets = [];
        tables.support_messages = [];
    }
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows, params) => {
            if (table === "support_tickets") {
                const withContext = (params.get("select") ?? "").includes("activities(");
                const sorted = [...rows].sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
                if (!withContext) return sorted;
                return sorted.map(row => ({
                    ...row,
                    tenants: { name: "Azienda e2e" },
                    activities: row.activity_id
                        ? { name: tables.activities.find(a => a.id === row.activity_id)?.name ?? null }
                        : null
                }));
            }
            if (table === "support_messages") {
                return [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
            }
            return rows;
        },
        rpc: {
            get_tenant_member_names: () => [
                { user_id: MEMBER.anna, display_name: "Anna e2e" },
                { user_id: MEMBER.marco, display_name: "Marco e2e" }
            ]
        }
    });
    // La lettura segnata dal dettaglio e l'avviso al supporto non devono
    // far fallire il test che non li guarda: rispondono sempre.
    stub.onWrite("rpc.mark_support_ticket_read", () => null);
    stub.onWrite("fn.notify-support", () => ({ ok: true }));
    await freezeClock(page);
    return Object.assign(stub, { tables });
}
