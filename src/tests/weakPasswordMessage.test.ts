import { describe, expect, it } from "vitest";
import { AuthWeakPasswordError, AuthApiError } from "@supabase/supabase-js";
import { weakPasswordMessage } from "@utils/validatePassword";

// Con «password trapelate» acceso Supabase rifiuta password che il client
// accetta (es. `Test_1234`): il messaggio deve dire il motivo vero, non
// «almeno 8 caratteri».

describe("weakPasswordMessage", () => {
    it("password trapelata: lo dice", () => {
        const err = new AuthWeakPasswordError("Password is known to be weak and easy to guess, please choose a different one.", 422, ["pwned"]);
        expect(weakPasswordMessage(err)).toMatch(/fughe di dati/);
    });

    it("trapelata anche senza reasons, dal messaggio", () => {
        const err = new AuthApiError("Password is known to be weak and easy to guess, please choose a different one.", 422, "weak_password");
        expect(weakPasswordMessage(err)).toMatch(/fughe di dati/);
    });

    it("lunghezza e caratteri", () => {
        expect(weakPasswordMessage(new AuthWeakPasswordError("Password should be at least 8 characters.", 422, ["length"]))).toMatch(/almeno 8 caratteri/);
        expect(weakPasswordMessage(new AuthWeakPasswordError("Password should contain...", 422, ["characters"]))).toMatch(/minuscole, maiuscole e numeri/);
    });

    it("altri errori: null", () => {
        expect(weakPasswordMessage(new AuthApiError("User already registered", 422, "user_already_exists"))).toBeNull();
        expect(weakPasswordMessage(new Error("Failed to fetch"))).toBeNull();
        expect(weakPasswordMessage(null)).toBeNull();
    });
});
