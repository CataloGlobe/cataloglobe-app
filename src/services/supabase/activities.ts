import { supabase } from "@/services/supabase/client";
import { appendCacheBuster } from "@/services/supabase/upload";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";
import { ruleReachesAnyActivity } from "@/utils/scheduleReach";
import type { V2Activity } from "@/types/activity";

const BUSINESS_COVERS_BUCKET = "business-covers";

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

export interface SeatLimitInfo {
    used: number;
    paid: number;
}

/**
 * Vero se l'errore viene dal trigger DB `enforce_seat_limit`
 * (20260413110000_enforce_seat_limit.sql:29). Il codice da solo non basta:
 * P0001 e' il generico "raise_exception" di plpgsql senza ERRCODE esplicito,
 * condiviso con altri RAISE nel DB — serve anche il testo del messaggio.
 */
export function isSeatLimitError(error: unknown): error is { code: string; message: string } {
    if (!error || typeof error !== "object") return false;
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    return code === "P0001" && typeof message === "string" && message.startsWith("Limite sedi raggiunto");
}

/**
 * Estrae used/paid dal messaggio del trigger ("Limite sedi raggiunto: % di %
 * sedi utilizzate"). Null se il testo non fa match (messaggio del trigger
 * cambiato senza aggiornare questo parser).
 */
export function parseSeatLimitError(error: unknown): SeatLimitInfo | null {
    if (!isSeatLimitError(error)) return null;
    const match = /Limite sedi raggiunto: (\d+) di (\d+) sedi utilizzate/.exec(error.message);
    if (!match) return null;
    return { used: Number(match[1]), paid: Number(match[2]) };
}

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
    /** direct_target: la sede è un target diretto — l'Edge scrive enabled=false.
     *  group_emptied: la sede è l'ultimo membro di un gruppo puntato dalla
     *  regola — nessuna scrittura, la portata zero è derivata (§33.7): la
     *  regola resta enabled=true e torna operativa da sola se il gruppo si
     *  ripopola. */
    cause: "direct_target" | "group_emptied";
}

export interface ActivityDeleteImpact {
    /** Regole di Programmazione la cui portata diventa zero eliminando questa
     *  sede — vedi `cause` su ogni riga per la differenza fra le due (§33.7). */
    schedulesGoingDraft: ActivityDeleteImpactSchedule[];
}

type CandidateScheduleJoin = {
    id: string;
    name: string | null;
    rule_type: "catalog" | "featured";
    enabled: boolean;
    apply_to_all: boolean;
    tenant_id: string;
};

/**
 * Preview di sola lettura, da mostrare nel dialog di conferma PRIMA
 * dell'eliminazione — non tocca alcuna riga. Il conteggio effettivo
 * (`affected_schedules_disabled`) resta calcolato da `delete-business` al
 * momento del delete per il caso direct_target: race condition teorica fra
 * preview e conferma accettata (stesso principio di
 * `docs/patterns/delete-drawer.md` Pattern B). Il caso group_emptied non è
 * mai scritto da nessuno, quindi non ha analogo lato Edge da cui divergere.
 *
 * Usa la stessa definizione di portata del resolver e della lista
 * Programmazione (`ruleReachesAnyActivity`, `src/utils/scheduleReach.ts`):
 * una regola non-apply_to_all raggiunge una sede se ha un target activity che
 * esiste, o un target activity_group con almeno un membro. Qui si valuta la
 * portata DOPO la delete: l'activity eliminata non esiste più e i gruppi di
 * cui era l'unico membro restano a zero.
 */
