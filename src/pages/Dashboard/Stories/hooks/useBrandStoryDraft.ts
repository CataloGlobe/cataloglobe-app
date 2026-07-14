import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getTenantStorySettings,
    updateTenantStorySettings,
    TenantStorySettings
} from "@/services/supabase/tenants";
import {
    uploadStoryImage,
    deleteStoryImageBestEffort,
    extractStoragePath
} from "@/services/supabase/upload";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";

/** Path id della copertina brand nel bucket `stories` (singleton per tenant). */
const BRAND_COVER_ID = "brand-cover";

export interface BrandStoryDraft {
    /** false finché il primo fetch non è completato (fetch lazy su `active`). */
    loaded: boolean;
    title: string;
    onTitleChange: (value: string) => void;
    intro: string;
    onIntroChange: (value: string) => void;
    website: string;
    onWebsiteChange: (value: string) => void;
    /** URL copertina risolto (objectURL pendente / salvata / null se rimossa). */
    coverUrl: string | null;
    pendingCoverFile: File | null;
    onCoverFileChange: (file: File) => void;
    onCoverRemove: () => void;
    isDirty: boolean;
    isSaving: boolean;
    /** Unico percorso di salvataggio (header + "Salva ed esci" del guard). */
    save: () => Promise<boolean>;
    /** Scarta il draft riallineandolo al baseline salvato. */
    discard: () => void;
}

/**
 * Draft "Storia del brand" — sollevamento stato per il tab brand di Stories.
 * Stesso modello draft-inline di StoryDetailPage (Task A): il chiamante
 * possiede draft + baseline, `isDirty` deriva dal diff, la rimozione copertina
 * è PENDENTE (delete reale solo al save, poi cleanup storage best-effort).
 * Fetch lazy: parte alla prima attivazione del tab (`active=true`).
 */
export function useBrandStoryDraft(tenantId: string | null, active: boolean): BrandStoryDraft {
    const { showToast } = useToast();

    // Baseline salvato (null = non ancora fetchato).
    const [saved, setSaved] = useState<TenantStorySettings | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Draft
    const [title, setTitle] = useState("");
    const [intro, setIntro] = useState("");
    const [website, setWebsite] = useState("");
    const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    // Rimozione copertina pendente: true solo se esisteva una copertina salvata.
    const [coverRemoved, setCoverRemoved] = useState(false);

    // Sync draft ← baseline (primo fetch e dopo ogni save riuscito).
    const syncFromSaved = useCallback((data: TenantStorySettings) => {
        setTitle(data.story_title ?? "");
        setIntro(data.story_intro ?? "");
        setWebsite(data.website ?? "");
        setPendingCoverFile(null);
        setCoverRemoved(false);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    }, []);

    // Fetch lazy alla prima attivazione del tab.
    useEffect(() => {
        if (!active || !tenantId || saved) return;
        let cancelled = false;
        getTenantStorySettings(tenantId)
            .then(data => {
                if (cancelled) return;
                setSaved(data);
                syncFromSaved(data);
            })
            .catch(err => {
                console.error("[useBrandStoryDraft] fetch failed:", err);
                showToast({ type: "error", message: "Errore durante il caricamento della storia del brand." });
            });
        return () => {
            cancelled = true;
        };
    }, [active, tenantId, saved, syncFromSaved, showToast]);

    const onCoverFileChange = useCallback((file: File) => {
        setPendingCoverFile(file);
        setCoverRemoved(false);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
    }, []);

    const onCoverRemove = useCallback(() => {
        setPendingCoverFile(null);
        setCoverPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        // Pendente solo se c'era una copertina salvata; annullare un file
        // pendente non lascia nulla da rimuovere al save.
        setCoverRemoved(Boolean(saved?.story_cover));
    }, [saved?.story_cover]);

    const isDirty = useMemo(() => {
        if (!saved) return false;
        if (pendingCoverFile) return true;
        if (coverRemoved) return true;
        if (title !== (saved.story_title ?? "")) return true;
        if (intro !== (saved.story_intro ?? "")) return true;
        if (website !== (saved.website ?? "")) return true;
        return false;
    }, [saved, title, intro, website, pendingCoverFile, coverRemoved]);

    const save = useCallback(async (): Promise<boolean> => {
        if (!saved || !tenantId || isSaving) return false;

        setIsSaving(true);
        try {
            let cover = saved.story_cover;
            if (pendingCoverFile) {
                cover = await uploadStoryImage(
                    tenantId,
                    BRAND_COVER_ID,
                    await compressImage(pendingCoverFile, COMPRESS_PROFILES.cover)
                );
            } else if (coverRemoved) {
                cover = null;
            }

            const next: TenantStorySettings = {
                story_cover: cover,
                story_title: title.trim() || null,
                story_intro: intro.trim() || null,
                website: website.trim() || null
            };
            await updateTenantStorySettings(tenantId, next);

            // Cleanup storage best-effort DOPO il persist riuscito: vecchia
            // copertina rimossa o sostituita con path diverso (es. altra ext).
            if (saved.story_cover) {
                const toPath = (url: string) => extractStoragePath(url, "stories") ?? url;
                const newPath = cover ? toPath(cover) : null;
                if (toPath(saved.story_cover) !== newPath) {
                    try {
                        await deleteStoryImageBestEffort(tenantId, BRAND_COVER_ID, saved.story_cover);
                    } catch (err) {
                        console.warn("[storage] brand cover cleanup failed:", err);
                    }
                }
            }

            setSaved(next);
            syncFromSaved(next);
            showToast({ message: "Storia del brand aggiornata.", type: "success" });
            return true;
        } catch (err) {
            console.error("Errore salvataggio storia del brand:", err);
            const message =
                err instanceof Error && err.message ? err.message : "Errore durante il salvataggio. Riprova.";
            showToast({ message, type: "error" });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [saved, tenantId, isSaving, title, intro, website, pendingCoverFile, coverRemoved, syncFromSaved, showToast]);

    const discard = useCallback(() => {
        if (saved) syncFromSaved(saved);
    }, [saved, syncFromSaved]);

    return {
        loaded: Boolean(saved),
        title,
        onTitleChange: setTitle,
        intro,
        onIntroChange: setIntro,
        website,
        onWebsiteChange: setWebsite,
        coverUrl: coverPreview ?? (coverRemoved ? null : saved?.story_cover ?? null),
        pendingCoverFile,
        onCoverFileChange,
        onCoverRemove,
        isDirty,
        isSaving,
        save,
        discard
    };
}
