import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { Badge } from "@/components/ui/Badge/Badge";
import { useToast } from "@/context/Toast/ToastContext";
import type { TenantMemberRow } from "@/types/team";
import styles from "./MemberDrawer.module.scss";

const ROLE_OPTIONS = [
    { value: "member", label: "Member" },
    { value: "admin", label: "Admin" }
];

type Props = {
    open: boolean;
    member: TenantMemberRow | null;
    tenantId: string;
    onClose: () => void;
    onSuccess: () => void;
};

export function MemberDrawer({ open, member, tenantId, onClose, onSuccess }: Props) {
    const { showToast } = useToast();
    const [pendingRole, setPendingRole] = useState("member");
    const [isSaving, setIsSaving] = useState(false);

    // Reinitialize role selection whenever target member changes
    useEffect(() => {
        if (member) {
            setPendingRole(member.role === "owner" ? "admin" : member.role);
        }
    }, [member]);

    const safeClose = useCallback(() => {
        if (!isSaving) onClose();
    }, [isSaving, onClose]);

    const handleSave = useCallback(async () => {
        if (!member || !tenantId) return;
        setIsSaving(true);

        const { error } = await supabase.rpc("change_member_role", {
            p_tenant_id: tenantId,
            p_user_id: member.user_id,
            p_role: pendingRole
        });

        setIsSaving(false);

        if (error) {
            showToast({ type: "error", message: `Errore: ${error.message}` });
            return;
        }

        showToast({ type: "success", message: "Ruolo aggiornato." });
        onSuccess();
        onClose();
    }, [member, tenantId, pendingRole, showToast, onSuccess, onClose]);

    const roleBadgeVariant = member?.role === "admin" ? "primary" : "secondary";
    const roleLabel =
        member?.role === "owner" ? "Owner" : member?.role === "admin" ? "Admin" : "Member";

    return (
        <SystemDrawer open={open} onClose={safeClose} width={440}>
            <DrawerLayout
                header={
                    <div className={styles.header}>
                        <Text variant="title-sm" weight={700}>
                            Modifica membro
                        </Text>
                        {member?.email && (
                            <Text variant="body-sm" colorVariant="muted">
                                {member.email}
                            </Text>
                        )}
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={safeClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" onClick={handleSave} loading={isSaving}>
                            Salva
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    <div className={styles.currentRole}>
                        <Text variant="body-sm" colorVariant="muted">
                            Ruolo attuale
                        </Text>
                        <Badge variant={roleBadgeVariant}>{roleLabel}</Badge>
                    </div>

                    <Select
                        label="Nuovo ruolo"
                        value={pendingRole}
                        onChange={e => setPendingRole(e.target.value)}
                        options={ROLE_OPTIONS}
                        disabled={isSaving}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
