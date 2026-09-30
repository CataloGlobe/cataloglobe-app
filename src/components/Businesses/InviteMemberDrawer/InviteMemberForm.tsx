import { useCallback, useEffect, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { inviteTenantMember } from "@/services/supabase/team";
import { useToast } from "@/context/Toast/ToastContext";
import { TextInput } from "@/components/ui/Input/TextInput";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import {
    canInviteRole,
    isOwnerOrAdmin,
    type UserPermissions,
    type UserRole
} from "@/lib/permissions";
import { RoleSelector } from "@/components/ui/RoleSelector/RoleSelector";
import { ActivityMultiSelect } from "@/components/ui/ActivityMultiSelect/ActivityMultiSelect";
import styles from "./InviteMemberForm.module.scss";

interface InviteMemberFormProps {
    formId: string;
    tenantId: string;
    permissions: UserPermissions;
    /** Sedi assegnabili dal caller (tutte per owner/admin, le sue per un
     *  manager). `null` = sconosciuto: nessun ruolo viene bloccato. La conta
     *  la pagina, che le sedi le ha già; `ActivityMultiSelect` carica la
     *  lista per conto suo. */
    activityCount: number | null;
    onSuccess: (newMembershipId: string) => void;
    onSavingChange: (saving: boolean) => void;
}

const ALL_ROLES: UserRole[] = ["admin", "manager", "staff", "viewer"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapRpcError(error: PostgrestError): string {
    const msg = error.message ?? "";
    if (msg.includes("user already member")) return "Questo utente è già membro dell'azienda.";
    if (msg.includes("invite already pending"))
        return "Esiste già un invito in attesa per questa email.";
    if (error.code === "42501") return "Permesso negato.";
    if (error.code === "22023") return msg || "Dati non validi.";
    if (error.code === "44000") return msg || "Risorsa non trovata.";
    return `Errore: ${msg || "operazione fallita"}`;
}

export function InviteMemberForm({
    formId,
    tenantId,
    permissions,
    activityCount,
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
    // Nessuna sede assegnabile: i ruoli scoped (manager/staff/viewer) non hanno
    // sedi su cui essere applicati → solo Admin invitabile.
    const callerIsTenantWide = isOwnerOrAdmin(permissions);
    const noActivities = activityCount === 0;

    const invitableRoles = ALL_ROLES.filter(r => canInviteRole(permissions, r));
    const availableRoles = noActivities
        ? invitableRoles.filter(r => r === "admin")
        : invitableRoles;

    // Reset activityIds quando il ruolo passa da scoped → admin (admin non accetta sedi)
    useEffect(() => {
        if (role === "admin" && activityIds.length > 0) {
            setActivityIds([]);
        }
    }, [role, activityIds.length]);

    // Senza sedi, un ruolo scoped eventualmente selezionato (incl. default) va
    // azzerato per non lasciare un radio selezionato-ma-disabilitato.
    useEffect(() => {
        if (noActivities && role !== null && role !== "admin") {
            setRole(null);
        }
    }, [noActivities, role]);

    const validate = useCallback((): string | null => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return "L'email è obbligatoria.";
        if (!EMAIL_REGEX.test(trimmed)) return "Email non valida.";
        if (!role) return "Scegli un ruolo.";
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
        const finalRole = role as Exclude<UserRole, "owner">; // validate() garantisce non-null
        const finalActivityIds = finalRole === "admin" ? null : activityIds;

        try {
            setSaving(true);
            onSavingChange(true);

            const newMembershipId = await inviteTenantMember(
                tenantId,
                normalizedEmail,
                finalRole,
                finalActivityIds
            );
            showToast({ type: "success", message: `Invito inviato a ${normalizedEmail}.` });
            onSuccess(newMembershipId);
        } catch (err) {
            console.error("[InviteMemberForm] invite failed:", err);
            const error = err as PostgrestError;
            setSubmitError(error?.message || error?.code ? mapRpcError(error) : "Errore durante l'invio dell'invito.");
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
                placeholder="es. nome@locale.it"
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

            {noActivities && (
                <InlineBanner variant="info">
                    Questa azienda non ha ancora sedi. Crea una sede per assegnare
                    ruoli specifici (Manager, Staff, Sola lettura). Senza sedi puoi
                    invitare solo un amministratore, con accesso a tutte le sedi.
                </InlineBanner>
            )}

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
