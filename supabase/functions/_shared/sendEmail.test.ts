import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("npm:resend@4", () => ({
    Resend: class {
        emails = { send: (...args: unknown[]) => send(...args) };
    }
}));

import { safeErrorFields, sendEmail } from "./sendEmail.ts";

const mail = { to: "mario.rossi@example.com", subject: "Nuovo contatto", html: "<p>Mario Rossi, 345 155 9558</p>", text: "Mario Rossi, 345 155 9558" };

describe("safeErrorFields", () => {
    it("tiene solo name, message e statusCode", () => {
        const err = { name: "validation_error", message: "Invalid `to` field", statusCode: 422, to: mail.to, html: mail.html };
        expect(safeErrorFields(err)).toEqual({ name: "validation_error", message: "Invalid `to` field", statusCode: 422 });
    });

    it("regge valori non oggetto", () => {
        expect(safeErrorFields("boom")).toEqual({ name: null, message: "boom", statusCode: null });
        expect(safeErrorFields(null)).toEqual({ name: null, message: null, statusCode: null });
    });
});

describe("sendEmail: log degli errori senza dati dell'email", () => {
    let logged: unknown[][];

    beforeEach(() => {
        logged = [];
        vi.stubGlobal("Deno", { env: { get: (k: string) => (k === "RESEND_API_KEY" ? "re_test" : undefined) } });
        vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
            logged.push(args);
        });
        send.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    const loggedText = () => JSON.stringify(logged);

    it("errore restituito da Resend", async () => {
        send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "bad", statusCode: 422, to: mail.to, html: mail.html } });
        await sendEmail(mail);
        expect(logged).toHaveLength(1);
        expect(loggedText()).not.toContain(mail.to);
        expect(loggedText()).not.toContain("Mario Rossi");
        expect(loggedText()).toContain("validation_error");
    });

    it("eccezione lanciata dall'SDK", async () => {
        const thrown = Object.assign(new Error("network down"), { request: { to: mail.to, text: mail.text } });
        send.mockRejectedValue(thrown);
        await expect(sendEmail(mail)).resolves.toBeUndefined();
        expect(loggedText()).not.toContain(mail.to);
        expect(loggedText()).not.toContain("Mario Rossi");
        expect(loggedText()).toContain("network down");
    });
});
