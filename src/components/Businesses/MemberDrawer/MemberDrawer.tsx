import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Loader } from "@/components/ui/Loader/Loader";
import Text from "@/components/ui/Text/Text";
import { usePermissions } from "@/context/PermissionsContext";
import type { TenantMemberRow } from "@/types/team";
import { MemberForm } from "./MemberForm";
import styles from "./MemberDrawer.module.scss";

interface MemberDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    member: TenantMemberRow | null;
    onSuccess?: () => void;
}

const FORM_ID = "member-form";

export function MemberDrawer({ open, onClose, tenantId, member, onSuccess }: MemberDrawerProps) {
    const { permissions, loading: permissionsLoading } = usePermissions();
    const [saving, setSaving] = useState(false);

    const handleClose = () => {
        if (saving) return;
        onClose();
    };

    const handleSuccess = () => {
        onSuccess?.();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={520}>
            <DrawerLayout
                header={
                    <div className={styles.header}>
                        <Text variant="title-sm" weight={700}>
                            Gestisci accessi
                        </Text>
                        {member?.email && (
                            <Text variant="body-sm" colorVariant="muted">
                                {member.email}
                            </Text>
                        )}
                    </div>
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
                            disabled={!permissions || !member}
                        >
                            Salva
                        </Button>
                    </div>
                }
            >
                {!member || permissionsLoading || !permissions ? (
                    <div className={styles.loadingState}>
                        <Loader size="md" />
                    </div>
                ) : (
                    <MemberForm
                        formId={FORM_ID}
                        tenantId={tenantId}
                        permissions={permissions}
                        member={member}
                        onSuccess={handleSuccess}
                        onSavingChange={setSaving}
                    />
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
