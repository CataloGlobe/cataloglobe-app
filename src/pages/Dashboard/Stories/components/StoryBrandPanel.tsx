import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";

/**
 * Pannello "Storia del brand" — presentazionale/controllato dal parent
 * (Stories.tsx via useBrandStoryDraft). Nessuno state interno, nessun fetch,
 * nessun salvataggio: il Salva vive nell'header (HeaderSaveAction), la
 * rimozione copertina è pendente (delete reale al save). Stesso pattern
 * draft-inline di StoryForm/StoryDetailPage.
 */
interface StoryBrandPanelProps {
    title: string;
    onTitleChange: (value: string) => void;
    intro: string;
    onIntroChange: (value: string) => void;
    website: string;
    onWebsiteChange: (value: string) => void;
    /** URL copertina da mostrare (pendente o salvata), null se vuota/rimossa. */
    coverUrl: string | null;
    pendingCoverFile: File | null;
    onCoverFileChange: (file: File) => void;
    onCoverRemove: () => void;
    canWrite: boolean;
}

export function StoryBrandPanel({
    title,
    onTitleChange,
    intro,
    onIntroChange,
    website,
    onWebsiteChange,
    coverUrl,
    pendingCoverFile,
    onCoverFileChange,
    onCoverRemove,
    canWrite
}: StoryBrandPanelProps) {
    return (
        <SectionCard
            title="Informazioni brand"
            subtitle="Visibili in cima alla sezione storie del catalogo pubblico"
        >
            <ImageUploadField
                label="Copertina"
                imageUrl={coverUrl}
                pendingFile={pendingCoverFile}
                onFileChange={onCoverFileChange}
                onRemove={onCoverRemove}
                thumbShape="wide"
                accept="image/png,image/jpeg,image/webp"
                maxSizeMb={5}
                disabled={!canWrite}
            />

            <TextInput
                label="Titolo"
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                disabled={!canWrite}
            />

            <Textarea
                label="Intro"
                value={intro}
                onChange={e => onIntroChange(e.target.value)}
                rows={4}
                disabled={!canWrite}
            />

            <TextInput
                label="Sito web"
                type="url"
                value={website}
                onChange={e => onWebsiteChange(e.target.value)}
                placeholder="https://..."
                disabled={!canWrite}
            />
        </SectionCard>
    );
}
