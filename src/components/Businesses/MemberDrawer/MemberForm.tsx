import { useCallback, useEffect, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import { useToast } from "@/context/Toast/ToastContext";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { RoleSelector } from "@/components/ui/RoleSelector/RoleSelector";
import { ActivityMultiSelect } from "@/components/ui/ActivityMultiSelect/ActivityMultiSelect";
import {
    canChangeRoleOf,
    isOwnerOrAdmin,
    type UserPermissions,
    type UserRole
} from "@/lib/permissions";
import type { TenantMemberRow } from "@/types/team";
import styles from "./MemberForm.module.scss";

interface MemberFormProps {
    formId: string;
    tenantId: string;
    permissions: UserPermissions;
    member: TenantMemberRow;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
}

const ASSIGNABLE_ROLES: UserRole[] = ["admin", "manager", "staff", "viewer"];

function mapRpcError(error: PostgrestError): string {
    const msg = error.message ?? "";
    if (error.code === "42501") return "Permesso negato per questa operazione.";
    if (error.code === "44000") return msg || "Membership non trovata.";
    if (error.code === "22023") return msg || "Dati non validi.";
    return `Errore: ${msg || "operazione fallita"}`;
}

export function MemberForm({
    formId,
    tenantId,
    permissions,
    member,
    onSuccess,
    onSavingChange
}: MemberFormProps) {
    const { showToast } = useToast();

    const initialRole: UserRole =
        member.effective_role === "owner" ? "admin" : member.effective_role;

    const [role, setRole] = useState<UserRole>(initialRole);
    const [activityIds, setActivityIds] = useState<string[]>(member.activity_ids);
    const [touched, setTouched] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Re-init quando cambia il member target (drawer riusato per altro membro)
    useEffect(() => {
        setRole(member.effective_role === "owner" ? "admin" : member.effective_role);
        setActivityIds(member.activity_ids);
        setTouched(false);
        setSubmitError(null);
    }, [member.membership_id, member.effective_role, member.activity_ids]);

    // Reset activityIds quando passa a admin
    useEffect(() => {
        if (role === "admin" && activityIds.length > 0) {
            setActivityIds([]);
        }
    }, [role, activityIds.length]);

    // Filtra ruoli assegnabili: simuliamo "target con role=newRole" per usare
    // canChangeRoleOf come gating (manager non può promuovere a admin).
    const availableRoles = ASSIGNABLE_ROLES.filter(newRole =>
        canChangeRoleOf(permissions, { role: newRole, activityIds: [] })
    );

    const callerIsTenantWide = isOwnerOrAdmin(permissions);

    const validate = useCallback((): string | null => {
        if (!role) return "Seleziona un ruolo.";
        if (role !== "admin" && activityIds.length === 0)
            return "Seleziona almeno una sede.";
        return null;
    }, [role, activityIds.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        setSubmitError(null);

        const validationError = validate();
        if (validationError) {
            setSubmitError(validationError);
            return;
        }

        const finalActivityIds = role === "admin" ? null : activityIds;

        try {
            setSaving(true);
            onSavingChange(true);

            const { error } = await supabase.rpc("change_member_role", {
                p_membership_id: member.membership_id,
                p_new_role: role,
                p_activity_ids: finalActivityIds
            });

            if (error) {
                setSubmitError(mapRpcError(error));
                return;
            }

            showToast({ type: "success", message: "Accessi aggiornati." });
            onSuccess();
        } catch (err) {
            console.error("[MemberForm] change_member_role failed:", err);
            setSubmitError("Errore durante l'aggiornamento del ruolo.");
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };

    const showActivities = role !== "admin";
    const activitiesError =
        touched && showActivities && activityIds.length === 0 ? "Almeno una sede richiesta." : undefined;

    return (
        <form id={formId} onSubmit={handleSubmit} className={styles.form} noValidate>
            <RoleSelector
                value={role}
                onChange={setRole}
                availableRoles={availableRoles}
                disabled={saving}
            />

            {showActivities && (
                <ActivityMultiSelect
                    tenantId={tenantId}
                    callerScopedActivityIds={permissions.activityIds}
                    callerIsTenantWide={callerIsTenantWide}
                    value={activityIds}
                    onChange={setActivityIds}
                    disabled={saving}
                    error={activitiesError}
                />
            )}

            {submitError && <InlineBanner variant="error">{submitError}</InlineBanner>}
        </form>
    );
}
