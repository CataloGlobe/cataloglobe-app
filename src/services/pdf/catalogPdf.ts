import { supabase } from "@/services/supabase/client";
import { resolveBusinessCollections } from "@/services/supabase/resolveBusinessCollections";
import { sanitizeSlugForSave } from "@/utils/slugify";

function buildFileName(businessSlug: string, catalogName: string) {
    const safeCatalog = sanitizeSlugForSave(catalogName) || "catalogo";
    return `${businessSlug}-${safeCatalog}.pdf`;
}

async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessione non valida. Effettua nuovamente il login.");
    return token;
}

async function getCatalogName(catalogId: string): Promise<string> {
    const { data, error } = await supabase
        .from("collections")
        .select("name")
        .eq("id", catalogId)
        .single();

    if (error || !data) throw new Error("Catalogo non trovato.");
    return data.name;
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export async function downloadBusinessCatalogPdf(params: {
    businessId: string;
    businessSlug: string;
}) {
    const { businessId, businessSlug } = params;

    const { primary } = await resolveBusinessCollections(businessId);
    if (!primary) {
        throw new Error("Nessun catalogo attivo disponibile per il download.");
    }

    const [token, catalogName] = await Promise.all([getAccessToken(), getCatalogName(primary)]);

    const response = await fetch(
        `/api/catalogs/${primary}/pdf?businessId=${encodeURIComponent(businessId)}`,
        {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/pdf"
        }
        }
    );

    if (!response.ok) {
        let message = `Errore durante la generazione del PDF (${response.status}).`;
        try {
            const payload = (await response.json()) as { error?: string };
            if (payload?.error) message = payload.error;
        } catch {
            // ignore json parsing errors
        }
        throw new Error(message);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/pdf")) {
        const text = await response.text();
        const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
        throw new Error(
            `Risposta non PDF ricevuta. Controlla la route API. ${
                snippet ? `Dettagli: ${snippet}` : ""
            }`.trim()
        );
    }

    const blob = await response.blob();
    const fileName = buildFileName(businessSlug, catalogName);
    downloadBlob(blob, fileName);
}
