import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Loader } from "@/components/ui/Loader/Loader";
import Text from "@/components/ui/Text/Text";
import { usePermissions } from "@/context/PermissionsContext";
import { InviteMemberForm } from "./InviteMemberForm";
import styles from "./InviteMemberDrawer.module.scss";

interface InviteMemberDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    onSuccess?: (newMembershipId: string) => void;
}

const FORM_ID = "invite-member-form";

export function InviteMemberDrawer({ open, onClose, tenantId, onSuccess }: InviteMemberDrawerProps) {
    const { permissions, loading: permissionsLoading } = usePermissions();
    const [saving, setSaving] = useState(false);

    const handleClose = () => {
        if (saving) return;
        onClose();
    };

    const handleSuccess = (newMembershipId: string) => {
        onSuccess?.(newMembershipId);
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={520}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Invita un membro
                    </Text>
                }
                footer={
                    <div className={styles.footer}>
                        <Button variant="secondary" onClick={handleClose} disabled={saving}>
                            Annulla
                        </Button>
                        <Button
                            type="submit"
                            form={FORM_ID}
                            variant="primary"
                            loading={saving}
                            disabled={!permissions}
                        >
                            Invia invito
                        </Button>
                    </div>
                }
            >
                {permissionsLoading || !permissions ? (
                    <div className={styles.loadingState}>
                        <Loader size="md" />
                    </div>
                ) : (
                    <InviteMemberForm
                        formId={FORM_ID}
                        tenantId={tenantId}
                        permissions={permissions}
                        onSuccess={handleSuccess}
                        onSavingChange={setSaving}
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
