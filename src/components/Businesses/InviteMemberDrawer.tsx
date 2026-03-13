import { useState } from "react";
import { supabase } from "@/services/supabase/client";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";

const ROLE_OPTIONS = [
    { value: "member", label: "Member" },
    { value: "admin", label: "Admin" }
];

interface InviteMemberDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    onSuccess?: () => void;
}

export function InviteMemberDrawer({
    open,
    onClose,
    tenantId,
    onSuccess
}: InviteMemberDrawerProps) {
    const { showToast } = useToast();

    const [email, setEmail] = useState("");
    const [role, setRole] = useState("member");
    const [submitting, setSubmitting] = useState(false);

    const handleClose = () => {
        if (submitting) return;
        setEmail("");
        setRole("member");
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) {
            showToast({ type: "error", message: "L'email è obbligatoria", duration: 3000 });
            return;
        }

        try {
            setSubmitting(true);

            // RPC resolves email → user_id internally; returns the invite_token
            const { data: inviteToken, error: rpcError } = await supabase.rpc("invite_tenant_member", {
                p_tenant_id: tenantId,
                p_email: trimmedEmail,
                p_role: role
            });

            if (rpcError) {
                const msg = rpcError.message ?? "";
                if (msg.includes("user already member")) {
                    showToast({ type: "error", message: "Questo utente è già membro dell'azienda.", duration: 4000 });
                    setSubmitting(false);
                    return;
                }
                if (msg.includes("invite already pending")) {
                    showToast({ type: "error", message: "Questo utente ha già un invito in attesa.", duration: 4000 });
                    setSubmitting(false);
                    return;
                }
                throw rpcError;
            }

            showToast({ type: "success", message: "Invito inviato con successo." });

            onSuccess?.();
            handleClose();
        } catch (err) {
            console.error("[InviteMemberDrawer] invite failed:", err);
            showToast({ type: "error", message: "Errore durante l'invio dell'invito." });
            setSubmitting(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Invite member
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose} disabled={submitting}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="invite-member-form"
                            loading={submitting}
                        >
                            Send invite
                        </Button>
                    </>
                }
            >
                <form
                    id="invite-member-form"
                    onSubmit={handleSubmit}
                    style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                >
                    <TextInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="es. utente@esempio.com"
                        disabled={submitting}
                        required
                    />

                    <Select
                        label="Role"
                        value={role}
                        onChange={e => setRole(e.target.value)}
                        options={ROLE_OPTIONS}
                        disabled={submitting}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
