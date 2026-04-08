import { supabase } from "@/services/supabase/client";
import type { V2Activity } from "@/types/activity";

const BUSINESS_COVERS_BUCKET = "business-covers";
const AUTH_SESSION_MISSING_MESSAGE =
    "Sessione non valida o scaduta. Effettua di nuovo il login e riprova.";

type JwtPayload = {
    iss?: unknown;
    ref?: unknown;
    aud?: unknown;
    exp?: unknown;
};

type JwtHeader = {
    alg?: unknown;
    typ?: unknown;
};

function decodeJwtPart<T>(token: string, index: number): T | null {
    try {
        const part = token.split(".")[index];
        if (!part) return null;
        const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
        const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
        return JSON.parse(atob(normalized + padding)) as T;
    } catch {
        return null;
    }
}

function getProjectRefFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
        const { hostname } = new URL(url);
        return hostname.split(".")[0] ?? null;
    } catch {
        return null;
    }
}

function getProjectRefFromIssuer(iss: string | null): string | null {
    if (!iss) return null;
    try {
        const { hostname } = new URL(iss);
        return hostname.split(".")[0] ?? null;
    } catch {
        return null;
    }
}

function runDeleteBusinessDevDiagnostics(hasSession: boolean, accessToken: string | null): void {
    if (!import.meta.env.DEV) return;

    const runtimeSupabaseUrl =
        (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ??
        import.meta.env.VITE_SUPABASE_URL ??
        null;

    const header = accessToken ? decodeJwtPart<JwtHeader>(accessToken, 0) : null;
    const payload = accessToken ? decodeJwtPart<JwtPayload>(accessToken, 1) : null;
    const tokenAlg = typeof header?.alg === "string" ? header.alg : null;
    const tokenIss = typeof payload?.iss === "string" ? payload.iss : null;
    const tokenRef = typeof payload?.ref === "string" ? payload.ref : null;
    const tokenAud = typeof payload?.aud === "string" ? payload.aud : null;
    const tokenExp = typeof payload?.exp === "number" ? payload.exp : null;

    const urlRef = getProjectRefFromUrl(runtimeSupabaseUrl);
    const issuerRef = getProjectRefFromIssuer(tokenIss) ?? tokenRef;
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    const isTokenExpired = tokenExp !== null ? tokenExp <= nowEpochSeconds : null;

    const expectedIssuer = runtimeSupabaseUrl ? `${runtimeSupabaseUrl}/auth/v1` : null;
    const issuerMatchesExactly = expectedIssuer && tokenIss ? tokenIss === expectedIssuer : null;

    console.info("[delete-business][dev] auth diagnostics", {
        "supabase.supabaseUrl": runtimeSupabaseUrl,
        hasSession,
        tokenAlg,
        tokenIssuer: tokenIss,
        tokenAudience: tokenAud,
        tokenExpirationEpoch: tokenExp,
        tokenExpired: isTokenExpired,
        tokenProjectRef: issuerRef,
        expectedIssuer,
        issuerMatchesExactly
    });

    if (urlRef && issuerRef && urlRef !== issuerRef) {
        console.error(
            `[delete-business][dev] JWT issuer mismatch: token ref "${issuerRef}" does not match Supabase URL ref "${urlRef}". This causes 401 Invalid JWT when verify_jwt=true.`
        );
    }

    if (issuerMatchesExactly === false) {
        console.error(
            `[delete-business][dev] JWT issuer mismatch: token iss "${tokenIss}" does not match expected "${expectedIssuer}".`
        );
    }

    if (tokenAud !== null && tokenAud !== "authenticated") {
        console.error(
            `[delete-business][dev] Unexpected JWT audience "${tokenAud}". Expected "authenticated".`
        );
    }

    if (isTokenExpired === true) {
        console.error("[delete-business][dev] JWT is expired.");
    }

    if (tokenAlg && tokenAlg !== "ES256") {
        console.warn(
            `[delete-business][dev] JWT alg is "${tokenAlg}". With JWT Signing Keys (ECC P-256), access tokens are expected to be ES256.`
        );
    }
}

/* =====================================================
   HELPERS (privati)
 ===================================================== */

function toSafeSlug(input: string) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function buildActivityFolder(slug: string, activityId: string) {
    const safeSlug = toSafeSlug(slug) || "activity";
    return `${safeSlug}__${activityId}`;
}

function getFileExtension(file: File) {
    const mimeExt = file.type?.split("/")[1]?.toLowerCase();
    if (mimeExt) return mimeExt;
    const nameExt = file.name.split(".").pop()?.toLowerCase();
    return nameExt || "jpg";
}

function buildCoverPath(slug: string, activityId: string, extension: string) {
    return `${buildActivityFolder(slug, activityId)}/cover.${extension}`;
}

/* =====================================================
   QUERY (READ)
 ===================================================== */

/**
 * Recupera tutte le attività per un determinato tenant (user_id).
 */
export async function getActivities(tenantId: string): Promise<V2Activity[]> {
    const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * Conta le attività di un tenant (head-only, nessun payload).
 */
export async function getActivityCount(tenantId: string): Promise<number> {
    const { count, error } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return count ?? 0;
}

/**
 * Recupera una singola attività attiva tramite slug (uso pubblico).
 */
export async function getActivityBySlug(slug: string): Promise<V2Activity | null> {
    const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .single();

    if (error) return null;
    return data;
}

/**
 * Recupera una singola attività tramite slug senza filtro status.
 * Usata per distinguere "inesistente" da "inattiva" nella pagina pubblica.
 */
export async function getActivityBySlugAny(slug: string): Promise<V2Activity | null> {
    const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("slug", slug)
        .single();

    if (error) return null;
    return data;
}

/**
 * Recupera una singola attività tramite ID.
 */
export async function getActivityById(id: string, tenantId: string): Promise<V2Activity | null> {
    const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    if (error) return null;
    return data;
}

/* =====================================================
   MUTATIONS (DB)
 ===================================================== */

export async function createActivity(
    tenantId: string,
    params: {
        name: string;
        slug: string;
        activity_type: string | null;
        city: string | null;
        address: string | null;
    }
): Promise<V2Activity> {
    const { data, error } = await supabase
        .from("activities")
        .insert([
            {
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                ...params,
                status: "active"
            }
        ])
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            throw new Error("SLUG_CONFLICT");
        }
        throw error;
    }
    return data;
}

