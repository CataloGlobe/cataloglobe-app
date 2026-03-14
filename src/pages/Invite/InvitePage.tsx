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
    const [declining, setDeclining] = useState(false);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (authLoading) return;

        // Not logged in — redirect to login preserving the invite URL.
        // Pass state.from as { pathname } so Login.tsx can reconstruct it correctly.
        if (!user) {
            navigate("/login", {
                replace: true,
                state: { from: { pathname: `/invite/${token}` } }
            });
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

        const { data: tenantId, error } = await supabase.rpc("accept_invite_by_token", {
            p_token: token
        });

        if (error) {
            console.error("[InvitePage] accept_invite_by_token:", error);
            const isExpired = error.message?.includes("invite expired");
            showToast({
                type: "error",
                message: isExpired
                    ? "Il link di invito è scaduto. Chiedi un nuovo invito."
                    : "Impossibile accettare l'invito. Il link potrebbe essere già stato usato."
            });
            if (isExpired) {
                setInvite(prev => prev ? { ...prev, status: "expired" } : prev);
            }
            setAccepting(false);
            return;
        }

        showToast({ type: "success", message: "Invito accettato. Benvenuto nel team!" });
        navigate(tenantId ? `/business/${tenantId}/overview` : "/workspace", { replace: true });
    };

    const handleDecline = async () => {
        if (!token) return;
        setDeclining(true);

        const { error } = await supabase.rpc("decline_invite_by_token", { p_token: token });

        setDeclining(false);

        if (error) {
            console.error("[InvitePage] decline_invite_by_token:", error);
            showToast({ type: "error", message: "Impossibile rifiutare l'invito." });
            return;
        }

        showToast({ type: "success", message: "Invito rifiutato." });
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
                            Hai già accettato questo invito.
                        </Text>
                    </div>
                    <Button variant="primary" onClick={() => navigate("/workspace")}>
                        Vai al workspace
                    </Button>
                </Card>
            </div>
        );
    }

    // CASE 3 — expired invite
    if (invite.status === "expired") {
        return (
            <div className={styles.page}>
                <Card className={styles.card}>
                    <div className={styles.header}>
                        <Text variant="title-md" weight={700}>
                            Invito scaduto
                        </Text>
                        <Text variant="body" colorVariant="muted">
                            Il link di invito è scaduto. Chiedi all'amministratore di inviarne uno nuovo.
                        </Text>
                    </div>
                    <Button variant="secondary" onClick={() => navigate("/workspace")}>
                        Vai al workspace
                    </Button>
                </Card>
            </div>
        );
    }

    // CASE 4 — revoked invite
    if (invite.status === "revoked") {
        return (
            <div className={styles.page}>
                <Card className={styles.card}>
                    <div className={styles.header}>
                        <Text variant="title-md" weight={700}>
                            Invito revocato
                        </Text>
                        <Text variant="body" colorVariant="muted">
                            Questo invito è stato revocato. Contatta l'amministratore.
                        </Text>
                    </div>
                    <Button variant="secondary" onClick={() => navigate("/workspace")}>
                        Vai al workspace
                    </Button>
                </Card>
            </div>
        );
    }

    // CASE 5 — valid pending invite
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
                        disabled={declining}
                        onClick={handleAccept}
                    >
                        Accetta invito
                    </Button>
                    <Button
                        variant="danger"
                        fullWidth
                        loading={declining}
                        disabled={accepting}
                        onClick={handleDecline}
                    >
                        Declina invito
                    </Button>
                </div>
            </Card>
        </div>
    );
}
