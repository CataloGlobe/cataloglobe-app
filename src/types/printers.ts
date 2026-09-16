// Printer — riga della tabella `public.printers`: stampante cloud Sunmi
// collegata a una sede. `sn` e' il serial number del dispositivo (UNIQUE
// globale), `label` il nome scelto dall'utente ("Cucina", "Bar").
//
// `is_online` / `last_online_at` / `out_of_paper` sono scritti dal callback
// Sunmi (edge function `sunmi-device-callback`), non da un polling: `null` su
// `is_online` significa "nessun evento mai ricevuto", diverso da offline.
// `lack_paper_count`/`paper_will_end_count` sono i contatori cumulativi grezzi
// dell'ultimo evento visto (vedi migration 20260915094512): non servono in FE,
// esposti solo perche' la riga li porta.
export interface Printer {
    id: string;
    tenant_id: string;
    activity_id: string;
    sn: string;
    label: string;
    is_active: boolean;
    is_online: boolean | null;
    lack_paper_count: number | null;
    paper_will_end_count: number | null;
    out_of_paper: boolean;
    last_online_at: string | null;
    last_status_at: string | null;
    created_at: string;
    updated_at: string;
}

// Payload per l'edge function `sunmi-bind-printer`. `activity_id` e
// `tenant_id` sono aggiunti dal service, non dal form.
export interface BindPrinterPayload {
    sn: string;
    label: string;
}

export interface BindPrinterResult {
    printer: Printer;
    /** true se la riga esisteva gia' per la stessa sede (200 idempotente). */
    already_bound: boolean;
}

export interface UnbindPrinterResult {
    deleted: boolean;
    printer_id: string;
}

// Risposta dell'edge function `sunmi-printer-status`. Letta on-demand, MAI
// persistita (vedi commento su `last_online_at` sopra). `available: false`
// significa "stato non determinato" (Sunmi irraggiungibile/timeout o rifiuto
// non di configurazione) — MAI da leggere come "stampante offline".
// `statuses` mappa `sn → is_online`; un sn assente dalla mappa (mismatch
// improbabile con la lista locale) va trattato come stato non disponibile.
export interface PrinterStatusResult {
    available: boolean;
    statuses: Record<string, boolean>;
}

// Risposta dell'edge function `sunmi-reprint-order`: conteggio per stampante.
// `failed > 0` con `printed > 0` e' un successo parziale (alcune stampanti
// hanno accettato, altre no) — il chiamante decide come renderlo nel toast.
export interface ReprintOrderResult {
    total: number;
    printed: number;
    failed: number;
}

// Codici applicativi restituiti dalle edge function sunmi-*-printer e
// sunmi-reprint-order.
export type PrinterErrorCode =
    | "INVALID_BODY"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "ACTIVITY_NOT_FOUND"
    | "ORDER_NOT_FOUND"
    | "PRINTER_NOT_FOUND"
    | "PRINTER_SN_IN_USE"
    | "ORDERING_DISABLED"
    | "NO_ACTIVE_PRINTERS"
    | "SUNMI_DEVICE_REJECTED"
    | "SUNMI_CONFIG_ERROR"
    | "SUNMI_ERROR"
    | "SUNMI_UNREACHABLE"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR"
    | "UNKNOWN";
