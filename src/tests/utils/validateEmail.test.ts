import { describe, expect, it } from "vitest";

import {
    extractEmailDomain,
    isDisposableEmailDomain,
    isValidEmailFormat
} from "@/utils/validateEmail";

describe("isValidEmailFormat", () => {
    it("accetta email con TLD esplicito", () => {
        expect(isValidEmailFormat("lo@gmail.com")).toBe(true);
    });

    it("rifiuta email senza TLD", () => {
        expect(isValidEmailFormat("lo@gmail")).toBe(false);
    });
});

describe("extractEmailDomain", () => {
    it("estrae il dominio normalizzato (lowercase + trim)", () => {
        expect(extractEmailDomain("Foo@ Mailinator.COM ")).toBe("mailinator.com");
    });

    it("stringa vuota se manca il dominio", () => {
        expect(extractEmailDomain("foo")).toBe("");
    });
});

describe("isDisposableEmailDomain", () => {
    const domainSet = new Set(["mailinator.com", "guerrillamail.com"]);

    it("match: dominio esatto in blacklist", () => {
        expect(isDisposableEmailDomain("test@mailinator.com", domainSet)).toBe(true);
    });

    it("no-match: dominio legittimo non in blacklist", () => {
        expect(isDisposableEmailDomain("test@gmail.com", domainSet)).toBe(false);
    });

    it("case/whitespace: match indipendente da maiuscole e spazi", () => {
        expect(isDisposableEmailDomain("Test@ Mailinator.COM ", domainSet)).toBe(true);
    });

    it("sottodominio: bloccato se il dominio genitore è in blacklist", () => {
        expect(isDisposableEmailDomain("test@sub.mailinator.com", domainSet)).toBe(true);
    });

    it("no-match: non blocca un dominio che contiene solo come sostringa una entry blacklistata", () => {
        expect(isDisposableEmailDomain("test@notmailinator.com", domainSet)).toBe(false);
    });

    it("email senza dominio → false", () => {
        expect(isDisposableEmailDomain("nodomain", domainSet)).toBe(false);
    });
});
