// Who gets told, on the venue side, when something happens to a reservation.
//
// Extracted from `submit-reservation`, where it lived inline, once a second
// caller appeared: `cancel-reservation-public` must reach exactly the same
// people when a diner cancels. Two copies of a recipient policy is how a venue
// ends up hearing about new bookings but not about cancellations.
//
// Requires a service_role client: step 2 reads `tenants` and the auth admin
// API, neither of which is reachable under an anon or user JWT.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RecipientSource = "per_site" | "owner";

export interface ResolvedRecipients {
    emails: string[];
    source: RecipientSource;
}

export interface AlertRecipientActivity {
    tenant_id: string;
    reservation_notification_emails: string[] | null;
}

/**
 * Resolve the venue alert recipients in priority order:
 *
 *   1. `activities.reservation_notification_emails` — when non-empty, the
 *      caller sends one separate email per recipient (no BCC) so they do
 *      not see each other.
 *   2. Tenant owner email via `tenants.owner_user_id` → `auth.users`.
 *
 * Returns null when no recipient is resolvable. Callers skip the alert and log
 * a warning; nothing here throws, because a missing recipient must never take
 * down the operation that triggered the alert.
 *
 * @param logPrefix Tag used in the error logs, e.g. "submit-reservation".
 */
export async function resolveAlertRecipients(
    supabase: SupabaseClient,
    activity: AlertRecipientActivity,
    logPrefix: string
): Promise<ResolvedRecipients | null> {
    // 1. Per-site explicit list. Trim, drop empties, dedup case-insensitive.
    const rawList = activity.reservation_notification_emails ?? [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of rawList) {
        const trimmed = (raw ?? "").trim();
        if (trimmed.length === 0) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(trimmed);
    }
    if (cleaned.length > 0) return { emails: cleaned, source: "per_site" };

    // 2. Tenant owner email via service_role admin API.
    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("owner_user_id")
        .eq("id", activity.tenant_id)
        .maybeSingle();

    if (tenantError) {
        console.error(`[${logPrefix}] tenant lookup failed:`, tenantError);
        return null;
    }
    if (!tenant?.owner_user_id) return null;

    const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(
        tenant.owner_user_id as string
    );
    if (ownerError) {
        console.error(`[${logPrefix}] owner lookup failed:`, ownerError);
        return null;
    }
    const ownerEmail = ownerData?.user?.email;
    if (!ownerEmail) return null;

    return { emails: [ownerEmail], source: "owner" };
}
