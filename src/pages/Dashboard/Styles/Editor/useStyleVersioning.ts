import { useState, useCallback } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { listStyleVersions, updateStyle, type V2StyleVersion } from "@/services/supabase/styles";
import { parseTokens, type StyleTokenModel } from "./StyleTokenModel";

type UseStyleVersioningParams = {
    styleId: string | undefined;
    tenantId: string | undefined;
    onRollbackComplete: () => Promise<void>;
};

type UseStyleVersioningReturn = {
    versions: V2StyleVersion[];
    isVersionsLoading: boolean;
    isVersionsOpen: boolean;
    selectedVersionId: string | null;
    previewOverrideTokens: StyleTokenModel | null;
    isRollingBack: boolean;
    handleVersionClick: () => Promise<void>;
    handleVersionSelect: (v: V2StyleVersion) => void;
    handleVersionClose: () => void;
    /**
     * Ripristina una versione (la scrive come versione nuova). Prende l'id e
     * non la selezione: l'avviso «in uso» chiude il menu prima della conferma.
     */
    rollbackTo: (versionId: string) => Promise<boolean>;
    /** Call after a successful save to force re-fetch on next popover open. */
    invalidate: () => void;
};

export function useStyleVersioning({
    styleId,
    tenantId,
    onRollbackComplete
}: UseStyleVersioningParams): UseStyleVersioningReturn {
    const { showToast } = useToast();

    const [versions, setVersions] = useState<V2StyleVersion[]>([]);
    const [versionsLoaded, setVersionsLoaded] = useState(false);
    const [isVersionsLoading, setIsVersionsLoading] = useState(false);
    const [isVersionsOpen, setIsVersionsOpen] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const [previewOverrideTokens, setPreviewOverrideTokens] = useState<StyleTokenModel | null>(
        null
    );
    const [isRollingBack, setIsRollingBack] = useState(false);

    const invalidate = useCallback(() => {
        setVersionsLoaded(false);
    }, []);

    const handleVersionClick = useCallback(async () => {
        if (isVersionsOpen) {
            setIsVersionsOpen(false);
            return;
        }
        setIsVersionsOpen(true);
        if (!versionsLoaded && styleId && tenantId) {
            setIsVersionsLoading(true);
            try {
                const data = await listStyleVersions(styleId, tenantId);
                setVersions(data);
                setVersionsLoaded(true);
            } catch {
                showToast({ message: "Errore nel caricamento delle versioni.", type: "error" });
            } finally {
                setIsVersionsLoading(false);
            }
        }
    }, [isVersionsOpen, versionsLoaded, styleId, tenantId, showToast]);

    const handleVersionSelect = useCallback((v: V2StyleVersion) => {
        setSelectedVersionId(v.id);
        try {
            setPreviewOverrideTokens(parseTokens(v.config));
        } catch {
            setPreviewOverrideTokens(null);
        }
    }, []);

    const handleVersionClose = useCallback(() => {
        setIsVersionsOpen(false);
        setSelectedVersionId(null);
        setPreviewOverrideTokens(null);
    }, []);

    const rollbackTo = useCallback(async (versionId: string): Promise<boolean> => {
        if (!styleId || !tenantId) return false;
        const targetVersion = versions.find(v => v.id === versionId);
        if (!targetVersion) return false;

        setIsRollingBack(true);
        try {
            await updateStyle(styleId, undefined, targetVersion.config, tenantId);
            showToast({
                message: `Stile ripristinato alla versione ${targetVersion.version}.`,
                type: "success"
            });
            setIsVersionsOpen(false);
            setSelectedVersionId(null);
            setPreviewOverrideTokens(null);
            setVersionsLoaded(false);
            await onRollbackComplete();
            return true;
        } catch {
            showToast({ message: "Errore durante il ripristino della versione.", type: "error" });
            return false;
        } finally {
            setIsRollingBack(false);
        }
    }, [styleId, tenantId, versions, showToast, onRollbackComplete]);

    return {
        versions,
        isVersionsLoading,
        isVersionsOpen,
        selectedVersionId,
        previewOverrideTokens,
        isRollingBack,
        handleVersionClick,
        handleVersionSelect,
        handleVersionClose,
        rollbackTo,
        invalidate
    };
}
