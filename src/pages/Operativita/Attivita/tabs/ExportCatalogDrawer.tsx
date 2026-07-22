import React, { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { listCatalogs, type V2Catalog } from "@/services/supabase/catalogs";
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
    const [includePhotos, setIncludePhotos] = useState(false);

    useEffect(() => {
        if (!open) return;
        setSelectedCatalogId("");
        setFileName("");
        setIncludePhotos(false);

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
            // Import dinamici: react-pdf resta nel chunk lazy, fuori dal
            // bundle principale.
            const [{ loadMenuPdfData }, { renderMenuPdfBlob }] = await Promise.all([
                import("@/services/pdf/loadMenuPdfData"),
                import("@/services/pdf/renderMenuPdf")
            ]);
            const data = await loadMenuPdfData(tenantId, activityId, selectedCatalogId);
            const blob = await renderMenuPdfBlob(data, { includePhotos });

            const base =
                fileName.trim() || `${data.meta.catalogName} - ${data.meta.activityName}`;
            const finalName = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = finalName;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            onClose();
        } catch (error: unknown) {
            console.error("Menu PDF generation failed:", error);
            showToast({ message: "Errore durante la generazione del PDF.", type: "error" });
        } finally {
            setIsDownloading(false);
        }
    };

    const catalogOptions = catalogs.map(c => ({ value: c.id, label: c.name ?? "Catalogo senza nome" }));

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
                        <Button variant="secondary" onClick={onClose} disabled={isDownloading}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleDownload}
                            loading={isDownloading}
                            disabled={!selectedCatalogId || isDownloading || isLoadingCatalogs}
                        >
                            {isDownloading ? "Generazione…" : "Scarica PDF"}
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
                    <Switch
                        label="Includi foto"
                        helperText="Attiva le foto dei piatti. Quelli senza foto mostreranno un segnaposto."
                        checked={includePhotos}
                        onChange={setIncludePhotos}
                        disabled={isDownloading}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
