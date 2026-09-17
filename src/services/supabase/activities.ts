import { supabase } from "@/services/supabase/client";
import { appendCacheBuster } from "@/services/supabase/upload";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";
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

function buildActivityFolder(tenantId: string, slug: string, activityId: string) {
    const safeSlug = toSafeSlug(slug) || "activity";
    return `${tenantId}/${safeSlug}__${activityId}`;
}

function getFileExtension(file: File) {
    const mimeExt = file.type?.split("/")[1]?.toLowerCase();
    if (mimeExt) return mimeExt === "jpeg" ? "jpg" : mimeExt;
    const nameExt = file.name.split(".").pop()?.toLowerCase();
    if (!nameExt) return "jpg";
    return nameExt === "jpeg" ? "jpg" : nameExt;
}

function buildCoverPath(tenantId: string, slug: string, activityId: string, extension: string) {
    return `${buildActivityFolder(tenantId, slug, activityId)}/cover.${extension}`;
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
        street_number?: string | null;
        postal_code?: string | null;
        province?: string | null;
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

    void revalidatePublicCatalogForTenant(tenantId);

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

    void revalidatePublicCatalogForTenant(tenantId);

    return data;
}

/**
 * Toggle `ordering_enabled` per una sede. Quando false: cliente vede menu
 * ma submit-order risponde 423 ORDERING_UNAVAILABLE (reason ordering_disabled).
 *
 * Pattern coerente con `updateActivity` (tenant-scoped + revalidate cache
 * public catalog).
 */
