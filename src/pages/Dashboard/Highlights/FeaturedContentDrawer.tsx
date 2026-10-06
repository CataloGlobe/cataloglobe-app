import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { useNavigate } from "react-router-dom";
import { createFeaturedContent, type FeaturedContentType } from "@/services/supabase/featuredContents";
import { PRICING_OF_TYPE } from "./featuredContentTypes";
import { FeaturedTypeCards } from "./components/FeaturedTypeCards";
import { useTenantId } from "@/context/useTenantId";
import styles from "./Highlights.module.scss";

const FORM_ID = "featured-content-form";

interface DrawerProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function FeaturedContentDrawer({ open, onClose, onSuccess }: DrawerProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);

    const [internalName, setInternalName] = useState("");
    const [title, setTitle] = useState("");
    // EV4: il tipo si sceglie qui, con le quattro schede.
    const [type, setType] = useState<FeaturedContentType>("announcement");

    useEffect(() => {
        if (!open) return;
        setInternalName("");
        setTitle("");
        setType("announcement");
        setSubmitting(false);
    }, [open]);

    const handleSave = async () => {
        if (!title.trim()) {
            showToast({ type: "error", message: "Il titolo è obbligatorio", duration: 3000 });
            return;
        }
        if (!tenantId) {
            showToast({ type: "error", message: "Utente non identificato (tenantId mancante)" });
            return;
        }
        try {
            setSubmitting(true);
            const created = await createFeaturedContent(tenantId, {
                internal_name: internalName.trim() || title.trim(),
                title: title.trim(),
                pricing_mode: PRICING_OF_TYPE[type],
                content_type: type,
                bundle_price: null,
                status: "published",
                show_original_total: false
            });
            showToast({ type: "success", message: "Contenuto creato" });
            onSuccess();
            if (created && created.id) {
                navigate(`/business/${tenantId}/featured/${created.id}`);
            }
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestClose = () => {
        if (submitting) return;
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={handleRequestClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Crea contenuto
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={handleRequestClose} disabled={submitting}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={submitting}>
                            Crea
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    className={styles.form}
                    onSubmit={e => {
                        e.preventDefault();
                        handleSave();
                    }}
                >
                    <fieldset className={styles.fieldset} disabled={submitting}>
                        <FeaturedTypeCards value={type} onChange={setType} />
                        <TextInput
                            label="Titolo"
                            required
                            helperText="Quello che leggono i clienti."
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Es: Promozione speciale"
                        />
                        <TextInput
                            label="Nome interno"
                            helperText="Serve a te per ritrovarlo: i clienti non lo vedono. Vuoto = il titolo."
                            value={internalName}
                            onChange={e => setInternalName(e.target.value)}
                            placeholder="Es: RistoPromo - Sede Roma"
                        />
                        {type === "bundle" && (
                            <Text variant="caption" colorVariant="muted">
                                Il prezzo del bundle e i prodotti li metti nella sua pagina.
                            </Text>
                        )}
                    </fieldset>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