export async function updateActivity(
    id: string,
    tenantId: string,
    updates: Partial<Omit<V2Activity, "id" | "tenant_id" | "created_at">>
): Promise<V2Activity> {
    const { data, error } = await supabase
        .from("activities")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            throw new Error("SLUG_CONFLICT");
        }
        throw error;
    }
    return data;
}

export async function deleteActivity(id: string, tenantId: string) {
    // Nota: l'eliminazione atomica (bucket + db) è gestita via Edge Function
    // o manualmente chiamando prima deleteActivityAssets.
    const { error } = await supabase
        .from("activities")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

/**
 * Eliminazione atomica tramite Edge Function (replica logica legacy)
 */
export class DeleteActivityError extends Error {
    code: string;
    constructor(message: string, code: string) {
        super(message);
        this.code = code;
    }
}

export async function deleteActivityAtomic(activityId: string): Promise<void> {
    const { error } = await supabase.functions.invoke("delete-business", {
        body: { businessId: activityId }
    });

    if (!error) return;

    // FunctionsHttpError exposes the raw Response as .context.
    // Read the JSON body to extract structured error codes returned by the function.
    const rawResponse = (error as unknown as { context?: Response }).context;
    if (rawResponse) {
        try {
            const body = (await rawResponse.json()) as {
                error?: string;
                code?: string;
                message?: string;
            };
            if (rawResponse.status === 401) {
                throw new DeleteActivityError(
                    "Autenticazione non valida. Effettua di nuovo il login.",
                    "AUTH_EXPIRED"
                );
            }
            if (body.code) {
                throw new DeleteActivityError(
                    body.message ?? "Operazione non consentita.",
                    body.code
                );
            }
        } catch (inner) {
            if (inner instanceof DeleteActivityError) throw inner;
            // JSON parse failed — fall through to generic error below
        }
    }

    throw error;
}

/* =====================================================
   STORAGE (COVER IMAGE)
 ===================================================== */

export async function uploadActivityCover(
    activity: Pick<V2Activity, "id" | "slug" | "tenant_id">,
    file: File
): Promise<string> {
    const extension = getFileExtension(file);
    const path = buildCoverPath(activity.slug, activity.id, extension);

    // 1. Upload
    const { error: uploadError } = await supabase.storage
        .from(BUSINESS_COVERS_BUCKET)
        .upload(path, file, {
            upsert: true,
            cacheControl: "3600",
            contentType: file.type || undefined
        });

    if (uploadError) throw uploadError;

    // 2. Get URL
    const { data } = supabase.storage.from(BUSINESS_COVERS_BUCKET).getPublicUrl(path);

    const publicUrl = data.publicUrl;
    if (!publicUrl) throw new Error("Impossibile ottenere public URL");

    // 3. Update DB
    await updateActivity(activity.id, activity.tenant_id, { cover_image: publicUrl });

    return publicUrl;
}
