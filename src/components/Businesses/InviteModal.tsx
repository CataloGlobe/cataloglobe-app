import { useState } from "react";
import { supabase } from "@/services/supabase/client";
import { useToast } from "@/context/Toast/ToastContext";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader,
} from "@/components/ui/ModalLayout/ModalLayout";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "./InviteModal.module.scss";

export type PendingInviteData = {
    id: string;
    invite_token: string;
    role: string;
    tenant_id: string;
    tenant_name: string;
    inviter_email: string | null;
};

type Props = {
    invite: PendingInviteData | null;
    onClose: () => void;
    onAccepted: (tenantId: string) => void;
    onDeclined: (inviteId: string) => void;
};

export function InviteModal({ invite, onClose, onAccepted, onDeclined }: Props) {
    const { showToast } = useToast();
    const [accepting, setAccepting] = useState(false);
    const [declining, setDeclining] = useState(false);

    const handleAccept = async () => {
        if (!invite) return;
        setAccepting(true);

        const { data: tenantId, error } = await supabase.rpc("accept_invite_by_token", {
            p_token: invite.invite_token,
        });

        setAccepting(false);

        if (error) {
            const msg = error.message?.includes("invite expired")
                ? "Il link di invito è scaduto. Chiedi un nuovo invito."
                : error.message?.includes("already accepted")
                ? "Hai già accettato questo invito."
                : "Impossibile accettare l'invito.";
            showToast({ type: "error", message: msg });
            return;
        }

        showToast({ type: "success", message: "Invito accettato. Benvenuto nel team!" });
        onAccepted(tenantId ?? invite.tenant_id);
    };

    const handleDecline = async () => {
        if (!invite) return;
        setDeclining(true);

        const { error } = await supabase.rpc("decline_invite_by_token", {
            p_token: invite.invite_token,
        });

        setDeclining(false);

        if (error) {
            showToast({ type: "error", message: "Impossibile rifiutare l'invito." });
            return;
        }

        showToast({ type: "success", message: "Invito rifiutato." });
        onDeclined(invite.id);
    };

    return (
        <ModalLayout isOpen={invite !== null} onClose={onClose} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text variant="title-sm" weight={600}>
                    Invito ricevuto
                </Text>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                {invite && (
                    <div className={styles.meta}>
                        <div className={styles.row}>
                            <Text variant="body-sm" colorVariant="muted">Azienda</Text>
                            <Text variant="body" weight={600}>{invite.tenant_name}</Text>
                        </div>
                        {invite.inviter_email && (
                            <div className={styles.row}>
                                <Text variant="body-sm" colorVariant="muted">Invitato da</Text>
                                <Text variant="body" weight={600}>{invite.inviter_email}</Text>
                            </div>
                        )}
                        <div className={styles.row}>
                            <Text variant="body-sm" colorVariant="muted">Ruolo</Text>
                            <Text variant="body" weight={600}>
                                {invite.role === "admin" ? "Admin" : "Member"}
                            </Text>
                        </div>
                    </div>
                )}
            </ModalLayoutContent>

            <ModalLayoutFooter>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDecline}
                    loading={declining}
                    disabled={accepting}
                >
                    Declina invito
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAccept}
                    loading={accepting}
                    disabled={declining}
                >
                    Accetta invito
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
