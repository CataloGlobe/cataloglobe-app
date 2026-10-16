// Argomenti della RPC `public.notify` (motore delle notifiche, mig 20261015010000).
//
// Modulo puro, zero import: lo usano `_shared/notify.ts` (edge) e i test
// vitest via `@shared/notifyArgs`. Le regole dei destinatari sono le stesse
// che `notify` legge in SQL: tenerle allineate.

export interface NotifyRecipients {
    /** Utenti precisi. */
    users?: string[];
    /** Owner di `tenantId`. */
    tenantOwner?: boolean;
    /** Owner e/o membri attivi di `tenantId` con questi ruoli ("owner", "admin", ...). */
    tenantRoles?: string[];
    /** Owner + tutti i membri attivi di `tenantId`. */
    tenantMembers?: boolean;
    /** Chi ha un permesso sulla sede (`get_users_with_activity_permission`). */
    activityPermission?: { permission: string; activityId: string };
    /** Tolti alla fine (es. chi ha fatto l'azione). */
    exclude?: string[];
}

export interface NotifyInput {
    eventType: string;
    recipients: NotifyRecipients;
    tenantId?: string | null;
    /** Dati della riga e valori dei segnaposto `{chiave}` dei modelli. */
    data?: Record<string, unknown>;
    /** Stesso avviso, stessa chiave: al secondo giro non si riscrive. */
    dedupeKey?: string | null;
    /** Riga con `tenant_id` NULL: campanella del Workspace. */
    accountScope?: boolean;
}

export interface NotifyRpcArgs {
    p_event_type: string;
    p_recipients: Record<string, unknown>;
    p_tenant_id: string | null;
    p_data: Record<string, unknown>;
    p_dedupe_key: string | null;
    p_account_scope: boolean;
}

export function buildNotifyArgs(input: NotifyInput): NotifyRpcArgs {
    const r = input.recipients;
    const recipients: Record<string, unknown> = {};

    if (r.users && r.users.length > 0) recipients.users = r.users;
    if (r.tenantOwner) recipients.tenant_owner = true;
    if (r.tenantRoles && r.tenantRoles.length > 0) recipients.tenant_roles = r.tenantRoles;
    if (r.tenantMembers) recipients.tenant_members = true;
    if (r.activityPermission) {
        recipients.activity_permission = {
            permission: r.activityPermission.permission,
            activity_id: r.activityPermission.activityId
        };
    }
    if (r.exclude && r.exclude.length > 0) recipients.exclude = r.exclude;

    return {
        p_event_type: input.eventType,
        p_recipients: recipients,
        p_tenant_id: input.tenantId ?? null,
        p_data: input.data ?? {},
        p_dedupe_key: input.dedupeKey ?? null,
        p_account_scope: input.accountScope ?? false
    };
}
