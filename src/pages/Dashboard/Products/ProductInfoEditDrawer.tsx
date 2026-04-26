import { type FormEvent, useState, useEffect } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { V2Product, updateProduct } from "@/services/supabase/products";
import { uploadProductImage } from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import styles from "./ProductInfoEditDrawer.module.scss";

interface ProductInfoEditDrawerProps {
    open: boolean;
    onClose: () => void;
    productId: string;
    tenantId: string;
    initialData: {
        name: string;
        description: string | null;
        image_url: string | null;
    };
    onSuccess: (updated: V2Product) => void;
}

export function ProductInfoEditDrawer({
    open,
    onClose,
    productId,
    tenantId,
    initialData,
    onSuccess
}: ProductInfoEditDrawerProps) {
    const { showToast } = useToast();

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setName(initialData.name);
            setDescription(initialData.description ?? "");
            setPendingImageFile(null);
            setRemoveImage(false);
            setIsSaving(false);
        }
    }, [open, initialData]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }

        try {
            setIsSaving(true);

            let imageUrl: string | null = initialData.image_url;
            if (removeImage) {
                imageUrl = null;
            } else if (pendingImageFile) {
                imageUrl = await uploadProductImage(tenantId, productId, await compressImage(pendingImageFile, COMPRESS_PROFILES.product));
            }

            const updated = await updateProduct(productId, tenantId, {
                name: trimmedName,
                description: description.trim() || null,
                image_url: imageUrl
            });

            onSuccess(updated);
            onClose();
            showToast({ message: "Informazioni aggiornate", type: "success" });
        } catch {
            showToast({ message: "Errore nel salvataggio", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={500}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica informazioni
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="product-info-form"
                            loading={isSaving}
                            disabled={isSaving}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                <form
                    id="product-info-form"
                    className={styles.form}
                    onSubmit={handleSubmit}
                >
                    <TextInput
                        label="Nome"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        disabled={isSaving}
                        required
                    />

                    <div className={styles.textareaField}>
                        <label className={styles.textareaLabel}>Descrizione</label>
                        <textarea
                            className={styles.textarea}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            disabled={isSaving}
                            rows={4}
                            placeholder="Descrizione del prodotto..."
                        />
                    </div>

                    <FileInput
                        label="Immagine"
                        accept="image/*"
                        maxSizeMb={5}
                        preview="auto"
                        value={pendingImageFile}
                        onChange={file => {
                            setPendingImageFile(file);
                            if (file) setRemoveImage(false);
                        }}
                        disabled={isSaving}
                    />

                    {initialData.image_url && !removeImage && !pendingImageFile && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => setRemoveImage(true)}
                            disabled={isSaving}
                        >
                            Rimuovi immagine
                        </Button>
                    )}

                    {removeImage && (
                        <Text variant="body-sm" colorVariant="muted">
                            L&apos;immagine verrà rimossa al salvataggio.
                        </Text>
                    )}
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
