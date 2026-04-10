import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { IconAlertTriangle, IconCheck, IconShieldOff, IconUser } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { TextInput } from "@/components/ui/Input/TextInput";
import { signOut } from "@/services/supabase/auth";
import {
    deleteAccount,
    listActiveTenantMembers,
    listUserTenantsForDeletion,
    type DeleteAccountAction,
    type TenantMember
} from "@/services/supabase/account";
import type { V2Tenant } from "@/types/tenant";
import styles from "./DeleteAccountDrawer.module.scss";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionType = "lock" | "transfer";

interface TenantDecision {
    action: ActionType;
    newOwnerUserId: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
    open: boolean;
    onClose: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeleteAccountDrawer({ open, onClose }: Props) {
    const navigate = useNavigate();
    const { user } = useAuth();

    // -- State ---------------------------------------------------------------
    const [ownedTenants, setOwnedTenants] = useState<V2Tenant[]>([]);
    const [memberTenants, setMemberTenants] = useState<V2Tenant[]>([]);
    const [tenantsLoading, setTenantsLoading] = useState(false);
    const [decisions, setDecisions] = useState<Record<string, TenantDecision>>({});
    const [membersByTenant, setMembersByTenant] = useState<Record<string, TenantMember[]>>({});
    const [membersLoading, setMembersLoading] = useState(false);
    const [confirmation, setConfirmation] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasOwnedTenants = ownedTenants.length > 0;

    // -- Load tenants and reset state on open --------------------------------
    useEffect(() => {
        if (!open) return;

        setConfirmation("");
        setError(null);
        setSuccess(false);
        setDecisions({});
        setMembersByTenant({});
        setTenantsLoading(true);

        listUserTenantsForDeletion()
            .then(({ owned, member }) => {
                setOwnedTenants(owned);
                setMemberTenants(member);

                const initial: Record<string, TenantDecision> = {};
                owned.forEach(t => {
                    initial[t.id] = { action: "lock", newOwnerUserId: "" };
                });
                setDecisions(initial);

                if (owned.length === 0) return;

                // Load members for all owned tenants in parallel
                setMembersLoading(true);
                const memberResult: Record<string, TenantMember[]> = {};
                const callerId = user?.id ?? "";
                Promise.allSettled(
                    owned.map(async t => {
                        try {
                            memberResult[t.id] = await listActiveTenantMembers(t.id, callerId);
                        } catch {
                            memberResult[t.id] = [];
                        }
                    })
                ).then(() => {
                    setMembersByTenant(memberResult);
                    setMembersLoading(false);
                });
            })
            .catch(() => {
                setOwnedTenants([]);
                setMemberTenants([]);
            })
            .finally(() => setTenantsLoading(false));
    }, [open]);

    // -- Validation ----------------------------------------------------------
    const confirmationValid = confirmation === "ELIMINA";
    const confirmationTouched = confirmation.length > 0;

    const decisionsValid = ownedTenants.every(t => {
        const d = decisions[t.id];
        if (!d) return false;
        if (d.action === "transfer") return d.newOwnerUserId !== "";
        return true;
    });

    const isFormValid = confirmationValid && decisionsValid;

    // -- Handlers ------------------------------------------------------------
    const setAction = useCallback((tenantId: string, action: ActionType) => {
        setDecisions(prev => ({
            ...prev,
            [tenantId]: { action, newOwnerUserId: "" }
        }));
    }, []);

    const setNewOwner = useCallback((tenantId: string, userId: string) => {
        setDecisions(prev => ({
            ...prev,
            [tenantId]: { ...prev[tenantId], newOwnerUserId: userId }
        }));
    }, []);

    const handleSubmit = async () => {
        if (!isFormValid) return;
        setIsSubmitting(true);
        setError(null);

        const actions: DeleteAccountAction[] = ownedTenants.map(t => {
            const d = decisions[t.id];
            if (d.action === "transfer") {
                return {
                    tenant_id: t.id,
                    action: "transfer",
                    new_owner_user_id: d.newOwnerUserId
                };
            }
            return { tenant_id: t.id, action: "lock" };
        });

        try {
            await deleteAccount(actions);
            setSuccess(true);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await signOut();
            navigate("/login");
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Errore imprevisto. Riprova.";
            setError(message);
            setIsSubmitting(false);
        }
    };

    // -- Render --------------------------------------------------------------
    return (
        <SystemDrawer open={open} onClose={onClose}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            Eliminazione account
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Questa azione è irreversibile dopo 30 giorni
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
                            Annulla
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleSubmit}
                            loading={isSubmitting && !success}
                            disabled={!isFormValid || isSubmitting}
                        >
                            {success ? (
                                <span className={styles.successLabel}>
                                    <IconCheck size={14} />
                                    Account eliminato
                                </span>
                            ) : isSubmitting ? (
                                "Eliminazione in corso…"
                            ) : (
                                "Elimina definitivamente"
                            )}
                        </Button>
                    </>
                }
            >
                <div className={styles.body}>
                    {/* Error banner — shown at the top so it's immediately visible */}
                    {error && (
                        <div className={styles.errorBanner}>
                            <IconShieldOff size={16} />
                            <Text variant="body-sm">
                                Errore durante l'eliminazione. Riprova.
                            </Text>
                        </div>
                    )}

