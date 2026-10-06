import { describe, expect, it } from "vitest";
import { GEA_TEXT, buildUnderstandRequest, parseUnderstanding, type GeaRead } from "./crmGea.ts";
import { answerReads, writeText, type GeaDeps } from "./crmGeaReads.ts";

// Lunedì 5 ottobre 2026, 15:00 di Roma
const NOW = new Date("2026-10-05T13:00:00Z");
const TEAM = [
    { user_id: "u-alex", display_name: "Alessandro" },
    { user_id: "u-lor", display_name: "Lorenzo" }
];

const VENUES = [
    { id: "v-roma", name: "Bar Roma", city: "Milano", stage: "in_conversazione", assigned_to: "u-alex" },
    { id: "v-luna", name: "Bar Luna", city: "Monza", stage: "nuovo", assigned_to: null }
];

/** Database finto: registra ogni chiamata; le funzioni in `missing` non esistono ancora. */
function fakeDeps(opts: { answer?: string; missing?: string[] } = {}) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const prompts: string[] = [];
    const deps: GeaDeps = {
        team: TEAM,
        rpc: async (fn, args = {}) => {
            calls.push({ fn, args });
            if (opts.missing?.includes(fn)) throw Object.assign(new Error("not found"), { code: "PGRST202" });
            switch (fn) {
                case "crm_gea_find_venues": {
                    const q = String(args.p_query).toLowerCase();
                    return VENUES.filter(v => v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q));
                }
                case "crm_gea_venue_card":
                    return { name: "Bar Roma", stage: "in_conversazione" };
                case "crm_gea_venue_chat":
                    return { venue: "Bar Roma", messages: [{ direction: "in", text: "quanto costa?" }] };
                case "crm_gea_agenda":
                    return [
                        { starts_at: "2026-09-29T08:00:00Z", venue: "Bar Roma", caller: "Lorenzo" },
                        { starts_at: "2026-09-30T08:00:00Z", venue: "Bar Luna", caller: "Alessandro" }
                    ];
                case "crm_gea_pending_drafts":
                    return [{ venue: "Bar Roma", kind: "reply" }];
                case "crm_ai_spend":
                    return [{ r_day_usd: 0.42, r_day_cap: 5, r_month_usd: 31, r_month_cap: 100 }];
                default:
                    return [];
            }
        },
        callModel: async request => {
            prompts.push(request.messages[0].content);
            return { ok: true, text: opts.answer ?? "Risposta.", costUsd: 0.01 };
        }
    };
    return { deps, calls, prompts };
}

/** Il modello finto «capisce» la domanda: qui c'è il percorso atteso. */
function understood(json: string): GeaRead[] {
    const u = parseUnderstanding(json);
    if (!("intent" in u) || u.intent !== "question") throw new Error(`atteso question: ${JSON.stringify(u)}`);
    return u.reads;
}

const ask = (deps: GeaDeps, question: string, reads: GeaRead[]) =>
    answerReads(deps, { question, reads, now: NOW, askerName: "Alessandro" });

