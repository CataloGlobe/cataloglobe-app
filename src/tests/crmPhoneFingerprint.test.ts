import { describe, expect, it } from "vitest";
import { phoneFingerprint } from "@/utils/crm/phoneFingerprint";

// ⚠️ SYNC: lo stesso caso noto lo controlla la migration 20261002155000 su
// `public.crm_phone_fingerprint`. Se cambia la formula da una parte sola, uno
// dei due si ferma.
const KNOWN_PHONE = "+393331234567";
const KNOWN_FINGERPRINT = "78f00e1ca317fb2af02c89b17b8b07382ff70336aba0997ad1f3ef3645b4e682";

describe("phoneFingerprint", () => {
    it("dà l'impronta attesa per il caso noto, come il database", async () => {
        expect(await phoneFingerprint(KNOWN_PHONE)).toBe(KNOWN_FINGERPRINT);
    });

    it("è sha256 esadecimale minuscolo, 64 caratteri", async () => {
        expect(await phoneFingerprint("+390212345678")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("dipende dal testo esatto: senza + è un'altra impronta", async () => {
        expect(await phoneFingerprint("393331234567")).not.toBe(KNOWN_FINGERPRINT);
    });
});
