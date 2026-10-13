import type { Page } from "@playwright/test";
import { TENANT_ID } from "./reservationsStub";
import { stubRest, type RestStub, type Row, type Tables } from "./restStub";
import { appearanceTables, freezeClock, sediOf } from "./appearanceStub";

/**
 * Dati finti per l'e2e di Recensioni (lotto `ds-5-coda`, P0).
 *
 * Recensioni e sedi rispondono da qui; permessi, azienda e sidebar veri.
 * Orologio fermo a mercoledì 23/09/2026 12:00 di Roma (`appearanceStub`).
 *
 * | Recensione | Voto | Sede | Quando |
 * |---|---|---|---|
 * | «Pizza ottima e2e…» | 5 | Centro | 22/09 (ieri) |
 * | «Servizio lento e2e…» | 2 | Porto | 20/09 |
 * | (nessun commento) | 4 | Centro | 10/09 |
 * | «Tiramisù da provare e2e» | 5 | Porto | 01/08 |
 * | «Freddo e2e» | 1 | Centro | 05/07 |
 *
 * Solo Centro ha il link per le recensioni di Google: le sue 4-5 stelle sono
 * «Invitata su Google», quelle di Porto no.
 *
 * Tutte `approved`. Con `legacyStatuses` se ne aggiungono tre con gli stati
 * della vecchia moderazione: dal feedback privato (R1) la pagina non li legge
 * più, e le tratta come tutte le altre.
 *
 * | Recensione | Voto | Sede | Quando | Stato (ignorato) |
 * |---|---|---|---|---|
 * | «Cameriere scortese e2e: …» (lungo, > 200 caratteri) | 2 | Porto | 16/09 (7 giorni fa) | in attesa |
 * | «Carbonara perfetta e2e» | 5 | Centro | 21/09 | in attesa |
 * | «Prova spam e2e» | 1 | Centro | 15/09 | nascosta |
 */

export { TENANT_ID };

const uuid = (n: number) => `e2e5e000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const REVIEW = {
    pizza: uuid(1),
    lento: uuid(2),
    muto: uuid(3),
    tiramisu: uuid(4),
    freddo: uuid(5),
    scortese: uuid(6),
    carbonara: uuid(7),
    spam: uuid(8)
} as const;
export const { SEDE } = sediOf("e2e5e000");

type Status = "pending" | "approved" | "hidden";

function review(
    id: string,
    activityId: string,
    rating: number,
    comment: string | null,
    createdAt: string,
    status: Status = "approved"
): Row {
    return {
        id,
        tenant_id: TENANT_ID,
        activity_id: activityId,
        rating,
        rating_category: rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative",
        comment,
        source: "public_form",
        status,
        session_id: null,
        created_at: createdAt
    };
}

export function makeTables(): Tables {
    const sedi = appearanceTables("e2e5e000", []);
    return {
        reviews: [
            review(REVIEW.pizza, SEDE.centro, 5, "Pizza ottima e2e, torneremo.", "2026-09-22T19:30:00.000Z"),
            review(REVIEW.lento, SEDE.porto, 2, "Servizio lento e2e, un'ora per il secondo.", "2026-09-20T20:00:00.000Z"),
            review(REVIEW.muto, SEDE.centro, 4, null, "2026-09-10T12:00:00.000Z"),
            review(REVIEW.tiramisu, SEDE.porto, 5, "Tiramisù da provare e2e", "2026-08-01T12:00:00.000Z"),
            review(REVIEW.freddo, SEDE.centro, 1, "Freddo e2e", "2026-07-05T12:00:00.000Z")
        ],
        // Centro ha il link di Google, Porto no (D154: chi è stato invitato).
        activities: sedi.activities.map(a =>
            a.id === SEDE.centro ? { ...a, google_review_url: "https://example.com/recensioni-centro" } : a
        )
    };
}

export type { WriteCall, WriteHandler } from "./restStub";
export type RecensioniStub = RestStub & { tables: Tables };

/** Tre recensioni con gli stati della vecchia moderazione: due in attesa, una nascosta. */
export function legacyStatusReviews(): Row[] {
    return [
        // Lungo di proposito (≥ 200 caratteri): deve andare a capo a tutta
        // larghezza anche a 375, non in una colonna accanto al voto (giro visivo del 30/09).
        review(
            REVIEW.scortese,
            SEDE.porto,
            2,
            "Cameriere scortese e2e: abbiamo aspettato venti minuti per ordinare, poi ci ha portato il piatto " +
                "sbagliato e quando l'abbiamo fatto notare ha risposto male davanti a tutti. Peccato, la cucina era buona.",
            "2026-09-16T10:00:00.000Z",
            "pending"
        ),
        review(REVIEW.carbonara, SEDE.centro, 5, "Carbonara perfetta e2e", "2026-09-21T19:00:00.000Z", "pending"),
        review(REVIEW.spam, SEDE.centro, 1, "Prova spam e2e", "2026-09-15T10:00:00.000Z", "hidden")
    ];
}

export async function stubRecensioni(
    page: Page,
    options: { empty?: boolean; legacyStatuses?: boolean } = {}
): Promise<RecensioniStub> {
    const tables = makeTables();
    if (options.empty) tables.reviews = [];
    if (options.legacyStatuses) tables.reviews = [...tables.reviews, ...legacyStatusReviews()];
    const stub = await stubRest(page, {
        tables,
        enrich: (table, rows) =>
            table === "reviews" ? [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : rows
    });
    await freezeClock(page);
    return Object.assign(stub, { tables });
}
