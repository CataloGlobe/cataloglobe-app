import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { createStory } from "@/services/supabase/stories";

const FORM_ID = "story-create-form";

interface StoryCreateDrawerProps {
    open: boolean;
    onClose: () => void;
    tenantId?: string;
    onSuccess: () => void;
}

export default function StoryCreateDrawer({ open, onClose, tenantId, onSuccess }: StoryCreateDrawerProps) {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [eyebrow, setEyebrow] = useState("");
    const [title, setTitle] = useState("");

    useEffect(() => {
        if (!open) return;
        setEyebrow("");
        setTitle("");
        setSubmitting(false);
    }, [open]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            showToast({ message: "Il titolo è obbligatorio.", type: "error" });
            return;
        }
        if (!tenantId) {
            showToast({ message: "Tenant mancante.", type: "error" });
            return;
        }
        setSubmitting(true);
        try {
            const created = await createStory(tenantId, {
                eyebrow: eyebrow.trim() || null,
                title: title.trim(),
                cover_media: null,
                product_id: null,
                status: "draft"
            });
            showToast({ message: "Storia creata.", type: "success" });
            onSuccess();
            navigate(`/business/${tenantId}/stories/${created.id}`);
        } catch (error) {
            console.error("Errore creazione storia:", error);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestClose = () => {
        if (submitting) return;
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={handleRequestClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Crea storia
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={submitting}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={submitting}
                            disabled={submitting}
                        >
                            {submitting ? "Creazione..." : "Crea"}
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    onSubmit={handleSave}
                    style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                    <TextInput
                        label="Titolo"
                        required
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Es: La storia della nostra pasta fresca"
                    />
                    <TextInput
                        label="Occhiello"
                        value={eyebrow}
                        onChange={e => setEyebrow(e.target.value)}
                        placeholder="Es: Dietro le quinte"
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
