import { describe, it, expect } from "vitest";
import { timingSafeEqualStr } from "./timingSafeEqual.ts";

describe("timingSafeEqualStr", () => {
    it("riconosce due stringhe identiche", () => {
        expect(timingSafeEqualStr("s3cr3t-abcdef", "s3cr3t-abcdef")).toBe(true);
    });

    it("riconosce due stringhe vuote", () => {
        expect(timingSafeEqualStr("", "")).toBe(true);
    });

    it.each([
        ["ultimo carattere diverso", "s3cr3t-abcdef", "s3cr3t-abcdeg"],
        ["primo carattere diverso", "s3cr3t-abcdef", "S3cr3t-abcdef"],
        ["prefisso corretto ma più corta", "s3cr3t-abcdef", "s3cr3t"],
        ["prefisso corretto ma più lunga", "s3cr3t", "s3cr3t-abcdef"],
        ["una vuota", "s3cr3t", ""],
        ["l'altra vuota", "", "s3cr3t"]
    ])("rifiuta: %s", (_label, a, b) => {
        expect(timingSafeEqualStr(a, b)).toBe(false);
    });

    it("è simmetrica", () => {
        expect(timingSafeEqualStr("abc", "abd")).toBe(timingSafeEqualStr("abd", "abc"));
        expect(timingSafeEqualStr("abc", "abc")).toBe(timingSafeEqualStr("abc", "abc"));
    });

    it("confronta byte UTF-8, non unità di codice", () => {
        // Due stringhe di uguale lunghezza in caratteri ma diverse in byte.
        expect(timingSafeEqualStr("caffè", "caffe")).toBe(false);
        expect(timingSafeEqualStr("caffè", "caffè")).toBe(true);
    });

    it("un prefisso corretto non è un successo parziale", () => {
        const secret = "0123456789abcdef0123456789abcdef";
        for (let i = 1; i < secret.length; i++) {
            expect(timingSafeEqualStr(secret.slice(0, i), secret)).toBe(false);
        }
        expect(timingSafeEqualStr(secret, secret)).toBe(true);
    });

    it("non esce in anticipo: il confronto scorre tutta la stringa più lunga", () => {
        // Verifica comportamentale, non temporale: una differenza in fondo e
        // una in testa devono dare lo stesso esito. Una implementazione con
        // early-exit passerebbe comunque questo test — è il motivo per cui il
        // requisito vive nel codice e nel commento, non solo qui.
        expect(timingSafeEqualStr("aaaaaaaab", "aaaaaaaaa")).toBe(false);
        expect(timingSafeEqualStr("baaaaaaaa", "aaaaaaaaa")).toBe(false);
    });
});
