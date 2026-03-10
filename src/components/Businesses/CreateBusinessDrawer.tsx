import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabase/client";
import { useAuth } from "@/context/useAuth";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";

const STORAGE_KEY = "cg_v2_selected_tenant_id";

const VERTICAL_OPTIONS = [
    { value: "restaurant", label: "Ristorante" },
    { value: "bar", label: "Bar" },
    { value: "retail", label: "Negozio" },
    { value: "hotel", label: "Hotel" },
    { value: "generic", label: "Generico" }
];

interface CreateBusinessDrawerProps {
    open: boolean;
    onClose: () => void;
}

export function CreateBusinessDrawer({ open, onClose }: CreateBusinessDrawerProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [verticalType, setVerticalType] = useState("generic");
    const [submitting, setSubmitting] = useState(false);

    const handleClose = () => {
        if (submitting) return;
        setName("");
        setVerticalType("generic");
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({
                type: "error",
                message: "Il nome dell'azienda è obbligatorio",
                duration: 3000
            });
            return;
        }

        if (!user) return;

        try {
            setSubmitting(true);

            const { data, error } = await supabase
                .from("v2_tenants")
                .insert({ owner_user_id: user.id, name: name.trim(), vertical_type: verticalType })
                .select("id")
                .single();

            if (error) throw error;

            localStorage.setItem(STORAGE_KEY, data.id);
            navigate(`/business/${data.id}/overview`);
        } catch (err) {
            console.error("[CreateBusinessDrawer] creation failed:", err);
            showToast({ type: "error", message: "Errore durante la creazione dell'azienda" });
            setSubmitting(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={handleClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Crea azienda
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
                            form="create-business-form"
                            loading={submitting}
                        >
                            Crea azienda
                        </Button>
                    </>
                }
            >
                <form
                    id="create-business-form"
                    onSubmit={handleSubmit}
                    style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                >
                    <TextInput
                        label="Nome azienda"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="es. Ristorante Bellavista"
                        disabled={submitting}
                        required
                    />

                    <Select
                        label="Tipo di attività"
                        value={verticalType}
                        onChange={e => setVerticalType(e.target.value)}
                        options={VERTICAL_OPTIONS}
                        disabled={submitting}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
