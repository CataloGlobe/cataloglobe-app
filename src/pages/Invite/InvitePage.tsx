import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./InvitePage.module.scss";

type InviteInfo = {
    tenant_id: string;
    tenant_name: string;
    role: string;
    status: string;
};

export default function InvitePage() {
    const { token } = useParams<{ token: string }>();
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [invite, setInvite] = useState<InviteInfo | null>(null);
    const [loadingInvite, setLoadingInvite] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (authLoading) return;

        // Not logged in — redirect to login preserving the invite URL
        if (!user) {
            const returnTo = encodeURIComponent(`/invite/${token}`);
            navigate(`/login?returnTo=${returnTo}`, { replace: true });
            return;
        }

        if (!token) {
            setNotFound(true);
            setLoadingInvite(false);
            return;
        }

        const fetchInvite = async () => {
            const { data, error } = await supabase.rpc("get_invite_info_by_token", {
                p_token: token
            });

            if (error) {
                console.error("[InvitePage] get_invite_info_by_token:", error);
                setNotFound(true);
                setLoadingInvite(false);
                return;
            }

            const row = Array.isArray(data) ? data[0] : data;
            if (!row) {
                setNotFound(true);
            } else {
                setInvite(row as InviteInfo);
            }
            setLoadingInvite(false);
        };

        fetchInvite();
    }, [authLoading, user, token, navigate]);

    const handleAccept = async () => {
        if (!token) return;
        setAccepting(true);

        const { error } = await supabase.rpc("accept_invite_by_token", {
            p_token: token
        });

        if (error) {
            console.error("[InvitePage] accept_invite_by_token:", error);
            showToast({
                type: "error",
                message: "Impossibile accettare l'invito. Il link potrebbe essere già stato usato."
            });
            setAccepting(false);
            return;
        }

        showToast({ type: "success", message: "Invito accettato. Benvenuto nel team!" });
        navigate("/workspace", { replace: true });
    };

    // Auth resolving
    if (authLoading) {
        return (
            <div className={styles.page}>
                <Text variant="body" colorVariant="muted">
                    Caricamento...
                </Text>
            </div>
        );
    }

    // Invite loading (user is logged in, fetch in progress)
    if (loadingInvite) {
        return (
            <div className={styles.page}>
                <Text variant="body" colorVariant="muted">
                    Caricamento invito...
                </Text>
            </div>
        );
    }

    // CASE 1 — invite not found or token missing
    if (notFound || !invite) {
        return (
            <div className={styles.page}>
                <Card className={styles.card}>
                    <div className={styles.header}>
                        <Text variant="title-md" weight={700}>
                            Link non valido
                        </Text>
                        <Text variant="body" colorVariant="muted">
                            Invalid or expired invite link.
                        </Text>
                    </div>
                    <Button variant="secondary" onClick={() => navigate("/workspace")}>
                        Vai al workspace
                    </Button>
                </Card>
            </div>
        );
    }

    // CASE 2 — already accepted
    if (invite.status === "active") {
        return (
            <div className={styles.page}>
                <Card className={styles.card}>
                    <div className={styles.header}>
                        <Text variant="title-md" weight={700}>
                            Invito già accettato
                        </Text>
                        <Text variant="body" colorVariant="muted">
                            This invite has already been accepted.
                        </Text>
                    </div>
                    <Button variant="primary" onClick={() => navigate("/workspace")}>
                        Vai al workspace
                    </Button>
                </Card>
            </div>
        );
    }

    // CASE 3 — valid pending invite
    return (
        <div className={styles.page}>
            <Card className={styles.card}>
                <div className={styles.header}>
                    <Text variant="title-md" weight={700}>
                        Sei stato invitato
                    </Text>
                    <Text variant="body" colorVariant="muted">
                        Hai ricevuto un invito per unirti al team.
                    </Text>
                </div>

                <div className={styles.meta}>
                    <Text variant="body-sm" colorVariant="muted">
                        Azienda
                    </Text>
                    <Text variant="body" weight={600}>
                        {invite.tenant_name}
                    </Text>

                    <Text variant="body-sm" colorVariant="muted">
                        Ruolo
                    </Text>
                    <Text variant="body" weight={600}>
                        {invite.role === "admin" ? "Admin" : "Member"}
                    </Text>
                </div>

                <div className={styles.actions}>
                    <Button
                        variant="primary"
                        fullWidth
                        loading={accepting}
                        onClick={handleAccept}
                    >
                        Accetta invito
                    </Button>
                    <Button
                        variant="ghost"
                        fullWidth
                        disabled={accepting}
                        onClick={() => navigate("/workspace")}
                    >
                        Rifiuta
                    </Button>
                </div>
            </Card>
        </div>
    );
}