export async function updateActivityOrderingEnabled(
    activityId: string,
    tenantId: string,
    enabled: boolean
): Promise<void> {
    const { error } = await supabase
        .from("activities")
        .update({ ordering_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", activityId)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    void revalidatePublicCatalogForTenant(tenantId);
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

    void revalidatePublicCatalogForTenant(tenantId);
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

export interface DeleteActivityResult {
    affected_schedules_disabled?: number;
}

export async function deleteActivityAtomic(
    activityId: string
): Promise<DeleteActivityResult> {
    const { data, error } = await supabase.functions.invoke("delete-business", {
        body: { businessId: activityId }
    });

    if (!error) {
        const payload = (data ?? {}) as DeleteActivityResult;
        return {
            affected_schedules_disabled:
                typeof payload.affected_schedules_disabled === "number"
                    ? payload.affected_schedules_disabled
                    : undefined
        };
    }

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

export interface ActivityDeleteImpactSchedule {
    id: string;
    name: string | null;
    rule_type: "catalog" | "featured";
}

export interface ActivityDeleteImpact {
    /** Regole di Programmazione che passeranno in bozza (enabled=false):
     *  tolti i target di questa sede, non ne resta nessuno, e la regola non
     *  ha apply_to_all. Stessa semantica del cleanup lato edge function
     *  `delete-business` (conteggio post-delete, non "unico target"). */
    schedulesGoingDraft: ActivityDeleteImpactSchedule[];
}

/**
 * Preview di sola lettura, da mostrare nel dialog di conferma PRIMA
 * dell'eliminazione — non tocca alcuna riga. Il conteggio effettivo
 * (`affected_schedules_disabled`) resta calcolato da `delete-business` al
 * momento del delete: race condition teorica fra preview e conferma accettata
 * (stesso principio di `docs/patterns/delete-drawer.md` Pattern B).
 */
export async function countActivityDeleteImpact(
    tenantId: string,
    activityId: string
): Promise<ActivityDeleteImpact> {
    const { data: targetRows, error: targetsError } = await supabase
        .from("schedule_targets")
        .select(
            `
            schedule_id,
            schedule:schedules!inner(id, name, rule_type, enabled, apply_to_all, tenant_id)
            `
        )
        .eq("target_type", "activity")
        .eq("target_id", activityId);

    if (targetsError) throw targetsError;

    type ScheduleJoin = {
        id: string;
        name: string | null;
        rule_type: "catalog" | "featured";
        enabled: boolean;
        apply_to_all: boolean;
        tenant_id: string;
    };
    type TargetRow = { schedule_id: string; schedule: ScheduleJoin | ScheduleJoin[] | null };

    // Quante righe target di QUESTA sede ha ogni schedule candidata — di norma
    // 1, ma non assunto: se esistono duplicati (nessun UNIQUE su
    // schedule_targets), l'Edge le cancella tutte in un colpo solo.
    const candidates = new Map<string, ScheduleJoin>();
    const ownTargetCount = new Map<string, number>();
    for (const row of (targetRows ?? []) as TargetRow[]) {
        const schedule = Array.isArray(row.schedule) ? (row.schedule[0] ?? null) : row.schedule;
        if (!schedule) continue;
        if (schedule.tenant_id !== tenantId) continue;
        ownTargetCount.set(schedule.id, (ownTargetCount.get(schedule.id) ?? 0) + 1);
        if (!schedule.enabled || schedule.apply_to_all) continue;
        candidates.set(schedule.id, schedule);
    }

    if (candidates.size === 0) return { schedulesGoingDraft: [] };

    // Stessa semantica dell'Edge Function `delete-business`: dopo aver tolto
    // i target di QUESTA sede, quanti ne restano? Non "è l'unico target"
    // (euristica), ma il conteggio effettivo che l'Edge farebbe post-delete.
    const scheduleIds = Array.from(candidates.keys());
    const { data: allTargets, error: allTargetsError } = await supabase
        .from("schedule_targets")
        .select("schedule_id")
        .in("schedule_id", scheduleIds);

    if (allTargetsError) throw allTargetsError;

    const totalTargetCount = new Map<string, number>();
    for (const t of allTargets ?? []) {
        totalTargetCount.set(t.schedule_id, (totalTargetCount.get(t.schedule_id) ?? 0) + 1);
    }

    const schedulesGoingDraft: ActivityDeleteImpactSchedule[] = [];
    for (const [id, schedule] of candidates) {
        const remaining = (totalTargetCount.get(id) ?? 0) - (ownTargetCount.get(id) ?? 0);
        if (remaining === 0) {
            schedulesGoingDraft.push({ id, name: schedule.name, rule_type: schedule.rule_type });
        }
    }

    schedulesGoingDraft.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    return { schedulesGoingDraft };
}

export async function updateActivityHoursPublic(
    activityId: string,
    tenantId: string,
    hoursPublic: boolean
): Promise<void> {
    const { error } = await supabase
        .from("activities")
        .update({ hours_public: hoursPublic, updated_at: new Date().toISOString() })
        .eq("id", activityId)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    void revalidatePublicCatalogForTenant(tenantId);
}

/* =====================================================
   STORAGE (COVER IMAGE)
 ===================================================== */

export async function uploadActivityCover(
    activity: Pick<V2Activity, "id" | "slug" | "tenant_id">,
    file: File
): Promise<string> {
    const extension = getFileExtension(file);
    const path = buildCoverPath(activity.tenant_id, activity.slug, activity.id, extension);

    // 0. Cleanup file orfani: il path della cover include l'estensione (cover.<ext>),
    // quindi un upload successivo con estensione diversa (tipico dopo il fix che
    // forza JPEG su input PNG) non sovrascriverebbe il vecchio file via upsert.
    // Rimuovi tutte le estensioni note prima di caricare. Errori ignorati: il file
    // potrebbe semplicemente non esistere.
    const folder = buildActivityFolder(activity.tenant_id, activity.slug, activity.id);
    const possibleOldExts = ["png", "jpg", "jpeg", "webp"];
    await Promise.all(
        possibleOldExts.map(async ext => {
            try {
                await supabase.storage
                    .from(BUSINESS_COVERS_BUCKET)
                    .remove([`${folder}/cover.${ext}`]);
            } catch {
                // best-effort
            }
        })
    );

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

    // Cache-bust: il path e' deterministico (cover.<ext>) e cacheControl=3600,
    // senza query param il CDN servirebbe la versione vecchia e l'URL salvato in
    // DB sarebbe identico al precedente — React non re-renderizzerebbe.
    const bustedUrl = appendCacheBuster(publicUrl);

    // 3. Update DB
    await updateActivity(activity.id, activity.tenant_id, { cover_image: bustedUrl });

    return bustedUrl;
}

export async function removeActivityCover(
    activityId: string,
    tenantId: string,
    coverImageUrl: string
): Promise<void> {
    const marker = `/${BUSINESS_COVERS_BUCKET}/`;
    const markerIdx = coverImageUrl.indexOf(marker);
    if (markerIdx !== -1) {
        const afterMarker = coverImageUrl.slice(markerIdx + marker.length);
        const queryIdx = afterMarker.indexOf("?");
        const path = queryIdx === -1 ? afterMarker : afterMarker.slice(0, queryIdx);
        if (path) {
            const { error: removeError } = await supabase.storage
                .from(BUSINESS_COVERS_BUCKET)
                .remove([path]);
            if (removeError) {
                console.error("[removeActivityCover] storage remove failed:", removeError);
            }
        }
    }

    await updateActivity(activityId, tenantId, { cover_image: null });
}
