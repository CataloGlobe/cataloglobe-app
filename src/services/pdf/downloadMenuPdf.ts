import { supabase } from "@/services/supabase/client";

type DownloadMenuPdfErrorCode =
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "no_visible_items"
    | "server_error"
    | "unknown";

export class DownloadMenuPdfError extends Error {
    code: DownloadMenuPdfErrorCode;
    status?: number;

    constructor(code: DownloadMenuPdfErrorCode, message: string, status?: number) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function getFilenameFromContentDisposition(header: string | null): string | null {
    if (!header) return null;

    const filenameStar = /filename\*=([^;]+)/i.exec(header);
    if (filenameStar?.[1]) {
        const raw = filenameStar[1].trim().replace(/^UTF-8''/i, "");
        try {
            return decodeURIComponent(raw.replace(/["']/g, ""));
        } catch {
            return raw.replace(/["']/g, "");
        }
    }

    const filename = /filename=([^;]+)/i.exec(header);
    if (filename?.[1]) {
        return filename[1].trim().replace(/["']/g, "");
    }

    return null;
}

function toBlob(data: unknown): Blob {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer) return new Blob([data], { type: "application/pdf" });
    if (data instanceof Uint8Array) return new Blob([data], { type: "application/pdf" });

    throw new DownloadMenuPdfError("unknown", "Risposta PDF non valida.");
}

async function readErrorCode(response?: Response): Promise<string | null> {
    if (!response) return null;
    try {
        const payload = await response.clone().json();
        if (payload && typeof payload.error === "string") return payload.error;
    } catch {
        return null;
    }
    return null;
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function downloadMenuPdf(businessId: string): Promise<void> {
    const { data, error, response } = await supabase.functions.invoke("generate-menu-pdf", {
        body: { businessId }
    });

    if (error || !response) {
        const status = response?.status;
        const serverError = await readErrorCode(response);

        if (status === 401) {
            throw new DownloadMenuPdfError("unauthorized", "Non autorizzato.", status);
        }
        if (status === 403) {
            throw new DownloadMenuPdfError("forbidden", "Accesso negato.", status);
        }
        if (status === 404) {
            if (serverError === "no_visible_items") {
                throw new DownloadMenuPdfError("no_visible_items", "Nessun item visibile.", status);
            }
            throw new DownloadMenuPdfError("not_found", "Risorsa non trovata.", status);
        }
        if (status === 500) {
            throw new DownloadMenuPdfError("server_error", "Errore server.", status);
        }

        throw new DownloadMenuPdfError("unknown", "Errore sconosciuto.", status);
    }

    const blob = toBlob(data);
    const filename =
        getFilenameFromContentDisposition(response.headers.get("Content-Disposition")) ?? "menu.pdf";

    triggerDownload(blob, filename);
}
