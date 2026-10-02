import { describe, expect, it } from "vitest";
import {
    buildClaudeRequest,
    claudeCostUsd,
    CRM_AI_ROLES,
    CRM_AI_ROLE_LABEL,
    isPricedModel,
    parseClaudeResponse,
    spendAlertMessage,
    spendShare
} from "./crmAi";

describe("claudeCostUsd", () => {
    it("Sonnet 5.5: input, output e cache ai prezzi del listino", () => {
        // 10.000 × 2 + 1.000 × 10 + 6.000 × 0,2 + 2.000 × 2,5 = 36.200 milionesimi
        expect(
            claudeCostUsd("claude-sonnet-5-5", {
                inputTokens: 10_000,
                outputTokens: 1_000,
                cacheReadTokens: 6_000,
                cacheWriteTokens: 2_000
            })
        ).toBe(0.0362);
    });

    it("Opus 5.5 costa il doppio di Sonnet su input e output", () => {
        const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
        expect(claudeCostUsd("claude-opus-5-5", usage)).toBe(24);
        expect(claudeCostUsd("claude-sonnet-5-5", usage)).toBe(12);
    });

    it("modello senza prezzo: null, e non è sceglibile", () => {
        expect(
            claudeCostUsd("claude-sconosciuto", { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })
        ).toBeNull();
        expect(isPricedModel("claude-sconosciuto")).toBe(false);
        expect(isPricedModel("toString")).toBe(false);
        expect(isPricedModel("claude-opus-5-5")).toBe(true);
    });
});

describe("buildClaudeRequest", () => {
    it("cache sull'ultimo blocco di sistema, blocchi vuoti tolti", () => {
        expect(
            buildClaudeRequest({
                model: "claude-sonnet-5-5",
                system: ["Regole del brand", " ", "Contesto del lead"],
                messages: [{ role: "user", content: "Ciao" }],
                maxTokens: 300
            })
        ).toEqual({
            model: "claude-sonnet-5-5",
            max_tokens: 300,
            system: [
                { type: "text", text: "Regole del brand" },
                { type: "text", text: "Contesto del lead", cache_control: { type: "ephemeral" } }
            ],
            messages: [{ role: "user", content: "Ciao" }]
        });
    });

    it("senza sistema e senza cache", () => {
        const body = buildClaudeRequest({
            model: "m",
            system: [],
            messages: [{ role: "user", content: "x" }],
            maxTokens: 5,
            cacheSystem: false
        });
        expect(body).not.toHaveProperty("system");
        expect(
            buildClaudeRequest({ model: "m", system: ["a"], messages: [], maxTokens: 5, cacheSystem: false }).system
        ).toEqual([{ type: "text", text: "a" }]);
    });
});

describe("parseClaudeResponse", () => {
    it("testo dei blocchi text, consumo con la cache", () => {
        expect(
            parseClaudeResponse({
                id: "msg_1",
                stop_reason: "end_turn",
                content: [
                    { type: "thinking", thinking: "..." },
                    { type: "text", text: "Ciao " },
                    { type: "text", text: "Mario" }
                ],
                usage: {
                    input_tokens: 12,
                    output_tokens: 3,
                    cache_read_input_tokens: 500,
                    cache_creation_input_tokens: 0
                }
            })
        ).toEqual({
            id: "msg_1",
            text: "Ciao Mario",
            stopReason: "end_turn",
            usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 500, cacheWriteTokens: 0 }
        });
    });

    it("risposta malformata: vuota, nessuna eccezione", () => {
        expect(parseClaudeResponse(null)).toEqual({
            id: null,
            text: "",
            stopReason: null,
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
        });
        expect(parseClaudeResponse({ content: "x", usage: { input_tokens: -4, output_tokens: "3" } }).usage).toEqual({
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0
        });
    });
});

describe("avvisi di spesa", () => {
    const spend = { dayUsd: 8.5, monthUsd: 41.237, dayCap: 10, monthCap: 100 };

    it("80% del giorno e del mese", () => {
        expect(spendAlertMessage("day_80", spend)).toBe(
            "<b>Spesa AI all'80% del tetto di oggi</b>\n8,50 $ su 10,00 $. Al 100% gli agenti si fermano."
        );
        expect(spendAlertMessage("month_80", spend)).toContain("41,24 $ su 100,00 $");
    });

    it("tetto raggiunto: agenti fermi e dove ripartire", () => {
        expect(spendAlertMessage("day_cap", spend)).toMatch(/^<b>Agenti fermi: tetto di spesa di oggi raggiunto<\/b>/);
        expect(spendAlertMessage("month_cap", spend)).toContain("Per ripartire: /admin, Agenti.");
    });

    it("quota del tetto tra 0 e 1", () => {
        expect(spendShare(5, 10)).toBe(0.5);
        expect(spendShare(15, 10)).toBe(1);
        expect(spendShare(-1, 10)).toBe(0);
        expect(spendShare(1, 0)).toBe(1);
    });
});

it("ogni ruolo ha la sua etichetta", () => {
    expect(CRM_AI_ROLES.map(role => CRM_AI_ROLE_LABEL[role])).toEqual([
        "Conversazione",
        "Revisore",
        "Decisioni sensibili",
        "Gea"
    ]);
});
