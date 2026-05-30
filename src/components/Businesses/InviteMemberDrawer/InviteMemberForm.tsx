import { useCallback, useEffect, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import { useToast } from "@/context/Toast/ToastContext";
import { TextInput } from "@/components/ui/Input/TextInput";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import {
    canInviteRole,
    isOwnerOrAdmin,
    type UserPermissions,
    type UserRole
} from "@/lib/permissions";
import { RoleSelector } from "./components/RoleSelector";
import { ActivityMultiSelect } from "./components/ActivityMultiSelect";
import styles from "./InviteMemberForm.module.scss";

interface InviteMemberFormProps {
    formId: string;
    tenantId: string;
    permissions: UserPermissions;
    onSuccess: (newMembershipId: string) => void;
    onSavingChange: (saving: boolean) => void;
}

const ALL_ROLES: UserRole[] = ["admin", "manager", "staff", "viewer"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapRpcError(error: PostgrestError): string {
    const msg = error.message ?? "";
    if (msg.includes("user already member")) return "Questo utente è già membro dell'azienda.";
    if (msg.includes("invite already pending"))
        return "Esiste già un invito pendente per questa email.";
    if (error.code === "42501") return "Permesso negato per questa operazione.";
    if (error.code === "22023") return msg || "Dati non validi.";
    if (error.code === "44000") return msg || "Risorsa non trovata.";
    return `Errore: ${msg || "operazione fallita"}`;
}

export function InviteMemberForm({
    formId,
    tenantId,
    permissions,
    onSuccess,
    onSavingChange
}: InviteMemberFormProps) {
    const { showToast } = useToast();

    const [email, setEmail] = useState("");
    const [role, setRole] = useState<UserRole | null>(null);
    const [activityIds, setActivityIds] = useState<string[]>([]);
    const [touched, setTouched] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const availableRoles = ALL_ROLES.filter(r => canInviteRole(permissions, r));
    const callerIsTenantWide = isOwnerOrAdmin(permissions);

    // Reset activityIds quando il ruolo passa da scoped → admin (admin non accetta sedi)
    useEffect(() => {
        if (role === "admin" && activityIds.length > 0) {
            setActivityIds([]);
        }
    }, [role, activityIds.length]);

    const validate = useCallback((): string | null => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return "L'email è obbligatoria.";
        if (!EMAIL_REGEX.test(trimmed)) return "Email non valida.";
        if (!role) return "Seleziona un ruolo.";
        if (role !== "admin" && activityIds.length === 0)
            return "Seleziona almeno una sede.";
        return null;
    }, [email, role, activityIds.length]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        setSubmitError(null);

        const validationError = validate();
        if (validationError) {
            setSubmitError(validationError);
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const finalRole = role as UserRole; // validate() garantisce non-null
        const finalActivityIds = finalRole === "admin" ? null : activityIds;

        try {
            setSaving(true);
            onSavingChange(true);

            const { data, error } = await supabase.rpc("invite_tenant_member", {
                p_tenant_id: tenantId,
                p_email: normalizedEmail,
                p_role: finalRole,
                p_activity_ids: finalActivityIds
            });

            if (error) {
                setSubmitError(mapRpcError(error));
                return;
            }

            const newMembershipId = typeof data === "string" ? data : "";
            showToast({ type: "success", message: "Invito inviato con successo." });
            onSuccess(newMembershipId);
        } catch (err) {
            console.error("[InviteMemberForm] invite failed:", err);
            setSubmitError("Errore durante l'invio dell'invito.");
        } finally {
            setSaving(false);
            onSavingChange(false);
        }
    };

    const showActivities = role !== null && role !== "admin";
    const activitiesError =
        touched && showActivities && activityIds.length === 0 ? "Almeno una sede richiesta." : undefined;

    return (
        <form id={formId} onSubmit={handleSubmit} className={styles.form} noValidate>
            <TextInput
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="es. utente@esempio.com"
                disabled={saving}
                required
                autoFocus
            />

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
