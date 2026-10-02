// =============================================================================
// crmAi — Claude per gli agenti del CRM: listino, costo, richiesta, risposta
// =============================================================================
//
// Puro, zero import: usato dalle edge (_shared/crmClaude.ts) e da /admin
// (alias `@shared/`, pagina Agenti), provato in crmAi.test.ts.
//
// Ruoli (decisione di Alex del 2026-10-01, domanda 1 della Fase 1): Sonnet 5.5
// conversa, Opus 5.5 rivede ogni messaggio e prende le decisioni sensibili
// (stop, eccezioni, appuntamenti). Il modello di ogni ruolo sta in
// crm_settings e si cambia da /admin senza rilasci; si sceglie solo tra i
// modelli di questo listino, perché senza prezzo il tetto di spesa non conta.
//
// Listino in dollari per milione di token, dalla documentazione Anthropic del
// 25/09/2026 (vault, piano della Fase 1). Scrittura in cache = 1,25 volte
// l'input (cache di 5 minuti). Al cambio dei prezzi: nuova voce o prezzo qui e
// nuova CRM_AI_PRICE_VERSION; il registro tiene i token, il costo resta
// ricalcolabile.
// =============================================================================

export const CRM_AI_PRICE_VERSION = "2026-09-25";

export const CRM_AI_ROLES = ["conversation", "reviewer", "sensitive", "gea"] as const;
export type CrmAiRole = (typeof CRM_AI_ROLES)[number];

export const CRM_AI_ROLE_LABEL: Record<CrmAiRole, string> = {
    conversation: "Conversazione",
    reviewer: "Revisore",
    sensitive: "Decisioni sensibili",
    gea: "Gea"
};

export interface ClaudePrice {
    label: string;
    /** Dollari per milione di token. */
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}

export const CLAUDE_PRICES: Record<string, ClaudePrice> = {
    "claude-sonnet-5-5": { label: "Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    "claude-opus-5-5": { label: "Opus 5.5", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    "claude-haiku-4-5": { label: "Haiku 4.5", input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }
};

export function isPricedModel(model: string): boolean {
    return Object.prototype.hasOwnProperty.call(CLAUDE_PRICES, model);
}

export interface ClaudeUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}

/** Costo in dollari, arrotondato al milionesimo (numeric(12,6)); null se il modello non ha prezzo. */
export function claudeCostUsd(model: string, usage: ClaudeUsage): number | null {
    const price = CLAUDE_PRICES[model];
    if (!price) return null;
    const micro =
        usage.inputTokens * price.input +
        usage.outputTokens * price.output +
        usage.cacheReadTokens * price.cacheRead +
        usage.cacheWriteTokens * price.cacheWrite;
    // Token × dollari per milione = milionesimi di dollaro.
    return Math.round(micro) / 1_000_000;
}

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

export interface ClaudeRequestInput {
    model: string;
    /** Regole, contesto fisso: in cache quando `cacheSystem` (default sì). */
    system: string[];
    messages: ClaudeMessage[];
    maxTokens: number;
    cacheSystem?: boolean;
}

/**
 * Corpo della Messages API. Il punto di cache va sull'ultimo blocco di
 * sistema: regole del brand e contesto fisso si pagano un decimo dal secondo
 * turno in poi.
 */
export function buildClaudeRequest(input: ClaudeRequestInput): Record<string, unknown> {
    const blocks = input.system.filter(text => text.trim().length > 0);
    const cache = input.cacheSystem !== false;
    return {
        model: input.model,
        max_tokens: input.maxTokens,
        ...(blocks.length > 0
            ? {
                  system: blocks.map((text, index) => ({
                      type: "text",
                      text,
                      ...(cache && index === blocks.length - 1 ? { cache_control: { type: "ephemeral" } } : {})
                  }))
              }
            : {}),
        messages: input.messages.map(message => ({ role: message.role, content: message.content }))
    };
}

export interface ClaudeReply {
    id: string | null;
    text: string;
    stopReason: string | null;
    usage: ClaudeUsage;
}

function count(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Testo e consumo dalla risposta; i blocchi non di testo si ignorano. */
export function parseClaudeResponse(body: unknown): ClaudeReply {
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const content = Array.isArray(data.content) ? data.content : [];
    const text = content
        .filter(
            (block): block is { type: "text"; text: string } =>
                !!block && typeof block === "object" && block.type === "text" && typeof block.text === "string"
        )
        .map(block => block.text)
        .join("")
        .trim();
    const usage = (data.usage && typeof data.usage === "object" ? data.usage : {}) as Record<string, unknown>;
    return {
        id: typeof data.id === "string" ? data.id : null,
        text,
        stopReason: typeof data.stop_reason === "string" ? data.stop_reason : null,
        usage: {
            inputTokens: count(usage.input_tokens),
            outputTokens: count(usage.output_tokens),
            cacheReadTokens: count(usage.cache_read_input_tokens),
            cacheWriteTokens: count(usage.cache_creation_input_tokens)
        }
    };
}

/** Avviso di crm_record_ai_usage da mandare al team. */
export type CrmSpendAlert = "day_80" | "month_80" | "day_cap" | "month_cap";

export interface CrmSpendSnapshot {
    dayUsd: number;
    monthUsd: number;
    dayCap: number;
    monthCap: number;
}

export function formatUsd(value: number): string {
    return `${value.toFixed(2).replace(".", ",")} $`;
}

/** Testo Telegram (HTML) dell'avviso di spesa. */
export function spendAlertMessage(alert: CrmSpendAlert, spend: CrmSpendSnapshot): string {
    const day = `${formatUsd(spend.dayUsd)} su ${formatUsd(spend.dayCap)}`;
    const month = `${formatUsd(spend.monthUsd)} su ${formatUsd(spend.monthCap)}`;
    switch (alert) {
        case "day_80":
            return `<b>Spesa AI all'80% del tetto di oggi</b>\n${day}. Al 100% gli agenti si fermano.`;
        case "month_80":
            return `<b>Spesa AI all'80% del tetto del mese</b>\n${month}. Al 100% gli agenti si fermano.`;
        case "day_cap":
            return `<b>Agenti fermi: tetto di spesa di oggi raggiunto</b>\n${day}. I lead si gestiscono a mano. Per ripartire: /admin, Agenti.`;
        case "month_cap":
            return `<b>Agenti fermi: tetto di spesa del mese raggiunto</b>\n${month}. I lead si gestiscono a mano. Per ripartire: /admin, Agenti.`;
    }
}

/** Quota del tetto, 0-1 (oltre il tetto resta 1). */
export function spendShare(spent: number, cap: number): number {
    if (!(cap > 0)) return 1;
    return Math.min(1, Math.max(0, spent / cap));
}
