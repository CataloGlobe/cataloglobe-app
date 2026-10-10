import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Ban, CheckCircle, Clock, Link2Off, MailOpen, UserRound } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { AuthLayout } from "@/layouts/AuthLayout/AuthLayout";
import { ROLE_LABEL } from "@/constants/roles";
import { listMyPendingInvites } from "@/services/supabase/team";
import type { EffectiveRole } from "@/types/team";
import styles from "./InvitePage.module.scss";

type InviteInfo = {
    tenant_id: string;
    tenant_name: string;
    effective_role: string;
    status: string;
    activity_ids: string[];
    activity_names: string[];
};

/**
 * Chi ha invitato: get_invite_info_by_token non lo dà, get_my_pending_invites
 * sì (stesso dato del modale del Workspace). Se non si trova la riga resta
 * fuori, l'invito si accetta lo stesso.
 */
async function findInviterEmail(token: string): Promise<string | null> {
    try {
        const rows = await listMyPendingInvites();
        return rows.find(r => r.invite_token === token)?.inviter_email ?? null;
    } catch {
        return null;
    }
}

export default function InvitePage() {
    usePageTitle('Invito');
    const { token } = useParams<{ token: string }>();
    const { user, loading: authLoading, signOut } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [invite, setInvite] = useState<InviteInfo | null>(null);
    const [inviterEmail, setInviterEmail] = useState<string | null>(null);
    const [loadingInvite, setLoadingInvite] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [declining, setDeclining] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const [wrongAccount, setWrongAccount] = useState(false);

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
                if (row.status === "pending") setInviterEmail(await findInviterEmail(token));
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
            if (error.message?.includes("invite email mismatch")) {
                setWrongAccount(true);
                setAccepting(false);
                return;
            }
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
        navigate(tenantId ? `/business/${tenantId}` : "/workspace", { replace: true });
    };

    const handleDecline = async () => {
        if (!token) return;
        setDeclining(true);

        const { error } = await supabase.rpc("decline_invite_by_token", { p_token: token });

        setDeclining(false);

        if (error) {
            console.error("[InvitePage] decline_invite_by_token:", error);
            if (error.message?.includes("invite email mismatch")) {
                setWrongAccount(true);
                return;
            }
            showToast({ type: "error", message: "Impossibile rifiutare l'invito." });
            return;
        }

        showToast({ type: "success", message: "Invito rifiutato." });
        navigate("/workspace", { replace: true });
    };

    const handleSwitchAccount = async () => {
        await signOut();
        navigate("/login", {
            replace: true,
            state: { from: { pathname: `/invite/${token}` } }
        });
    };

    const toWorkspace = () => navigate("/workspace");

    // Auth e invito in caricamento: solo il titolo, come le altre pagine di accesso.
    if (authLoading || loadingInvite) {
        return <AuthLayout heading="Caricamento invito…" />;
    }

    // CASE 1 — invite not found or token missing
    if (notFound || !invite) {
        return (
            <AuthLayout
                icon={<Link2Off size={28} aria-hidden="true" />}
                tone="warning"
                heading="Link non valido"
                lead="Il link di invito non è valido o è scaduto. Chiedi un nuovo invito."
            >
                <Button variant="secondary" fullWidth onClick={toWorkspace}>
                    Vai al workspace
                </Button>
            </AuthLayout>
        );
    }

    // CASE 1b — invite addressed to another account (server: invite email mismatch)
    if (wrongAccount) {
        return (
            <AuthLayout
                icon={<UserRound size={28} aria-hidden="true" />}
                tone="warning"
                heading="Invito per un altro account"
                lead={`Questo invito non è indirizzato a ${user?.email ?? "questo account"}. Esci e accedi con l'email che ha ricevuto l'invito.`}
            >
                <div className={styles.actions}>
                    <Button variant="primary" fullWidth onClick={handleSwitchAccount}>
                        Esci e cambia account
                    </Button>
                    <Button variant="secondary" fullWidth onClick={toWorkspace}>
                        Vai al workspace
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    // CASE 2 — already accepted
    if (invite.status === "active") {
        return (
            <AuthLayout
                icon={<CheckCircle size={28} aria-hidden="true" />}
                heading="Invito già accettato"
                lead={`Fai già parte di ${invite.tenant_name}.`}
            >
                <Button variant="primary" fullWidth onClick={toWorkspace}>
                    Vai al workspace
                </Button>
            </AuthLayout>
        );
    }

    // CASE 3 — expired invite
    if (invite.status === "expired") {
        return (
            <AuthLayout
                icon={<Clock size={28} aria-hidden="true" />}
                tone="warning"
                heading="Invito scaduto"
                lead="Il link di invito è scaduto. Chiedi a chi ti ha invitato di mandarne uno nuovo."
            >
                <Button variant="secondary" fullWidth onClick={toWorkspace}>
                    Vai al workspace
                </Button>
            </AuthLayout>
        );
    }

    // CASE 4 — revoked invite
    if (invite.status === "revoked") {
        return (
            <AuthLayout
                icon={<Ban size={28} aria-hidden="true" />}
                tone="warning"
                heading="Invito revocato"
                lead="Questo invito è stato revocato. Chiedi a chi ti ha invitato."
            >
                <Button variant="secondary" fullWidth onClick={toWorkspace}>
                    Vai al workspace
                </Button>
            </AuthLayout>
        );
    }

    // CASE 5 — valid pending invite: stessi dati e parole del modale del Workspace
    return (
        <AuthLayout
            icon={<MailOpen size={28} aria-hidden="true" />}
            heading="Invito ricevuto"
            lead={`Ti hanno invitato nel team di ${invite.tenant_name}.`}
        >
            <dl className={styles.meta}>
                <div className={styles.row}>
                    <Text as="dt" variant="body-sm" colorVariant="muted">Attività</Text>
                    <Text as="dd" variant="body" weight={600}>{invite.tenant_name}</Text>
                </div>
                {inviterEmail && (
                    <div className={styles.row}>
                        <Text as="dt" variant="body-sm" colorVariant="muted">Invitato da</Text>
                        <Text as="dd" variant="body" weight={600}>{inviterEmail}</Text>
                    </div>
                )}
                <div className={styles.row}>
                    <Text as="dt" variant="body-sm" colorVariant="muted">Ruolo</Text>
                    <Text as="dd" variant="body" weight={600}>
                        {ROLE_LABEL[invite.effective_role as EffectiveRole] ?? invite.effective_role}
                    </Text>
                </div>
                <div className={styles.row}>
                    <Text as="dt" variant="body-sm" colorVariant="muted">Sedi</Text>
                    <Text as="dd" variant="body" weight={600}>
                        {invite.effective_role === "admin"
                            ? "Tutte le sedi"
                            : invite.activity_names.length === 0
                                ? "—"
                                : invite.activity_names.join(", ")}
                    </Text>
                </div>
            </dl>

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
                    variant="secondary"
                    fullWidth
                    loading={declining}
                    disabled={accepting}
                    onClick={handleDecline}
                >
                    Declina invito
                </Button>
            </div>
        </AuthLayout>
    );
}
