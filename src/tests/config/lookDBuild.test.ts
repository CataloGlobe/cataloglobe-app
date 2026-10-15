import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import { lookDFromEnv } from "@/styles/lookD";

/** La D si accende e si spegne da `VITE_BACKOFFICE_D`; nelle build pubbliche è sempre spenta (review di Lorenzo sulla #516). */

// Import a runtime: il tsconfig dell'app non risolve i plugin della config di Vite.
const CONFIG = "../../../vite.config";
const viteConfig = ((await import(/* @vite-ignore */ CONFIG)) as { default: (env: ConfigEnv) => UserConfig }).default;
const build = (mode: string, isSsrBuild = false) => viteConfig({ mode, command: "build", isSsrBuild });

describe("LOOK_D", () => {
    it("acceso di suo, spento con false, 0, off o no in qualunque forma", () => {
        expect(lookDFromEnv(undefined)).toBe(true);
        expect(lookDFromEnv("")).toBe(true);
        expect(lookDFromEnv("true")).toBe(true);
        for (const off of ["false", "FALSE", " False ", "0", "off", "No"]) expect(lookDFromEnv(off)).toBe(false);
    });

    it("spento nel JS delle build pubbliche: pagina pubblica, SSR e landing", () => {
        for (const config of [build("public-client"), build("landing"), build("production", true)]) {
            expect(config.define?.["import.meta.env.VITE_BACKOFFICE_D"]).toBe('"false"');
        }
    });

    it("lasciato all'ambiente nella build del back office", () => {
        expect(build("production").define?.["import.meta.env.VITE_BACKOFFICE_D"]).toBeUndefined();
    });
});
