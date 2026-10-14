import i18n from "i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { changePublicLanguage, registerLanguageLoaders } from "@/i18n/loadLanguage";

const bundle = (lng: string, ns: string) => ({ hello: `${lng}-${ns}` });

describe("changePublicLanguage", () => {
    beforeAll(async () => {
        await i18n.init({ lng: "it", fallbackLng: "it", resources: { it: { public: { hello: "it" } } } });
    });
    afterEach(() => vi.useRealTimers());

    it("carica la lingua e poi la applica", async () => {
        registerLanguageLoaders({
            "./locales/en/common.json": async () => bundle("en", "common"),
            "./locales/en/public.json": async () => bundle("en", "public"),
            "./locales/en/errors.json": async () => bundle("en", "errors")
        });
        await changePublicLanguage("en");
        expect(i18n.language).toBe("en");
        expect(i18n.t("hello", { ns: "public" })).toBe("en-public");
    });

    it("vince l'ultima lingua chiesta", async () => {
        let release!: () => void;
        const slow = new Promise<void>(r => (release = r));
        registerLanguageLoaders({
            "./locales/fr/public.json": async () => (await slow, bundle("fr", "public")),
            "./locales/de/public.json": async () => bundle("de", "public")
        });
        const fr = changePublicLanguage("fr");
        await changePublicLanguage("de");
        release();
        await fr;
        expect(i18n.language).toBe("de");
    });

    it("se il download fallisce cambia lo stesso e riprova da solo", async () => {
        vi.useFakeTimers();
        let calls = 0;
        registerLanguageLoaders({
            "./locales/es/public.json": async () => {
                calls++;
                if (calls === 1) throw new Error("rete");
                return bundle("es", "public");
            }
        });
        await changePublicLanguage("es");
        expect(i18n.language).toBe("es");
        expect(i18n.t("hello", { ns: "public" })).toBe("it");
        await vi.advanceTimersByTimeAsync(2000);
        expect(calls).toBe(2);
        expect(i18n.t("hello", { ns: "public" })).toBe("es-public");
    });
});
