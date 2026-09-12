import { describe, it, expect } from "vitest";
import {
    reminderState,
    reminderErrorKind,
    reminderFailureReason,
    lastReminderOpportunity,
    RESERVATION_TIMEZONE,
    type ReminderStatusInput
} from "@/pages/Dashboard/Reservations/reminderStatus";

// I cinque casi dello stato promemoria. Il punto della suite non è la
// copertura: è che ognuno dei cinque dica una cosa DIVERSA, perché il modo di
// sbagliare qui è collassarne due in uno — tipicamente nascondere
// "rivendicato ma non consegnato" sotto "inviato", che è esattamente il caso
// che il 09/09 non sapevamo vedere.

const base: ReminderStatusInput = {
    status: "confirmed",
    reservation_date: "2026-09-10",
    reminder_sent_at: null,
    reminder_failed_at: null
};

// Prima dell'ultima occasione utile (le 20:00 del 09/09).
const beforeWindow = new Date(2026, 8, 9, 17, 0, 0);
// Dopo.
const afterWindow = new Date(2026, 8, 9, 21, 0, 0);

describe("reminderState", () => {
    it("inviato: sent valorizzato, nessun fallimento", () => {
        expect(
            reminderState(
                { ...base, reminder_sent_at: "2026-09-09T16:00:00Z" },
                { now: afterWindow }
            )
        ).toBe("sent");
    });

    it("rivendicato ma non consegnato: entrambi valorizzati", () => {
        // Non deve leggersi come "inviato": l'email non è mai arrivata, e
        // nessuna passata successiva la ritenterà.
        expect(
            reminderState(
                {
                    ...base,
                    reminder_sent_at: "2026-09-09T16:00:00Z",
                    reminder_failed_at: "2026-09-09T16:00:02Z"
                },
                { now: afterWindow }
            )
        ).toBe("claimed_not_delivered");
    });

    it("non inviato: solo il fallimento", () => {
        expect(
            reminderState(
                { ...base, reminder_failed_at: "2026-09-09T16:00:06Z" },
                { now: afterWindow }
            )
        ).toBe("failed");
    });

    it("in attesa: candidata e finestra non ancora passata", () => {
        expect(reminderState(base, { now: beforeWindow })).toBe("pending");
    });

    it("in attesa anche a ridosso: alle 19:30 resta la passata delle 20", () => {
        expect(reminderState(base, { now: new Date(2026, 8, 9, 19, 30) })).toBe("pending");
    });

    it("non previsto: sede con il promemoria spento", () => {
        expect(reminderState(base, { reminderEnabled: false, now: beforeWindow })).toBe(
            "not_planned_venue"
        );
    });

    it("non previsto: stato diverso da confirmed", () => {
        expect(reminderState({ ...base, status: "pending" }, { now: beforeWindow })).toBe(
            "not_planned_status"
        );
    });

    it("non previsto: finestra passata senza che fosse candidata", () => {
        expect(reminderState(base, { now: afterWindow })).toBe("not_planned_past");
    });

    it("i tre 'non previsto' restano distinti", () => {
        // Collassarli toglierebbe all'operatore il gesto: due dei tre si
        // possono cambiare (riaccendere la sede, confermare la prenotazione),
        // il terzo no.
        const states = new Set([
            reminderState(base, { reminderEnabled: false, now: beforeWindow }),
            reminderState({ ...base, status: "pending" }, { now: beforeWindow }),
            reminderState(base, { now: afterWindow })
        ]);
        expect(states.size).toBe(3);
    });

    it("la sede spenta vince sullo stato: è la ragione più a monte", () => {
        expect(
            reminderState(
                { ...base, status: "pending" },
                { reminderEnabled: false, now: beforeWindow }
            )
        ).toBe("not_planned_venue");
    });

    it("sede ignota non fa dichiarare 'non previsto'", () => {
        // `undefined` = sede non ancora caricata. Accusare sulla base di un
        // dato che non abbiamo è peggio che tacere.
        expect(reminderState(base, { reminderEnabled: undefined, now: beforeWindow })).toBe(
            "pending"
        );
    });

    it("un fallimento vince sul 'non previsto': se è stato tentato, si dice", () => {
        expect(
            reminderState(
                {
                    ...base,
                    status: "cancelled",
                    reminder_failed_at: "2026-09-09T16:00:06Z"
                },
                { reminderEnabled: false, now: afterWindow }
            )
        ).toBe("failed");
    });
});

