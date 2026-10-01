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
 * Meta, così il webhook in tempo reale non le reimporta).
 */
import { normalizePhoneToE164 } from "@/utils/phoneNormalize";
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

/** Colonne di sistema di Meta: non sono risposte del modulo. */
const META_FIXED_COLUMNS = new Set([
    "id",
    "created_time",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "form_id",
    "form_name",
    "is_organic",
    "platform",
    "lead_status",
    "inbox_url"
]);

const NAME_COLUMNS = ["full_name", "nome_e_cognome", "nome_completo", "nome"];
const FIRST_NAME_COLUMNS = ["first_name", "nome"];
const LAST_NAME_COLUMNS = ["last_name", "cognome"];
const PHONE_COLUMNS = ["phone_number", "phone", "numero_di_telefono", "telefono"];
const EMAIL_COLUMNS = ["email", "e-mail", "indirizzo_email"];
const CITY_COLUMNS = ["city", "città", "citta"];
/** Domanda personalizzata sul nome del locale: si riconosce dal testo. */
const VENUE_PATTERN = /(company|business|locale|attivit|ristorante|nome_del|insegna)/;

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

/** Toglie i prefissi di Meta ("l:123", "p:+39…", "ag:…"). */
export function stripMetaPrefix(value: string): string {
    return value.trim().replace(/^[a-z]{1,3}:/, "").trim();
}

function normalizeHeader(header: string): string {
    return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function pick(record: Map<string, string>, candidates: string[]): string {
    for (const key of candidates) {
        const value = record.get(key);
        if (value && value.trim()) return value.trim();
    }
    return "";
}

function toIsoOrNull(value: string): string | null {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function parseMetaLeadsCsv(text: string): MetaCsvResult {
    const firstLineEnd = text.search(/\r?\n/);
    const headerLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
    const table = parseDelimited(text, detectDelimiter(headerLine));
    const result: MetaCsvResult = { rows: [], errors: [] };
    if (table.length < 2) return result;

    const headers = table[0].map(normalizeHeader);
    const venueColumn = headers.find(
        h => !META_FIXED_COLUMNS.has(h) && VENUE_PATTERN.test(h)
    );

    table.slice(1).forEach((cells, index) => {
        const line = index + 2;
        const record = new Map<string, string>();
        headers.forEach((header, col) => record.set(header, cells[col] ?? ""));

        const rawPhone = stripMetaPrefix(pick(record, PHONE_COLUMNS));
        const phone = normalizePhoneToE164(rawPhone);
        if (!phone) {
            result.errors.push({
                line,
                reason: rawPhone ? `telefono non valido (${rawPhone})` : "telefono mancante"
            });
            return;
        }

        const fullName =
            pick(record, NAME_COLUMNS) ||
            [pick(record, FIRST_NAME_COLUMNS), pick(record, LAST_NAME_COLUMNS)]
                .filter(Boolean)
                .join(" ");
        const venueName = venueColumn ? (record.get(venueColumn) ?? "").trim() : "";

        const formAnswers: Record<string, string> = {};
        headers.forEach(header => {
            const value = (record.get(header) ?? "").trim();
            if (!value || META_FIXED_COLUMNS.has(header)) return;
            formAnswers[header] = value;
        });

        const createdAt = toIsoOrNull(record.get("created_time") ?? "");
        const formName = (record.get("form_name") ?? "").trim();
        const leadId = stripMetaPrefix(record.get("id") ?? "");
        // Senza la colonna id (export rinominato o tagliato) serve comunque
        // una chiave stabile, altrimenti ogni reimport aggiunge una richiesta.
        const rawCreated = (record.get("created_time") ?? "").trim();
        const sourceRef = leadId || `csv:${phone}${rawCreated ? `:${rawCreated}` : ""}`;

        result.rows.push({
            line,
            input: {
                source: "meta_form",
                sourceRef,
                name: fullName || "Senza nome",
                venueName: venueName || fullName || "Senza nome",
                phoneE164: phone,
                email: pick(record, EMAIL_COLUMNS) || null,
                city: pick(record, CITY_COLUMNS) || null,
                formAnswers,
                adId: stripMetaPrefix(record.get("ad_id") ?? "") || null,
                adName: (record.get("ad_name") ?? "").trim() || null,
                campaign: (record.get("campaign_name") ?? "").trim() || null,
                consentAt: createdAt,
                consentText: formName ? `Modulo Meta «${formName}»` : "Modulo Meta",
                receivedAt: createdAt
            }
        });
    });

    return result;
}
