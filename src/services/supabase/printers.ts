import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type {
    BindPrinterPayload,
    BindPrinterResult,
    Printer,
    PrinterErrorCode,
    UnbindPrinterResult
} from "@/types/printers";

/**
 * Errore applicativo delle operazioni stampante. `message` e' gia' in
 * italiano e pronto per il toast; `code` permette al chiamante di
 * discriminare (es. SUNMI_DEVICE_REJECTED → errore inline sul campo SN).
 */
export class PrinterServiceError extends Error {
    readonly code: PrinterErrorCode;
    readonly status: number | null;

    constructor(code: PrinterErrorCode, message: string, status: number | null) {
        super(message);
        this.name = "PrinterServiceError";
        this.code = code;
        this.status = status;
    }
}

/**
 * Lista stampanti di una sede, ordinate per label ASC. RLS: tables.read.
 */
export async function listPrinters(
    tenantId: string,
    activityId: string
): Promise<Printer[]> {
    const { data, error } = await supabase
        .from("printers")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .order("label", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Printer[];
}

/**
 * Collega una stampante Sunmi alla sede via edge function `sunmi-bind-printer`
 * (bindShop lato Sunmi + INSERT). Richiede tables.manage sulla sede.
 * `tenantId` non viaggia nel body: l'edge function lo deriva dalla sede e lo
 * usa come filtro; qui serve solo per coerenza di firma con gli altri service.
 */
export async function bindPrinter(
    tenantId: string,
    activityId: string,
    payload: BindPrinterPayload
): Promise<BindPrinterResult> {
    void tenantId;
    const { data, error } = await supabase.functions.invoke<BindPrinterResult>(
        "sunmi-bind-printer",
        {
            body: {
                activity_id: activityId,
                sn: payload.sn.trim().toUpperCase(),
                label: payload.label.trim()
            }
        }
    );
    if (error) throw await mapInvokeError(error);
    if (!data?.printer) {
        throw new PrinterServiceError("UNKNOWN", "Risposta inattesa dal server.", null);
    }
    return data;
}

/**
 * Scollega una stampante via edge function `sunmi-unbind-printer`
 * (unbindShop lato Sunmi + DELETE). Richiede tables.manage sulla sede.
 */
export async function unbindPrinter(
    id: string,
    tenantId: string
): Promise<void> {
    void tenantId;
    const { data, error } = await supabase.functions.invoke<UnbindPrinterResult>(
        "sunmi-unbind-printer",
        { body: { printer_id: id } }
    );
    if (error) throw await mapInvokeError(error);
    if (!data?.deleted) {
        throw new PrinterServiceError("UNKNOWN", "Risposta inattesa dal server.", null);
    }
}

// ============================================================
// Error mapping
// ============================================================

const MESSAGES: Record<PrinterErrorCode, string> = {
    INVALID_BODY: "Dati non validi. Controlla numero di serie e nome.",
    UNAUTHORIZED: "Sessione scaduta. Accedi di nuovo.",
    FORBIDDEN: "Non hai i permessi per gestire le stampanti di questa sede.",
    ACTIVITY_NOT_FOUND: "Sede non trovata.",
    PRINTER_NOT_FOUND: "Stampante non trovata. Potrebbe essere già stata rimossa.",
    PRINTER_SN_IN_USE:
        "Questo dispositivo è collegato a un'altra sede. Scollegalo da quella sede prima di collegarlo qui.",
    ORDERING_DISABLED: "Attiva le ordinazioni dal tavolo prima di collegare una stampante.",
    SUNMI_DEVICE_REJECTED: "Sunmi non riconosce questo numero di serie. Controlla l'SN sul dispositivo.",
    SUNMI_CONFIG_ERROR: "Integrazione Sunmi non configurata. Contatta l'assistenza.",
    SUNMI_ERROR: "Sunmi ha rifiutato l'operazione. Riprova più tardi.",
    SUNMI_UNREACHABLE: "Sunmi non raggiungibile. Riprova tra poco.",
    RATE_LIMITED: "Troppe richieste. Riprova tra poco.",
    INTERNAL_ERROR: "Errore interno. Riprova più tardi.",
    UNKNOWN: "Operazione non riuscita."
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGES));

function isPrinterErrorCode(code: unknown): code is PrinterErrorCode {
    return typeof code === "string" && KNOWN_CODES.has(code);
}

async function mapInvokeError(error: unknown): Promise<PrinterServiceError> {
    if (!(error instanceof FunctionsHttpError)) {
        return new PrinterServiceError("SUNMI_UNREACHABLE", MESSAGES.SUNMI_UNREACHABLE, null);
    }
    const status = error.context?.status ?? null;
    let code: PrinterErrorCode = "UNKNOWN";
    try {
        const body = (await error.context.clone().json()) as { code?: unknown };
        if (isPrinterErrorCode(body?.code)) code = body.code;
    } catch {
        // body non JSON: resta UNKNOWN
    }
    return new PrinterServiceError(code, MESSAGES[code], status);
}