describe("domande vere di Alex, con modello finto", () => {
    it("«Com'è messo Bar Roma e cosa ha scritto?»: scheda e chat, due letture, una fonte", async () => {
        const { deps, calls } = fakeDeps({ answer: "Bar Roma è in conversazione: ha chiesto il prezzo." });
        const out = await ask(
            deps,
            "Com'è messo Bar Roma e cosa ha scritto?",
            understood('{"intent":"question","reads":[{"tool":"venue_card","venue":"Bar Roma"},{"tool":"venue_chat","venue":"Bar Roma"}]}')
        );
        expect(calls.map(c => c.fn)).toEqual(["crm_gea_find_venues", "crm_gea_venue_card", "crm_gea_find_venues", "crm_gea_venue_chat"]);
        expect(out.reply).toContain("Fonte: CRM, scheda del locale (Bar Roma), chat del locale (Bar Roma), letta alle 15:00.");
        expect(out.tool).toBe("venue_card__venue_chat");
        expect(out.tool).toMatch(/^[a-z_]{1,40}$/);
    });

    it("«Quante bozze aspettano e quanto abbiamo speso oggi?»: bozze e spesa", async () => {
        const { deps, calls, prompts } = fakeDeps();
        const out = await ask(deps, "Quante bozze aspettano e quanto abbiamo speso oggi?", understood('{"intent":"question","reads":[{"tool":"drafts"},{"tool":"spend"}]}'));
        expect(calls.map(c => c.fn)).toEqual(["crm_gea_pending_drafts", "crm_ai_spend"]);
        expect(prompts[0]).toContain('<dati strumento="drafts">');
        expect(prompts[0]).toContain('<dati strumento="spend">');
        expect(out.reply).toContain("bozze in attesa, spesa AI");
    });

    it("«Che telefonate ha fatto Lorenzo la settimana scorsa?»: agenda indietro di 7 giorni, solo Lorenzo", async () => {
        const { deps, calls, prompts } = fakeDeps();
        const out = await ask(
            deps,
            "Che telefonate ha fatto Lorenzo la settimana scorsa?",
            understood('{"intent":"question","reads":[{"tool":"agenda","days":7,"offset":-7,"person":"lorenzo"}]}')
        );
        expect(calls[0].args).toEqual({ p_from: "2026-09-27T22:00:00.000Z", p_to: "2026-10-04T22:00:00.000Z" });
        expect(prompts[0]).toContain("Bar Roma");
        expect(prompts[0]).not.toContain("Bar Luna");
        expect(out.reply).toContain("agenda delle telefonate (da 7 giorni fa, per 7 giorni, Lorenzo)");
    });

    it("persona che non c'è: tutte le telefonate, con la nota", async () => {
        const { deps, prompts } = fakeDeps();
        await ask(deps, "E Marco?", understood('{"intent":"question","reads":[{"tool":"agenda","days":1,"person":"Marco"}]}'));
        expect(prompts[0]).toContain("Non trovo «Marco» nel team");
        expect(prompts[0]).toContain("Bar Luna");
    });

    it("«Cosa vuol dire In prova 3 di 5?»: la guida, senza database", async () => {
        const { deps, calls, prompts } = fakeDeps();
        const out = await ask(deps, "Cosa vuol dire In prova 3 di 5?", understood('{"intent":"question","reads":[{"tool":"guide"}]}'));
        expect(calls).toEqual([]);
        expect(prompts[0]).toContain('<dati strumento="guide">');
        expect(prompts[0]).toContain("Inviala così");
        expect(out.reply).toContain("Fonte: guida del CRM, letta alle 15:00.");
    });

    it("locale che non esiste: risponde senza chiamare il modello", async () => {
        const { deps, prompts } = fakeDeps();
        const out = await ask(deps, "Com'è messo Bar Rossi?", understood('{"intent":"question","reads":[{"tool":"venue_card","venue":"Bar Rossi"}]}'));
        expect(out.reply).toContain("Non trovo nessun locale");
        expect(prompts).toEqual([]);
    });

    it("«Bar» è ambiguo: chiede quale", async () => {
        const { deps } = fakeDeps();
        const out = await ask(deps, "Com'è messo Bar?", understood('{"intent":"question","reads":[{"tool":"venue_card","venue":"Bar"}]}'));
        expect(out.reply).toContain("Bar Roma");
        expect(out.reply).toContain("Bar Luna");
    });

    it("migrazione non ancora applicata: le letture nuove lo dicono, le altre rispondono", async () => {
        const only = fakeDeps({ missing: ["crm_gea_pending_drafts"] });
        const a = await ask(only.deps, "Bozze?", understood('{"intent":"question","reads":[{"tool":"drafts"}]}'));
        expect(a.reply).toBe(GEA_TEXT.notReadyYet);
        expect(only.prompts).toEqual([]);

        const mixed = fakeDeps({ missing: ["crm_gea_pending_drafts"] });
        const b = await ask(mixed.deps, "Bozze e spesa?", understood('{"intent":"question","reads":[{"tool":"drafts"},{"tool":"spend"}]}'));
        expect(b.reply).toContain("spesa AI");
        expect(b.reply).toContain(GEA_TEXT.notReadyYet);
        expect(b.error).toBe("missing_function");
    });

    it("un errore vero del database non viene nascosto", async () => {
        const { deps } = fakeDeps();
        deps.rpc = async () => {
            throw Object.assign(new Error("boom"), { code: "57014" });
        };
        await expect(ask(deps, "Pipeline?", [{ tool: "pipeline" }])).rejects.toThrow("boom");
    });
});

describe("scrivere un testo: proposto, mai mandato", () => {
    it("«Scrivimi un messaggio per Bar Roma per proporre la telefonata»", async () => {
        const { deps, calls, prompts } = fakeDeps({ answer: "Ciao! Ti va una telefonata di 10 minuti domani?" });
        const u = parseUnderstanding('{"intent":"write","brief":"proporre la telefonata","venue":"Bar Roma"}');
        if (!("intent" in u) || u.intent !== "write") throw new Error("atteso write");
        const out = await writeText(deps, { brief: u.brief, venue: u.venue, now: NOW, askerName: "Alessandro", brandRules: "Dai del tu." });
        expect(calls.map(c => c.fn)).toEqual(["crm_gea_find_venues", "crm_gea_venue_card"]);
        expect(prompts[0]).toContain("<locale>");
        expect(out.reply).toBe(`Ciao! Ti va una telefonata di 10 minuti domani?\n\n${GEA_TEXT.writeNote}`);
        // Nessuna funzione che scrive o manda: solo letture.
        expect(calls.every(c => c.fn.startsWith("crm_gea_find") || c.fn === "crm_gea_venue_card")).toBe(true);
    });
});

describe("memoria corta", () => {
    it("gli scambi precedenti entrano come dato, accorciati, al massimo 3", () => {
        const req = buildUnderstandRequest({
            text: "e domani?",
            askerName: "Alessandro",
            teamNames: ["Alessandro", "Lorenzo"],
            now: NOW,
            history: [
                { asked: "uno", replied: "a" },
                { asked: "che telefonate ho oggi?", replied: "Due: Bar Roma e Bar Luna." },
                { asked: "tre", replied: "c" },
                { asked: "quattro", replied: "x".repeat(900) }
            ]
        });
        const content = req.messages[0].content;
        expect(content).toContain("<conversazione_precedente>");
        expect(content).not.toContain("Alessandro: uno");
        expect(content).toContain("Alessandro: che telefonate ho oggi?");
        expect(content).not.toContain("x".repeat(501));
        expect(content.indexOf("</conversazione_precedente>")).toBeLessThan(content.indexOf("<messaggio>"));
    });

    it("senza memoria il prompt è quello di prima", () => {
        const req = buildUnderstandRequest({ text: "ciao", askerName: "Lorenzo", teamNames: [], now: NOW });
        expect(req.messages[0].content).not.toContain("conversazione_precedente");
    });
});