                    {/* Warning block 1 — what will happen */}
                    <div className={styles.warningBlock}>
                        <IconAlertTriangle size={20} className={styles.warningIcon} />
                        <div className={styles.warningText}>
                            <Text variant="body-sm" weight={600}>
                                Stai per eliminare il tuo account.
                            </Text>
                            <Text variant="body-sm">
                                Tutti i tuoi cataloghi, prodotti e dati verranno rimossi o
                                trasferiti. Avrai 30 giorni per recuperare l'account prima della
                                cancellazione definitiva.
                            </Text>
                        </div>
                    </div>

                    {/* Warning block 2 — consequences */}
                    <div className={styles.consequencesBlock}>
                        <Text variant="body-sm" weight={600}>
                            Questa azione:
                        </Text>
                        <ul className={styles.consequencesList}>
                            <li>non può essere annullata dopo 30 giorni</li>
                            <li>eliminerà tutti i dati associati all'account</li>
                        </ul>
                    </div>

                    {/* Tenant section */}
                    <div>
                        <Text
                            variant="caption"
                            weight={600}
                            style={{ display: "block", marginBottom: "0.5rem" }}
                        >
                            Le tue attività
                        </Text>
                        {tenantsLoading ? (
                            <div className={styles.skeletonItem} />
                        ) : hasOwnedTenants ? (
                            <div className={styles.tenantList}>
                                {membersLoading
                                    ? ownedTenants.map(t => (
                                          <div key={t.id} className={styles.skeletonItem} />
                                      ))
                                    : ownedTenants.map(t => (
                                          <OwnedTenantCard
                                              key={t.id}
                                              tenant={t}
                                              decision={
                                                  decisions[t.id] ?? {
                                                      action: "lock",
                                                      newOwnerUserId: ""
                                                  }
                                              }
                                              members={membersByTenant[t.id] ?? []}
                                              disabled={isSubmitting}
                                              onActionChange={action => setAction(t.id, action)}
                                              onOwnerChange={userId => setNewOwner(t.id, userId)}
                                          />
                                      ))}

                                {memberTenants.map(t => (
                                    <MemberTenantCard key={t.id} tenant={t} />
                                ))}
                            </div>
                        ) : (
                            <Text variant="body-sm" colorVariant="muted">
                                Non possiedi attività.
                            </Text>
                        )}
                    </div>

