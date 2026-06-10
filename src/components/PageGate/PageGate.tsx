import { useParams, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { usePlanFeatures } from "@/lib/planFeatures";
import {
    canDoOnActivity,
    canDoOnAnyActivity,
    isOwnerOrAdmin
} from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";
import styles from "./PageGate.module.scss";

interface PageGateProps {
    /** Plan feature required (e.g. "table_ordering"). Omit if no plan gate. */
    feature?: PlanFeature;
    /** Permission ID required to view the page (e.g. "orders.read"). */
    readPermission: string;
    /**
     * Activity ID for activity-scoped permissions.
     * Provided → canDoOnActivity(readPermission, activityId).
     * Omitted/null → canDoOnAnyActivity(readPermission).
     */
    activityId?: string | null;
    children: (props: { canEdit: boolean }) => React.ReactNode;
}

/**
 * Composable page-level gate for the three access axes (§1 permissions-matrix):
 *
 *   1. Plan  — activity_has_feature (UX via usePlanFeatures)
 *   2. Permission — has_permission (via usePermissions + lib/permissions)
 *   3. Billing — useSubscriptionGuard.canEdit passed to children
 *
 * Precedence: plan check fires first (blocks all roles), then permission.
 * Billing is NOT a full-page block; SubscriptionBanner in MainLayout covers
 * it globally. canEdit is forwarded to children so they can disable mutations.
 *
 * Plan-locked CTA: "Passa a Pro" is shown ONLY to owner/admin (billing-capable
 * roles). Other roles see a generic "no access" message instead.
 */
export function PageGate({ feature, readPermission, activityId, children }: PageGateProps) {
    const { businessId } = useParams<{ businessId: string }>();
    const navigate = useNavigate();
    const { hasFeature } = usePlanFeatures();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const { canEdit } = useSubscriptionGuard();

    // ── Axis 1: Plan ─────────────────────────────────────────────────────────
    // usePlanFeatures is loading-optimistic (returns true while plan unknown),
    // so this block only fires when the plan is definitively insufficient.
    if (feature && !hasFeature(feature)) {
        const billingCapable = permissions != null ? isOwnerOrAdmin(permissions) : false;

        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title={
                        billingCapable
                            ? "Questa funzione richiede il piano Pro"
                            : "Non hai accesso a questa funzione"
                    }
                    description={
                        billingCapable
                            ? "Disponibile con il piano Pro."
                            : "Contatta il proprietario o un amministratore per abilitare questa funzione."
                    }
                    action={
                        billingCapable ? (
                            <Button
                                variant="primary"
                                onClick={() =>
                                    navigate(`/business/${businessId}/subscription`)
                                }
                            >
                                Passa a Pro
                            </Button>
                        ) : undefined
                    }
                />
            </div>
        );
    }

    // ── Axis 2: Permission ────────────────────────────────────────────────────
    // Wait for PermissionsProvider before blocking. While loading, fall through
    // so children can render their own loading skeletons.
    if (!permissionsLoading && permissions != null) {
        const canRead = activityId
            ? canDoOnActivity(permissions, readPermission, activityId)
            : canDoOnAnyActivity(permissions, readPermission);

        if (!canRead) {
            return (
                <div className={styles.lockedWrap}>
                    <EmptyState
                        icon={<Lock size={40} strokeWidth={1.5} />}
                        title="Non hai accesso a questa sezione"
                        description="Contatta il proprietario o un amministratore per ottenere l'accesso."
                    />
                </div>
            );
        }
    }

    // ── Axis 3: Billing ───────────────────────────────────────────────────────
    // No full-page block: SubscriptionBanner at MainLayout level communicates
    // the subscription state. Forward canEdit so children can disable mutations.
    return <>{children({ canEdit })}</>;
}