describe("reminderErrorKind", () => {
    // La distinzione utile per chi gestisce una sala non è il codice: è se
    // deve fare qualcosa o se passa da solo.
    const transient = [
        "claim: Gateway Timeout",
        "claim: Failed to fetch",
        "invio: socket hang up",
        "claim: Service Unavailable",
        "claim: canceling statement due to statement timeout (57014)",
        "claim: deadlock detected (40P01)"
    ];

    for (const message of transient) {
        it(`passeggero: ${message}`, () => {
            expect(reminderErrorKind(message)).toBe("transient");
        });
    }

    const technical = [
        "claim: permission denied for table reservations",
        'claim: column "reminder_attempts" does not exist',
        "invio: Resend rejected the message",
        "claim: duplicate key value violates unique constraint"
    ];

    for (const message of technical) {
        it(`tecnico: ${message}`, () => {
            expect(reminderErrorKind(message)).toBe("technical");
        });
    }

    it("senza messaggio non si promette che passi da solo", () => {
        expect(reminderErrorKind(null)).toBe("technical");
        expect(reminderErrorKind("")).toBe("technical");
    });
});

describe("reminderFailureReason", () => {
    it("su 'non inviato' la distinzione passeggero/tecnico si vede", () => {
        // Lì la riga non è rivendicata: le passate successive la riprenderanno,
        // quindi "temporaneo" predice davvero come andrà a finire.
        expect(reminderFailureReason("failed", "claim: Gateway Timeout")).toBe(
            "problema tecnico temporaneo"
        );
        expect(reminderFailureReason("failed", "claim: permission denied")).toBe(
            "errore tecnico"
        );
    });

    it("su 'non consegnato' non dice MAI temporaneo", () => {
        // Il promemoria è perso comunque: "temporaneo" contraddirebbe la frase
        // accanto, che dice che non verrà ritentato.
        for (const message of [
            "claim: Gateway Timeout",
            "invio: socket hang up",
            "invio: Resend rejected the message",
            null
        ]) {
            const reason = reminderFailureReason("claimed_not_delivered", message);
            expect(reason).not.toContain("temporane");
            expect(reason).toBe("problema tecnico");
        }
    });

    it("il messaggio grezzo non entra mai nel motivo visibile", () => {
        for (const state of ["failed", "claimed_not_delivered"] as const) {
            expect(reminderFailureReason(state, "claim: Gateway Timeout")).not.toContain(
                "Gateway"
            );
        }
    });
});

describe("fuso del dominio", () => {
    it("è quello della sede, non quello del browser", () => {
        expect(RESERVATION_TIMEZONE).toBe("Europe/Rome");
    });

    it("rende le 18:00 di Roma come 18:00 anche da un altro fuso", () => {
        // 2026-09-09T16:00:00Z = 18:00 a Roma (CEST). Se la resa usasse il
        // fuso locale del test runner, questo numero cambierebbe.
        const rendered = new Intl.DateTimeFormat("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: RESERVATION_TIMEZONE
        }).format(new Date("2026-09-09T16:00:00Z"));
        expect(rendered).toBe("18:00");
    });
});

describe("lastReminderOpportunity", () => {
    it("è la sera prima alle 20", () => {
        const d = lastReminderOpportunity("2026-09-10");
        expect(d?.getFullYear()).toBe(2026);
        expect(d?.getMonth()).toBe(8);
        expect(d?.getDate()).toBe(9);
        expect(d?.getHours()).toBe(20);
    });

    it("attraversa il confine di mese", () => {
        expect(lastReminderOpportunity("2026-10-01")?.getDate()).toBe(30);
        expect(lastReminderOpportunity("2026-10-01")?.getMonth()).toBe(8);
    });

    it("una data illeggibile non fa dichiarare nulla", () => {
        expect(lastReminderOpportunity("boh")).toBeNull();
    });
});
