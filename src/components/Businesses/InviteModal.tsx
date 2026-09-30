import { useState } from "react";
import { acceptInviteByToken, declineInviteByToken } from "@/services/supabase/team";
import { ROLE_LABEL } from "@/constants/roles";
import type { EffectiveRole } from "@/types/team";
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
    effective_role: string;
    tenant_id: string;
    tenant_name: string;
    inviter_email: string | null;
    activity_names: string[];
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

        let tenantId: string | null;
        try {
            tenantId = await acceptInviteByToken(invite.invite_token);
        } catch (err) {
            setAccepting(false);
            const message = (err as { message?: string })?.message ?? "";
            const msg = message.includes("invite expired")
                ? "Il link di invito è scaduto. Chiedi un nuovo invito."
                : message.includes("already accepted")
                ? "Hai già accettato questo invito."
                : "Impossibile accettare l'invito.";
            showToast({ type: "error", message: msg });
            return;
        }
        setAccepting(false);

        showToast({ type: "success", message: "Invito accettato. Benvenuto nel team!" });
        onAccepted(tenantId ?? invite.tenant_id);
    };

    const handleDecline = async () => {
        if (!invite) return;
        setDeclining(true);

        try {
            await declineInviteByToken(invite.invite_token);
        } catch {
            setDeclining(false);
            showToast({ type: "error", message: "Impossibile rifiutare l'invito." });
            return;
        }
        setDeclining(false);

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
                            <Text variant="body-sm" colorVariant="muted">Attività</Text>
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
                                {ROLE_LABEL[invite.effective_role as EffectiveRole] ?? invite.effective_role}
                            </Text>
                        </div>
                        <div className={styles.row}>
                            <Text variant="body-sm" colorVariant="muted">Sedi</Text>
                            <Text variant="body" weight={600}>
                                {invite.effective_role === "admin"
                                    ? "Tutte le sedi"
                                    : invite.activity_names.length === 0
                                        ? "—"
                                        : invite.activity_names.join(", ")}
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
