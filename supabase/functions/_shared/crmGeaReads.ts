// =============================================================================
// crmGeaReads — Gea 2: le letture di una domanda e il testo da proporre
// =============================================================================
//
// Puro, con le dipendenze passate da fuori (database e modello): così le
// domande vere si provano con un modello finto (crmGeaReads.test.ts).
//
//   runReads       da 1 a 3 letture, ognuna una funzione SQL di sola lettura
//                  (o la guida del CRM, senza database). Una funzione che
//                  manca (migrazione non ancora applicata) non fa cadere le
//                  altre: la lettura torna `missing`.
//   answerReads    letture → risposta del modello → riga della fonte.
//   writeText      un testo proposto, mai mandato.
// =============================================================================

import {
    GEA_TEXT,
    agendaBounds,
    buildAnswerRequest,
    buildWriteRequest,
    chooseVenue,
    choosePerson,
    guideData,
    manyVenuesText,
    noVenueText,
    withSources,
    writeReplyText,
    type GeaRead,
    type GeaReadResult,
    type GeaTurn,
    type VenueMatch
} from "./crmGea.ts";

export interface GeaDeps {
    /** Chiama una funzione SQL; lancia un errore con `code` se fallisce. */
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
    /** Il modello: testo, o il motivo per cui non ha risposto. */
    callModel: (request: {
        system: string[];
        messages: { role: "user"; content: string }[];
        maxTokens: number;
    }) => Promise<{ ok: true; text: string; costUsd: number } | { ok: false; reason: string }>;
    team: { user_id: string; display_name: string }[];
}

export type ReadOutcome =
    | ({ kind: "data" } & GeaReadResult)
    | { kind: "stop"; reply: string }
    | { kind: "missing"; tool: GeaRead["tool"] };

/** PostgREST: funzione che non esiste (migrazione non applicata). */
const isMissingFunction = (err: unknown) => {
    const code = (err as { code?: string } | null)?.code;
    return code === "PGRST202" || code === "42883";
};

async function findVenue(deps: GeaDeps, query: string): Promise<{ venue: VenueMatch } | { reply: string }> {
    const matches = ((await deps.rpc("crm_gea_find_venues", { p_query: query })) ?? []) as VenueMatch[];
    const choice = chooseVenue(matches, query);
    if ("none" in choice) return { reply: noVenueText(query) };
    if ("many" in choice) return { reply: manyVenuesText(query, choice.many) };
    return choice;
}

function agendaDetail(days: number, offset: number): string {
    if (offset === 0 && days === 1) return "oggi";
    if (offset === 1 && days === 1) return "domani";
    if (offset === -1 && days === 1) return "ieri";
    if (offset === 0) return `prossimi ${days} giorni`;
    return offset < 0 ? `da ${-offset} giorni fa, per ${days} giorni` : `fra ${offset} giorni, per ${days} giorni`;
}

export async function runRead(deps: GeaDeps, read: GeaRead, now: Date): Promise<ReadOutcome> {
    try {
        switch (read.tool) {
            case "guide":
                return { kind: "data", tool: "guide", data: guideData() };
            case "venue_card":
            case "venue_chat": {
                const found = await findVenue(deps, read.venue);
                if ("reply" in found) return { kind: "stop", reply: found.reply };
                const fn = read.tool === "venue_card" ? "crm_gea_venue_card" : "crm_gea_venue_chat";
                return { kind: "data", tool: read.tool, data: await deps.rpc(fn, { p_venue_id: found.venue.id }), detail: found.venue.name };
            }
            case "find_venues":
                return {
                    kind: "data",
                    tool: "find_venues",
                    data: await deps.rpc("crm_gea_find_venues", { p_query: read.query }),
                    detail: `«${read.query}»`
                };
            case "pipeline":
                return { kind: "data", tool: "pipeline", data: await deps.rpc("crm_gea_pipeline") };
            case "agenda": {
                const { from, to } = agendaBounds(now, read.days, read.offset);
                let data = ((await deps.rpc("crm_gea_agenda", { p_from: from.toISOString(), p_to: to.toISOString() })) ?? []) as {
                    caller: string | null;
                }[];
                let detail = agendaDetail(read.days, read.offset);
                let note: string | undefined;
                if (read.person) {
                    const person = choosePerson(deps.team, read.person);
                    if (person) {
                        data = data.filter(a => a.caller === person.display_name);
                        detail = `${detail}, ${person.display_name}`;
                    } else {
                        note = GEA_TEXT.noPerson(read.person);
                    }
                }
                return { kind: "data", tool: "agenda", data: note ? { nota: note, telefonate: data } : data, detail };
            }
            case "stale":
                return {
                    kind: "data",
                    tool: "stale",
                    data: await deps.rpc("crm_gea_stale", { p_days: read.days }),
                    detail: `fermi da ${read.days} giorni`
                };
            case "drafts":
                return { kind: "data", tool: "drafts", data: await deps.rpc("crm_gea_pending_drafts") };
            case "spend":
                return { kind: "data", tool: "spend", data: await deps.rpc("crm_ai_spend") };
            case "diary":
                return {
                    kind: "data",
                    tool: "diary",
                    data: await deps.rpc("crm_gea_diary", { p_days: read.days }),
                    detail: read.days === 1 ? "ultime 24 ore" : `ultimi ${read.days} giorni`
                };
        }
    } catch (err) {
        if (isMissingFunction(err)) return { kind: "missing", tool: read.tool };
        throw err;
    }
}

