import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import Text from "@/components/ui/Text/Text";
import type { BrandStoryDraft } from "../hooks/useBrandStoryDraft";
import styles from "./StoryBrandDrawer.module.scss";

const FORM_ID = "story-brand-form";

type StoryBrandDrawerProps = {
    open: boolean;
    onClose: () => void;
    /** Il draft del cappello (`useBrandStoryDraft`): il drawer è solo la sua forma. */
    brand: BrandStoryDraft;
};

/**
 * Il cappello delle Storie in un drawer `md` (§50.11/4): «Salva» scrive
 * subito (è un record a sé, non una bozza della pagina), «Annulla» scarta.
 * La foto resta senza inquadratura, com'era.
 */
export function StoryBrandDrawer({ open, onClose, brand }: StoryBrandDrawerProps) {
    const close = () => {
        if (brand.isSaving) return;
        brand.discard();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await brand.save()) onClose();
    };

    return (
        <SystemDrawer open={open} onClose={close} size="md">
            <DrawerLayout
                header={
                    <div className={styles.header}>
                        <Text variant="title-sm" weight={600}>
                            Introduzione
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Il testo che i clienti leggono prima delle storie. Vale per tutte le sedi.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={close} disabled={brand.isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={brand.isSaving}
                            disabled={!brand.isDirty}
                        >
                            Salva
                        </Button>
                    </>
                }
            >
                <form id={FORM_ID} className={styles.form} onSubmit={handleSubmit}>
                    <ImageUploadField
                        label="Foto"
                        helperText="Non la stessa della copertina sede: la squadra, la cucina, un dettaglio."
                        imageUrl={brand.coverUrl}
                        pendingFile={brand.pendingCoverFile}
                        onFileChange={brand.onCoverFileChange}
                        onRemove={brand.onCoverRemove}
                        thumbShape="wide"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        maxSizeMb={5}
                    />
                    <TextInput label="Titolo" value={brand.title} onChange={e => brand.onTitleChange(e.target.value)} />
                    <Textarea
                        label="Intro"
                        value={brand.intro}
                        onChange={e => brand.onIntroChange(e.target.value)}
                        rows={4}
                    />
                    <TextInput
                        label="Sito web"
                        type="url"
                        value={brand.website}
                        onChange={e => brand.onWebsiteChange(e.target.value)}
                        placeholder="https://..."
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