export async function countActivityDeleteImpact(
    tenantId: string,
    activityId: string
): Promise<ActivityDeleteImpact> {
    const { data: memberRows, error: memberError } = await supabase
        .from("activity_group_members")
        .select("group_id")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId);

    if (memberError) throw memberError;

    const memberGroupIds = (memberRows ?? []).map(r => r.group_id);

    type TargetRow = {
        schedule_id: string;
        target_type: "activity" | "activity_group";
        target_id: string;
        schedule: CandidateScheduleJoin | CandidateScheduleJoin[] | null;
    };

    const targetSelect = `
        schedule_id,
        target_type,
        target_id,
        schedule:schedules!inner(id, name, rule_type, enabled, apply_to_all, tenant_id)
    `;

    // Schedule candidate: puntano questa sede direttamente, o puntano un
    // gruppo di cui questa sede è membro. Le altre non possono perdere
    // portata da questa delete. Due query separate (non un .or() con
    // filtro costruito a stringa): un target_id/group_id con virgole,
    // parentesi o apici romperebbe la sintassi del filtro PostgREST.
    const { data: directTargetRows, error: directTargetsError } = await supabase
        .from("schedule_targets")
        .select(targetSelect)
        .eq("target_type", "activity")
        .eq("target_id", activityId);

    if (directTargetsError) throw directTargetsError;

    let groupTargetRows: TargetRow[] = [];
    if (memberGroupIds.length > 0) {
        const { data, error: groupTargetsError } = await supabase
            .from("schedule_targets")
            .select(targetSelect)
            .eq("target_type", "activity_group")
            .in("target_id", memberGroupIds);

        if (groupTargetsError) throw groupTargetsError;
        groupTargetRows = (data ?? []) as TargetRow[];
    }

    const targetRows: TargetRow[] = [
        ...((directTargetRows ?? []) as TargetRow[]),
        ...groupTargetRows
    ];

    const candidates = new Map<string, CandidateScheduleJoin>();
    for (const row of targetRows) {
        const schedule = Array.isArray(row.schedule) ? (row.schedule[0] ?? null) : row.schedule;
        if (!schedule) continue;
        if (schedule.tenant_id !== tenantId) continue;
        if (!schedule.enabled || schedule.apply_to_all) continue;
        candidates.set(schedule.id, schedule);
    }

    if (candidates.size === 0) return { schedulesGoingDraft: [] };

    // Target COMPLETI delle schedule candidate (non solo quelli che toccano
    // questa sede/gruppo): una regola multi-target può avere altre sedi o
    // altri gruppi che la tengono viva.
    const scheduleIds = Array.from(candidates.keys());
    const { data: allTargets, error: allTargetsError } = await supabase
        .from("schedule_targets")
        .select("schedule_id, target_type, target_id")
        .in("schedule_id", scheduleIds);

    if (allTargetsError) throw allTargetsError;

    const targetsByScheduleId = new Map<string, { activityIds: string[]; groupIds: string[] }>();
    const referencedGroupIds = new Set<string>();
    for (const row of allTargets ?? []) {
        const entry = targetsByScheduleId.get(row.schedule_id) ?? { activityIds: [], groupIds: [] };
        if (row.target_type === "activity") {
            entry.activityIds.push(row.target_id);
        } else if (row.target_type === "activity_group") {
            entry.groupIds.push(row.target_id);
            referencedGroupIds.add(row.target_id);
        }
        targetsByScheduleId.set(row.schedule_id, entry);
    }

    // Conteggio membri ATTUALE (pre-delete) di ogni gruppo referenziato da
    // una schedule candidata — serve come base per il conteggio post-delete.
    const memberCountByGroupId = new Map<string, number>();
    if (referencedGroupIds.size > 0) {
        const { data: allMembers, error: allMembersError } = await supabase
            .from("activity_group_members")
            .select("group_id")
            .in("group_id", Array.from(referencedGroupIds));

        if (allMembersError) throw allMembersError;

        for (const row of allMembers ?? []) {
            memberCountByGroupId.set(row.group_id, (memberCountByGroupId.get(row.group_id) ?? 0) + 1);
        }
    }

    const memberGroupIdSet = new Set(memberGroupIds);
    const reachCtxAfterDelete = {
        activityExists: (id: string) => id !== activityId,
        groupMemberCount: (id: string) => {
            const current = memberCountByGroupId.get(id) ?? 0;
            return memberGroupIdSet.has(id) ? Math.max(0, current - 1) : current;
        }
    };

    const schedulesGoingDraft: ActivityDeleteImpactSchedule[] = [];
    for (const [id, schedule] of candidates) {
        const targets = targetsByScheduleId.get(id) ?? { activityIds: [], groupIds: [] };
        const reachesAfterDelete = ruleReachesAnyActivity(
            { applyToAll: false, activityIds: targets.activityIds, groupIds: targets.groupIds },
            reachCtxAfterDelete
        );
        if (reachesAfterDelete) continue;

        const cause: ActivityDeleteImpactSchedule["cause"] = targets.activityIds.includes(activityId)
            ? "direct_target"
            : "group_emptied";
        schedulesGoingDraft.push({ id, name: schedule.name, rule_type: schedule.rule_type, cause });
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
