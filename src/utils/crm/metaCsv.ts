/**
 * Import dei lead esportati dal Centro lead di Meta (Business Suite).
 *
 * Il file arriva in due forme: CSV UTF-16LE separato da tab (l'export
 * "CSV" classico, pensato per Excel) oppure CSV UTF-8 con virgole o punti e
 * virgola. Le colonne fisse di Meta portano un prefisso sul valore ("l:" sugli
 * id dei lead, "ag:" sull'annuncio, "p:" sul telefono): si toglie.
 *
 * Puro: niente DOM, niente rete. La pagina passa i byte e riceve le righe
 * pronte per `crm_ingest_lead` (source `meta_form`, source_ref = id del lead
 * Meta, così il webhook in tempo reale non le reimporta). La mappatura dei
 * campi è la stessa del webhook: `@shared/metaLeadFields`.
 */
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";
import { phoneFingerprint } from "@/utils/crm/phoneFingerprint";
import { mapMetaLeadRecord, normalizeMetaHeader } from "@shared/metaLeadFields";
import type { CrmIngestInput } from "@/types/crm";

export interface MetaCsvRowOk {
    line: number;
    input: CrmIngestInput;
}

export interface MetaCsvRowError {
    line: number;
    reason: string;
}

export interface MetaCsvResult {
    rows: MetaCsvRowOk[];
    errors: MetaCsvRowError[];
}

/** Decodifica i byte del file: UTF-16LE/BE col BOM, altrimenti UTF-8. */
export function decodeMetaCsv(bytes: Uint8Array): string {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    }
    const text = new TextDecoder("utf-8").decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(headerLine: string): string {
    const counts: [string, number][] = [
        ["\t", headerLine.split("\t").length],
        [";", headerLine.split(";").length],
        [",", headerLine.split(",").length]
    ];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][0];
}

/** Parser CSV con virgolette ("" = virgoletta letterale, a capo dentro i campi). */
export function parseDelimited(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"' && field.length === 0) {
            quoted = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += ch;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter(r => r.some(cell => cell.trim().length > 0));
}

/**
 * Asincrona per l'impronta del telefono (WebCrypto) nelle chiavi delle righe
 * senza id.
 */
export async function parseMetaLeadsCsv(text: string): Promise<MetaCsvResult> {
    const firstLineEnd = text.search(/\r?\n/);
    const headerLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
    const table = parseDelimited(text, detectDelimiter(headerLine));
    const result: MetaCsvResult = { rows: [], errors: [] };
    if (table.length < 2) return result;

    const headers = table[0].map(normalizeMetaHeader);

    for (const [index, cells] of table.slice(1).entries()) {
        const line = index + 2;
        const record = new Map<string, string>();
        headers.forEach((header, col) => record.set(header, cells[col] ?? ""));

        const { leadId, rawCreated, rawPhone, ...fields } = mapMetaLeadRecord(record, headers);
        const phone = normalizePhoneToE164(rawPhone);
        if (!phone) {
            result.errors.push({
                line,
                reason: rawPhone ? `telefono non valido (${rawPhone})` : "telefono mancante"
            });
            continue;
        }

        // Senza la colonna id (export rinominato o tagliato) serve comunque
        // una chiave stabile, altrimenti ogni reimport aggiunge una richiesta.
        // Il telefono entra come impronta: la chiave resta per sempre in
        // crm_imported_refs, anche dopo la cancellazione del locale.
        const sourceRef =
            leadId || `csv:${await phoneFingerprint(phone)}${rawCreated ? `:${rawCreated}` : ""}`;

        result.rows.push({
            line,
            input: { source: "meta_form", sourceRef, phoneE164: phone, ...fields }
        });
    }

    return result;
}
