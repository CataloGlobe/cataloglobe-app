import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { TextInput } from "@/components/ui/Input/TextInput";
import { listCatalogs, type V2Catalog } from "@/services/supabase/catalogs";
import { downloadMenuPdf, DownloadMenuPdfError } from "@/services/pdf/downloadMenuPdf";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ExportCatalogDrawer.module.scss";

type ExportCatalogDrawerProps = {
    open: boolean;
    onClose: () => void;
    activityId: string;
    activityName: string;
    tenantId: string;
};

export function ExportCatalogDrawer({
    open,
    onClose,
    activityId,
    activityName,
    tenantId
}: ExportCatalogDrawerProps) {
    const { showToast } = useToast();
    const [catalogs, setCatalogs] = useState<V2Catalog[]>([]);
    const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
    const [fileName, setFileName] = useState<string>("");
    const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setSelectedCatalogId("");
        setFileName("");

        async function load() {
            setIsLoadingCatalogs(true);
            try {
                const result = await listCatalogs(tenantId);
                setCatalogs(result);
                if (result.length > 0) {
                    const first = result[0];
                    setSelectedCatalogId(first.id);
                    setFileName(`${first.name ?? "Catalogo"} - ${activityName}`);
                }
            } catch {
                showToast({ message: "Errore nel caricamento dei cataloghi.", type: "error" });
            } finally {
                setIsLoadingCatalogs(false);
            }
        }
        load();
    }, [open, tenantId, activityName, showToast]);

    const handleCatalogChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedCatalogId(id);
        const catalog = catalogs.find(c => c.id === id);
        setFileName(`${catalog?.name ?? "Catalogo"} - ${activityName}`);
    };

    const handleDownload = async () => {
        if (!selectedCatalogId) return;
        setIsDownloading(true);
        try {
            await downloadMenuPdf(activityId, {
                catalogId: selectedCatalogId,
                fileName: fileName.trim() || undefined
            });
            onClose();
        } catch (error: unknown) {
            if (error instanceof DownloadMenuPdfError) {
                showToast({ message: error.message, type: "error" });
            } else {
                showToast({ message: "Errore durante il download del PDF.", type: "error" });
            }
        } finally {
            setIsDownloading(false);
        }
    };

    const catalogOptions = catalogs.map(c => ({ value: c.id, label: c.name ?? "Catalogo senza nome" }));

    // TEMP — verifica Stage 1b, rimuovere in Stage 6.
    // Valida il data layer su un catalogo reale: log del MenuPdfData, nessun PDF.
    const [isSpikeRunning, setIsSpikeRunning] = useState(false);
    const handleSpike = async () => {
        if (!selectedCatalogId) return;
        setIsSpikeRunning(true);
        try {
            const { loadMenuPdfData } = await import("@/services/pdf/loadMenuPdfData");
            const data = await loadMenuPdfData(tenantId, activityId, selectedCatalogId);
            console.log("[Stage 1b] MenuPdfData:", data);
            showToast({ message: "MenuPdfData in console.", type: "success" });
        } catch (error) {
            console.error("MenuPdfData load failed:", error);
            showToast({ message: "Caricamento MenuPdfData fallito (vedi console).", type: "error" });
        } finally {
            setIsSpikeRunning(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Esporta catalogo PDF
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Scegli il catalogo da esportare in formato PDF stampabile.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        {/* TEMP SPIKE — rimuovere in Stage 6 */}
                        <Button
                            variant="secondary"
                            onClick={handleSpike}
                            loading={isSpikeRunning}
                            disabled={isSpikeRunning}
                        >
                            Spike PDF
                        </Button>
                        <Button variant="secondary" onClick={onClose} disabled={isDownloading}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleDownload}
                            loading={isDownloading}
                            disabled={!selectedCatalogId || isDownloading || isLoadingCatalogs}
                        >
                            Scarica PDF
                        </Button>
                    </>
                }
            >
                <div className={styles.fieldStack}>
                    <Select
                        label="Catalogo"
                        options={catalogOptions}
                        value={selectedCatalogId}
                        onChange={handleCatalogChange}
                        disabled={isLoadingCatalogs || isDownloading}
                        helperText={
                            isLoadingCatalogs
                                ? "Caricamento cataloghi…"
                                : catalogs.length === 0 && !isLoadingCatalogs
                                  ? "Nessun catalogo disponibile."
                                  : undefined
                        }
                    />
                    <TextInput
                        label="Nome file"
                        value={fileName}
                        onChange={e => setFileName(e.target.value)}
                        placeholder="Es. Catalogo Completo - McDonald's Viale Certosa"
                        disabled={isDownloading}
                        helperText="Senza estensione .pdf"
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
