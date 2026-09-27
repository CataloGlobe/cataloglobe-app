import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import {
    updateFeaturedContent,
    framingToColumns,
    columnsToFraming,
    type FeaturedContent,
    type FeaturedContentType,
    type MediaFraming
} from "@/services/supabase/featuredContents";
import { uploadFeaturedContentImage, deleteFeaturedContentImageBestEffort } from "@/services/supabase/upload";
import { deriveTypeFields, typeChoiceError, type TypeChoice } from "../featuredContentTypes";

/** Il pezzo di pagina che si salva con un Salva solo (§28.3, §27). */
type TextDraft = {
    title: string;
    subtitle: string;
    description: string;
    internalName: string;
    ctaText: string;
    ctaUrl: string;
};

type ImageDraft = {
    /** File nuovo, compresso dall'editor; si carica al Salva. */
    file: File | null;
    aspectRatio: number | null;
    framing: MediaFraming;
    /** Rimozione pendente dell'immagine salvata. */
    removed: boolean;
};

function textOf(content: FeaturedContent): TextDraft {
    return {
        title: content.title,
        subtitle: content.subtitle ?? "",
        description: content.description ?? "",
        internalName: content.internal_name ?? "",
        ctaText: content.cta_text ?? "",
        ctaUrl: content.cta_url ?? ""
    };
}

function typeOf(content: FeaturedContent): TypeChoice {
    return {
        type: content.content_type ?? "announcement",
        bundlePrice: content.bundle_price != null ? String(content.bundle_price).replace(".", ",") : "",
        showOriginalTotal: content.show_original_total,
        showImages: content.layout_style === "with_images"
    };
}

function imageOf(content: FeaturedContent): ImageDraft {
    return { file: null, aspectRatio: null, framing: columnsToFraming(content), removed: false };
}

function extOf(url: string | null): string | null {
    if (!url) return null;
    const base = url.split("?")[0];
    const dot = base.lastIndexOf(".");
    return dot > base.lastIndexOf("/") ? base.slice(dot + 1).toLowerCase() : null;
}

export type FeaturedDraft = ReturnType<typeof useFeaturedDraft>;

/**
 * La bozza della pagina di un contenuto in evidenza: tipo, testi, immagine e
 * bottone, che prima erano quattro drawer con quattro salvataggi (§28.3). Un
 * Salva solo li scrive insieme; `extraDirty`/`onAfterSave` lasciano entrare
 * nella stessa bozza anche i prodotti collegati.
 */
export function useFeaturedDraft(
    content: FeaturedContent | null,
    tenantId: string | null,
    onSaved: (next: FeaturedContent) => void
) {
    const { showToast } = useToast();
    const [text, setText] = useState<TextDraft | null>(null);
    const [typeChoice, setTypeChoice] = useState<TypeChoice | null>(null);
    const [image, setImage] = useState<ImageDraft | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Anteprima del file scelto e non ancora caricato.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!image?.file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(image.file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [image?.file]);

    const reset = useCallback((from: FeaturedContent) => {
        setText(textOf(from));
        setTypeChoice(typeOf(from));
        setImage(imageOf(from));
    }, []);

    useEffect(() => {
        if (content) reset(content);
    }, [content, reset]);

    const isDirty = useMemo(() => {
        if (!content || !text || !typeChoice || !image) return false;
        if (JSON.stringify(text) !== JSON.stringify(textOf(content))) return true;
        const savedType = deriveTypeFields(typeOf(content));
        if (JSON.stringify(deriveTypeFields(typeChoice)) !== JSON.stringify(savedType)) return true;
        if (typeChoice.type === "bundle" && typeChoice.bundlePrice !== typeOf(content).bundlePrice) return true;
        if (image.file || image.removed) return true;
        return JSON.stringify(image.framing) !== JSON.stringify(columnsToFraming(content));
    }, [content, text, typeChoice, image]);

    const urlError = useMemo(() => {
        const url = text?.ctaUrl.trim() ?? "";
        return url && !url.startsWith("https://") ? "Il link deve iniziare con https://" : undefined;
    }, [text?.ctaUrl]);

    const priceError = typeChoice ? typeChoiceError(typeChoice) : null;
    const titleError = text && !text.title.trim() ? "Il titolo è obbligatorio." : undefined;

    const save = useCallback(async (): Promise<boolean> => {
        if (!content || !tenantId || !text || !typeChoice || !image || isSaving) return false;
        const invalid = titleError ?? priceError ?? urlError;
        if (invalid) {
            showToast({ message: invalid, type: "error" });
            return false;
        }
        setIsSaving(true);
        try {
            const payload: Partial<FeaturedContent> = {
                title: text.title.trim(),
                internal_name: text.internalName.trim() || text.title.trim(),
                subtitle: text.subtitle.trim() || null,
                description: text.description.trim() || null,
                cta_text: text.ctaText.trim() || null,
                cta_url: text.ctaUrl.trim() || null,
                ...deriveTypeFields(typeChoice),
                ...framingToColumns(image.framing)
            };
            const oldMedia = content.media_id;
            // Prima il file nuovo, poi il record, poi la pulizia: se il caricamento
            // fallisce il contenuto punta ancora al file vecchio, che esiste.
            if (image.file) {
                const url = await uploadFeaturedContentImage(tenantId, content.id, image.file);
                payload.media_id = `${url}?t=${Date.now()}`;
                payload.media_aspect_ratio = image.aspectRatio;
            } else if (image.removed) {
                payload.media_id = null;
                payload.media_aspect_ratio = null;
            }
            const saved = await updateFeaturedContent(content.id, tenantId, payload);
            const replacedWithOtherExt = image.file && oldMedia && extOf(oldMedia) !== extOf(payload.media_id ?? null);
            if ((image.removed && oldMedia) || replacedWithOtherExt) {
                try {
                    await deleteFeaturedContentImageBestEffort(tenantId, content.id, oldMedia);
                } catch (err) {
                    console.warn("[storage] featured image cleanup failed:", err);
                }
            }
            showToast({ message: "Contenuto aggiornato.", type: "success" });
            onSaved(saved);
            return true;
        } catch (err) {
            console.error("Errore salvataggio contenuto in evidenza:", err);
            showToast({ message: "Impossibile salvare il contenuto.", type: "error" });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [content, tenantId, text, typeChoice, image, isSaving, titleError, priceError, urlError, showToast, onSaved]);

    const discard = useCallback(() => {
        if (content) reset(content);
    }, [content, reset]);

    const setField = useCallback(<K extends keyof TextDraft>(key: K, value: TextDraft[K]) => {
        setText(prev => (prev ? { ...prev, [key]: value } : prev));
    }, []);

    const setType = useCallback((type: FeaturedContentType) => {
        setTypeChoice(prev => (prev ? { ...prev, type } : prev));
    }, []);

    const patchType = useCallback((patch: Partial<TypeChoice>) => {
        setTypeChoice(prev => (prev ? { ...prev, ...patch } : prev));
    }, []);

    return {
        text,
        typeChoice,
        image,
        setImage,
        /** L'immagine da mostrare: il file pendente, la salvata, o null se rimossa. */
        imageSource: image?.removed ? null : (previewUrl ?? content?.media_id ?? null),
        setField,
        setType,
        patchType,
        isDirty,
        isSaving,
        save,
        discard,
        errors: { title: titleError, price: priceError ?? undefined, url: urlError }
    };
}
