import type { BadgeVariant } from "@/components/ui/Badge/Badge";

/**
 * Human-readable labels for v2_tenant_memberships.status values.
 * Use MEMBER_STATUS_LABEL[member.status] ?? member.status as a safe fallback.
 */
export const MEMBER_STATUS_LABEL: Record<string, string> = {
    invited:  "Invitato",
    active:   "Attivo",
    left:     "Ha lasciato",
    pending:  "In attesa",
    declined: "Rifiutato",
    revoked:  "Annullato",
    expired:  "Scaduto",
};

/**
 * Badge variant for each v2_tenant_memberships.status value.
 * Use MEMBER_STATUS_BADGE[member.status] ?? "secondary" as a safe fallback.
 */
export const MEMBER_STATUS_BADGE: Record<string, BadgeVariant> = {
    invited:  "warning",
    active:   "success",
    left:     "secondary",
    pending:  "warning",
    declined: "danger",
    revoked:  "secondary",
    expired:  "secondary",
};