                    {/* Confirmation input */}
                    <div className={styles.confirmSection}>
                        <TextInput
                            label='Scrivi ELIMINA per confermare'
                            value={confirmation}
                            onChange={e => setConfirmation(e.target.value)}
                            placeholder="ELIMINA"
                            disabled={isSubmitting}
                            aria-label="Conferma eliminazione account"
                            error={
                                confirmationTouched && !confirmationValid
                                    ? "Il testo inserito non corrisponde"
                                    : undefined
                            }
                        />
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type OwnedTenantCardProps = {
    tenant: V2Tenant;
    decision: TenantDecision;
    members: TenantMember[];
    disabled?: boolean;
    onActionChange: (action: ActionType) => void;
    onOwnerChange: (userId: string) => void;
};

function OwnedTenantCard({
    tenant,
    decision,
    members,
    disabled,
    onActionChange,
    onOwnerChange
}: OwnedTenantCardProps) {
    return (
        <div className={styles.tenantItem}>
            <div className={styles.tenantHeader}>
                <div className={styles.tenantMeta}>
                    <span className={styles.tenantName}>{tenant.name}</span>
                    <span className={styles.tenantRole}>
                        Puoi trasferire la proprietà oppure eliminarla
                    </span>
                </div>
                <span className={`${styles.badge} ${styles.badgeOwner}`}>
                    <IconUser size={10} />
                    Proprietario
                </span>
            </div>

            <div className={styles.tenantActions}>
                <div className={styles.actionSelector}>
                    <label
                        className={`${styles.actionOption} ${decision.action === "lock" ? styles.selected : ""} ${disabled ? styles.disabled : ""}`}
                    >
                        <input
                            type="radio"
                            name={`action-${tenant.id}`}
                            value="lock"
                            checked={decision.action === "lock"}
                            onChange={() => onActionChange("lock")}
                            disabled={disabled}
                        />
                        <span className={styles.actionLabel}>Elimina attività</span>
                    </label>

                    <label
                        className={`${styles.actionOption} ${decision.action === "transfer" ? styles.selected : ""} ${disabled ? styles.disabled : ""}`}
                    >
                        <input
                            type="radio"
                            name={`action-${tenant.id}`}
                            value="transfer"
                            checked={decision.action === "transfer"}
                            onChange={() => onActionChange("transfer")}
                            disabled={disabled}
                        />
                        <span className={styles.actionLabel}>Trasferisci proprietà</span>
                    </label>
                </div>

                {decision.action === "transfer" && (
                    <div className={styles.transferSelect}>
                        {members.length > 0 ? (
                            <Select
                                label="Nuovo proprietario"
                                value={decision.newOwnerUserId}
                                onChange={e => onOwnerChange(e.target.value)}
                                disabled={disabled}
                                error={
                                    decision.newOwnerUserId === ""
                                        ? "Seleziona un nuovo proprietario"
                                        : undefined
                                }
                            >
                                <option value="">Seleziona un membro…</option>
                                {members.map(m => (
                                    <option key={m.userId} value={m.userId}>
                                        {m.email && m.email !== m.displayName
                                            ? `${m.displayName} — ${m.email}`
                                            : m.displayName}
                                    </option>
                                ))}
                            </Select>
                        ) : (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessun membro attivo a cui trasferire la proprietà. Invita un
                                membro prima di procedere, oppure scegli "Elimina attività".
                            </Text>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function MemberTenantCard({ tenant }: { tenant: V2Tenant }) {
    return (
        <div className={styles.tenantItem}>
            <div className={styles.tenantHeader}>
                <div className={styles.tenantMeta}>
                    <span className={styles.tenantName}>{tenant.name}</span>
                    <span className={styles.tenantRole}>
                        {tenant.user_role === "admin" ? "Amministratore" : "Membro"}
                    </span>
                </div>
                <span className={`${styles.badge} ${styles.badgeMember}`}>Sarai rimosso</span>
            </div>
            <div className={styles.tenantMemberInfo}>
                <Text variant="caption" colorVariant="muted">
                    Verrai rimosso automaticamente da questa attività.
                </Text>
            </div>
        </div>
    );
}
