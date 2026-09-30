import { describe, expect, it } from "vitest";
import { orderStatusBadge } from "@/pages/Dashboard/Orders/orderStatusBadge";

describe("orderStatusBadge", () => {
    it("dà alla comanda il singolare delle colonne della board", () => {
        expect(orderStatusBadge("submitted").label).toBe("Nuova");
        expect(orderStatusBadge("acknowledged").label).toBe("In lavorazione");
        expect(orderStatusBadge("ready").label).toBe("Pronta");
    });

    it("chiude con gli stessi nomi dei segmenti dello Storico", () => {
        expect(orderStatusBadge("delivered").label).toBe("Servita");
        expect(orderStatusBadge("cancelled").label).toBe("Annullata");
    });

    it("usa i toni dei pallini delle colonne", () => {
        expect(orderStatusBadge("submitted").variant).toBe("neutral");
        expect(orderStatusBadge("acknowledged").variant).toBe("warning");
        expect(orderStatusBadge("ready").variant).toBe("success");
    });
});
