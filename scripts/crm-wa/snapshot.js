// =============================================================================
// Istantanea della chat aperta in WhatsApp Web (F1-2)
// =============================================================================
// Da eseguire nella scheda di WhatsApp Web (Claude in Chrome, javascript_tool)
// con la chat del lead aperta. Ritorna il JSON da passare a
// `node scripts/crm-wa/crm-wa.mjs chats`: { chats: [{ messages: [...] }] }.
// Il telefono lo ricava l'edge dal data-id; l'ora dal data-pre-plain-text.
//
// ⚠️ Selettori di WhatsApp Web: cambiano senza preavviso. Se l'istantanea
// esce vuota con messaggi a vista, è da aggiornare qui (e la prova a mano
// nel README va rifatta).
// =============================================================================
(() => {
    const main = document.querySelector("#main");
    if (!main) return JSON.stringify({ error: "nessuna chat aperta" });

    const kindOf = row => {
        if (row.querySelector('[data-icon="audio-play"], [data-icon="ptt-status"], [data-icon*="ptt"]')) return "voice";
        if (row.querySelector('[data-icon="media-play"], video')) return "video";
        if (row.querySelector('[data-icon*="document"], [data-icon*="doc-"]')) return "document";
        if (row.querySelector('img[src^="blob:"], img[src^="data:image"]')) {
            return row.querySelector('[data-testid*="sticker"], img[alt=""][draggable="false"]') && !row.querySelector(".copyable-text")
                ? "sticker"
                : "image";
        }
        return row.querySelector(".copyable-text") ? "text" : "other";
    };

    const messages = [];
    for (const row of main.querySelectorAll("[data-id]")) {
        const id = row.getAttribute("data-id") ?? "";
        if (!/^(true|false)_\d+@c\.us_/.test(id)) continue;
        const copyable = row.querySelector(".copyable-text[data-pre-plain-text]");
        const textNode = row.querySelector(".copyable-text .selectable-text") ?? row.querySelector(".selectable-text");
        messages.push({
            id,
            from_me: id.startsWith("true_"),
            kind: kindOf(row),
            text: textNode ? textNode.innerText : null,
            pre: copyable ? copyable.getAttribute("data-pre-plain-text") : null
        });
    }
    return JSON.stringify({ chats: [{ messages: messages.slice(-200) }] });
})();