export interface GeaAnswer {
    reply: string;
    costUsd: number;
    /** Gli strumenti letti, per il registro (`crm_gea_inbox.tool`). */
    tool: string;
    error?: string;
}

const failText = (reason: string) =>
    reason === "day_cap" || reason === "month_cap" ? GEA_TEXT.capReached : GEA_TEXT.unavailable;

/** Le letture in fila; una che si ferma (locale non trovato o ambiguo) risponde da sola. */
export async function answerReads(
    deps: GeaDeps,
    input: { question: string; reads: GeaRead[]; now: Date; askerName: string; history?: GeaTurn[] }
): Promise<GeaAnswer> {
    // crm_gea_inbox.tool accetta solo [a-z_]: più letture separate da «__».
    const tool = input.reads.map(r => r.tool).join("__").slice(0, 40);
    const results: GeaReadResult[] = [];
    let missing = 0;
    for (const read of input.reads) {
        const out = await runRead(deps, read, input.now);
        if (out.kind === "stop") return { reply: out.reply, costUsd: 0, tool };
        if (out.kind === "missing") {
            missing += 1;
            continue;
        }
        results.push({ tool: out.tool, data: out.data, detail: out.detail });
    }
    if (results.length === 0) return { reply: GEA_TEXT.notReadyYet, costUsd: 0, tool, error: missing ? "missing_function" : undefined };

    const request = buildAnswerRequest({
        question: input.question,
        reads: results,
        now: input.now,
        askerName: input.askerName,
        history: input.history
    });
    const res = await deps.callModel({ ...request, maxTokens: 700 });
    if (!res.ok) return { reply: failText(res.reason), costUsd: 0, tool, error: `answer: ${res.reason}` };
    const reply = withSources(res.text, results, input.now);
    return {
        reply: missing ? `${reply}\n${GEA_TEXT.notReadyYet}` : reply,
        costUsd: res.costUsd,
        tool,
        error: missing ? "missing_function" : undefined
    };
}

/** Un testo proposto: legge la scheda del locale se nominato, poi scrive. Mai inviato. */
export async function writeText(
    deps: GeaDeps,
    input: { brief: string; venue?: string; now: Date; askerName: string; brandRules?: string | null; history?: GeaTurn[] }
): Promise<GeaAnswer> {
    let venueData: unknown;
    if (input.venue) {
        const found = await findVenue(deps, input.venue);
        if ("reply" in found) return { reply: found.reply, costUsd: 0, tool: "write" };
        venueData = await deps.rpc("crm_gea_venue_card", { p_venue_id: found.venue.id });
    }
    const request = buildWriteRequest({
        brief: input.brief,
        askerName: input.askerName,
        now: input.now,
        venueData,
        brandRules: input.brandRules,
        history: input.history
    });
    const res = await deps.callModel({ ...request, maxTokens: 600 });
    if (!res.ok) return { reply: failText(res.reason), costUsd: 0, tool: "write", error: `write: ${res.reason}` };
    return { reply: writeReplyText(res.text), costUsd: res.costUsd, tool: "write" };
}
