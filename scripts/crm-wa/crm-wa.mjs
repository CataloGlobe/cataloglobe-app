#!/usr/bin/env node
// =============================================================================
// crm-wa — il Mac di WhatsApp Web parla con l'edge crm-wa-worker (F1-2)
// =============================================================================
// Uso (istruzioni complete in scripts/crm-wa/README.md):
//   node scripts/crm-wa/crm-wa.mjs heartbeat ok|needs_relink|warning ["dettaglio"]
//   node scripts/crm-wa/crm-wa.mjs chats < istantanee.json
//   node scripts/crm-wa/crm-wa.mjs next
//   node scripts/crm-wa/crm-wa.mjs result <message_id> ok [wa_message_id]
//   node scripts/crm-wa/crm-wa.mjs result <message_id> fail "motivo"
//
// URL e segreto: variabili CRM_WA_WORKER_URL e CRM_WA_WORKER_SECRET, oppure
// il Portachiavi di macOS (servizi «cataloglobe-crm-wa-url» e
// «cataloglobe-crm-wa-secret»). Il segreto non si stampa mai.
// Stampa la risposta dell'edge in JSON; esce con 1 su errore.
// =============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parsePrePlainText, parseSnapshotBatch } from "../../supabase/functions/_shared/crmWaWorker.ts";

const VERSION = "crm-wa 1";

function fromKeychain(service) {
    try {
        return execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim();
    } catch {
        return "";
    }
}

function config() {
    const url = process.env.CRM_WA_WORKER_URL || fromKeychain("cataloglobe-crm-wa-url");
    const secret = process.env.CRM_WA_WORKER_SECRET || fromKeychain("cataloglobe-crm-wa-secret");
    if (!url || !secret) {
        fail("URL o segreto mancanti: vedi scripts/crm-wa/README.md, «Prima volta».");
    }
    return { url, secret };
}

function fail(message) {
    console.error(JSON.stringify({ error: message }));
    process.exit(1);
}

async function call(payload) {
    const { url, secret } = config();
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Worker-Secret": secret },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30_000)
        });
    } catch (err) {
        fail(`rete: ${err instanceof Error ? err.name : "errore"}`);
    }
    const body = await res.json().catch(() => ({}));
    console.log(JSON.stringify(body));
    if (!res.ok) process.exit(1);
}

/** Istantanee lette dalla pagina: l'ora arriva come data-pre-plain-text («pre»). */
function normalizeChats(input) {
    const chats = Array.isArray(input) ? input : input?.chats;
    if (!Array.isArray(chats)) fail("attese { chats: [...] } o un array di chat");
    return {
        chats: chats.map(chat => ({
            ...chat,
            messages: (chat.messages ?? []).map(({ pre, ...m }) => ({ ...m, at: m.at ?? parsePrePlainText(pre) }))
        }))
    };
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
    case "heartbeat": {
        const [state, detail] = args;
        if (!["ok", "needs_relink", "warning"].includes(state)) fail("stato: ok, needs_relink o warning");
        await call({ action: "heartbeat", state, detail: detail ?? null, version: VERSION });
        break;
    }
    case "chats": {
        let input;
        try {
            input = JSON.parse(readFileSync(0, "utf8"));
        } catch {
            fail("JSON non valido su stdin");
        }
        const payload = normalizeChats(input);
        const check = parseSnapshotBatch(payload);
        if (!check.ok) fail(check.error);
        await call({ action: "chats", chats: payload.chats });
        break;
    }
    case "next":
        await call({ action: "next" });
        break;
    case "result": {
        const [messageId, outcome, extra] = args;
        if (!messageId || !["ok", "fail"].includes(outcome)) fail("uso: result <message_id> ok|fail [wa_message_id|motivo]");
        await call(
            outcome === "ok"
                ? { action: "result", message_id: messageId, ok: true, wa_message_id: extra ?? null }
                : { action: "result", message_id: messageId, ok: false, error: extra ?? null }
        );
        break;
    }
    default:
        fail("comandi: heartbeat, chats, next, result");
}
