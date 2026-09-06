// Printer — riga della tabella `public.printers`: stampante cloud Sunmi
// collegata a una sede. `sn` e' il serial number del dispositivo (UNIQUE
// globale), `label` il nome scelto dall'utente ("Cucina", "Bar").
// `last_online_at` resta null finche' non esiste un polling di onlineStatus.
export interface Printer {
    id: string;
    tenant_id: string;
    activity_id: string;
    sn: string;
    label: string;
    is_active: boolean;
    last_online_at: string | null;
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

// Codici applicativi restituiti dalle edge function sunmi-*-printer.
export type PrinterErrorCode =
    | "INVALID_BODY"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "ACTIVITY_NOT_FOUND"
    | "PRINTER_NOT_FOUND"
    | "PRINTER_SN_IN_USE"
    | "ORDERING_DISABLED"
    | "SUNMI_DEVICE_REJECTED"
    | "SUNMI_CONFIG_ERROR"
    | "SUNMI_ERROR"
    | "SUNMI_UNREACHABLE"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR"
    | "UNKNOWN";
