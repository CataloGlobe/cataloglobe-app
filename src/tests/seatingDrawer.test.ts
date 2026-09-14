import { describe, it, expect } from "vitest";
import {
    canEditSeating,
    formatCovers,
    formatOpenFor,
    seatingDrawerActionsFor,
    seatingDrawerFor,
    walkinRowParts,
    walkinTitle
} from "@/pages/Dashboard/Reservations/seatingDrawer";

const NOW = new Date(2026, 8, 14, 21, 0);

function table(table_id: string, label: string) {
    return { table_id, label, zone_name: null, deleted_at: null };
}

function linked(reservation_id: string, customer_name: string) {
    return {
        reservation_id,
        customer_name,
        reservation_time: "20:00:00",
        party_size: 2,
        status: "seated" as const
    };
}

describe("seatingDrawerFor — quale drawer si apre", () => {
    it("con prenotazione: quello della prenotazione", () => {
        expect(seatingDrawerFor({ reservations: [linked("r1", "Rossi")] })).toBe("reservation");
    });

    it("con più prenotazioni: ancora quello della prenotazione", () => {
        expect(
            seatingDrawerFor({ reservations: [linked("r1", "Rossi"), linked("r2", "Bianchi")] })
        ).toBe("reservation");
    });

    it("senza prenotazione: quello della tavolata", () => {
        // È l'unica entità che esiste: riceve un drawer suo.
        expect(seatingDrawerFor({ reservations: [] })).toBe("seating");
    });
});

describe("seatingDrawerActionsFor — i gesti per stato e permesso", () => {
    it("aperta con permesso: concludere o annullare", () => {
        expect(seatingDrawerActionsFor({ status: "open", canManageSeatings: true })).toEqual([
            "complete",
            "undo"
        ]);
    });

    it("chiusa: nessun gesto, anche con permesso", () => {
        // Il servizio si è svolto; riaprirlo è un'operazione che non esiste.
        expect(seatingDrawerActionsFor({ status: "closed", canManageSeatings: true })).toEqual(
            []
        );
    });

    it("senza permesso: nessun gesto, in nessuno stato", () => {
        expect(seatingDrawerActionsFor({ status: "open", canManageSeatings: false })).toEqual(
            []
        );
        expect(seatingDrawerActionsFor({ status: "closed", canManageSeatings: false })).toEqual(
            []
        );
    });
});

describe("canEditSeating — tavoli e coperti", () => {
    it("solo aperta E con permesso", () => {
        expect(canEditSeating({ status: "open", canManageSeatings: true })).toBe(true);
        expect(canEditSeating({ status: "open", canManageSeatings: false })).toBe(false);
        expect(canEditSeating({ status: "closed", canManageSeatings: true })).toBe(false);
    });
});

describe("walkinTitle — i tavoli sono il nome", () => {
    it("un tavolo", () => {
        expect(walkinTitle({ tables: [table("a", "Tavolo 7")] })).toBe("Tavolo 7");
    });

    it("più tavoli, in ordine umano e senza raddoppiare la parola", () => {
        expect(
            walkinTitle({
                tables: [table("a", "Tavolo 10"), table("b", "Tavolo 2")]
            })
        ).toBe("Tavoli 2 + 10");
    });

    it("nessun tavolo: null, non un nome finto", () => {
        expect(walkinTitle({ tables: [] })).toBeNull();
    });
});

describe("walkinRowParts — la riga con e senza tavoli, con e senza coperti", () => {
    const openedAt = new Date(2026, 8, 14, 20, 15).toISOString(); // 45 min prima

    it("tavoli + coperti: tutte e tre le parti", () => {
        expect(
            walkinRowParts(
                { tables: [table("a", "7")], party_size: 4, opened_at: openedAt },
                NOW
            )
        ).toEqual({ title: "Tavolo 7", covers: "4 coperti", openFor: "da 45 min" });
    });

    it("tavoli senza coperti: i coperti mancano, non sono zero", () => {
        expect(
            walkinRowParts(
                { tables: [table("a", "7")], party_size: null, opened_at: openedAt },
                NOW
            )
        ).toEqual({ title: "Tavolo 7", covers: null, openFor: "da 45 min" });
    });

    it("senza tavoli con coperti: vive di coperti e durata", () => {
        expect(
            walkinRowParts({ tables: [], party_size: 1, opened_at: openedAt }, NOW)
        ).toEqual({ title: null, covers: "1 coperto", openFor: "da 45 min" });
    });

    it("senza tavoli né coperti: resta solo la durata, ed è giusto che sia scarna", () => {
        expect(
            walkinRowParts({ tables: [], party_size: null, opened_at: openedAt }, NOW)
        ).toEqual({ title: null, covers: null, openFor: "da 45 min" });
    });
});

describe("formatCovers / formatOpenFor", () => {
    it("singolare e plurale", () => {
        expect(formatCovers(1)).toBe("1 coperto");
        expect(formatCovers(3)).toBe("3 coperti");
        expect(formatCovers(null)).toBeNull();
    });

    it("la durata tiene sempre la forma 'da …'", () => {
        const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000).toISOString();
        expect(formatOpenFor(at(0), NOW)).toBe("da poco");
        expect(formatOpenFor(at(45), NOW)).toBe("da 45 min");
        expect(formatOpenFor(at(60), NOW)).toBe("da 1 h");
        expect(formatOpenFor(at(80), NOW)).toBe("da 1 h 20 min");
    });

    it("oltre le 24 ore conta i giorni, senza ore né minuti", () => {
        const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000).toISOString();
        expect(formatOpenFor(at(23 * 60 + 59), NOW)).toBe("da 23 h 59 min");
        expect(formatOpenFor(at(24 * 60), NOW)).toBe("da 1 giorno");
        expect(formatOpenFor(at(47 * 60), NOW)).toBe("da 1 giorno");
        expect(formatOpenFor(at(53 * 60 + 1), NOW)).toBe("da 2 giorni");
    });
});
