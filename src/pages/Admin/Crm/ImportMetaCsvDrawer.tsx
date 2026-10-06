import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { ingestCrmLead, recordCrmImportRun } from "@/services/supabase/crm";
import { decodeMetaCsv, parseMetaLeadsCsv, type MetaCsvResult } from "@/utils/crm/metaCsv";
import type { CrmIngestOutcome } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Import dei lead dal Centro lead di Meta (Business Suite → Lead → Scarica).
 *
 * Serve finché il webhook dei moduli Meta non è attivo, e come piano B se il
 * webhook si ferma. Ogni riga passa da `crm_ingest_lead` con source
 * `meta_form` e l'id del lead Meta: reimportare lo stesso file non crea
 * doppioni, nemmeno dopo aver cancellato il locale (crm_imported_refs), e il
 * webhook non reimporterà quello che è già entrato da qui. Le righe entrano in
 * silenzio: su Telegram arriva un solo riepilogo dell'import.
 */

type Props = {
    open: boolean;
    onClose: () => void;
    onImported: () => Promise<void> | void;
};

type ImportReport = Record<CrmIngestOutcome | "failed", number>;

export function ImportMetaCsvDrawer({ open, onClose, onImported }: Props) {
    const { showToast } = useToast();
    const [fileName, setFileName] = useState<string | null>(null);
    const [parsed, setParsed] = useState<MetaCsvResult | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [report, setReport] = useState<ImportReport | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setFileName(null);
        setParsed(null);
        setIsImporting(false);
        setProgress(0);
        setReport(null);
        setFileError(null);
    }, [open]);

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setReport(null);
        setFileError(null);
        setFileName(file.name);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            setParsed(await parseMetaLeadsCsv(decodeMetaCsv(bytes)));
        } catch {
            setParsed(null);
            setFileError("Non riesco a leggere questo file. È il CSV scaricato da Meta?");
        }
    }

    // Durante l'import il drawer non si chiude (né da Annulla né da fuori):
    // il ciclo continuerebbe in sottofondo e una riapertura ne lancerebbe un secondo.
    function handleClose() {
        if (isImporting) return;
        onClose();
    }

    async function handleImport() {
        if (!parsed || parsed.rows.length === 0) return;
        setIsImporting(true);
        const counts: ImportReport = { created: 0, returned: 0, duplicate: 0, suppressed: 0, failed: 0 };
        // Una riga alla volta: crm_ingest_lead serializza comunque gli
        // ingressi, e così l'avanzamento è leggibile.
        for (let i = 0; i < parsed.rows.length; i++) {
            try {
                // Silenzioso: niente messaggio Telegram per riga.
                const result = await ingestCrmLead({ ...parsed.rows[i].input, silent: true });
                counts[result.outcome] += 1;
            } catch {
                counts.failed += 1;
            }
            setProgress(i + 1);
        }
        setReport(counts);
        setIsImporting(false);
        // Il riepilogo Telegram è un di più: se non si registra, l'import resta valido.
        let summaryRecorded = true;
        try {
            await recordCrmImportRun(counts);
        } catch {
            summaryRecorded = false;
        }
        await onImported();
        showToast({
            message:
                `Import finito: ${counts.created} nuovi, ${counts.returned} già nel CRM` +
                (counts.duplicate > 0 ? `, ${counts.duplicate} già importati` : "") +
                (counts.suppressed > 0 ? `, ${counts.suppressed} esclusi (stop)` : "") +
                (counts.failed > 0 ? `, ${counts.failed} non entrati` : "") +
                "." +
                (summaryRecorded ? "" : " Il riepilogo su Telegram non è partito."),
            type: counts.failed > 0 || !summaryRecorded ? "warning" : "success"
        });
    }

    const readyCount = parsed?.rows.length ?? 0;

    return (
        <SystemDrawer open={open} onClose={handleClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Importa CSV Meta
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={handleClose} disabled={isImporting}>
                            {report ? "Chiudi" : "Annulla"}
                        </Button>
                        {!report && (
                            <Button
                                variant="primary"
                                onClick={() => void handleImport()}
                                loading={isImporting}
                                disabled={readyCount === 0}
                            >
                                {readyCount === 1 ? "Importa 1 lead" : `Importa ${readyCount} lead`}
                            </Button>
                        )}
                    </>
                }
            >
                <div className={styles.drawerForm}>
                    <Text variant="body-sm" colorVariant="muted">
                        Su Meta Business Suite: Tutti gli strumenti → Centro lead → seleziona i
                        lead → Scarica → CSV. Reimportare lo stesso file non crea doppioni.
                    </Text>

                    <label className={styles.fileField}>
                        <Text variant="body-sm" weight={600}>
                            File CSV
                        </Text>
                        <input
                            type="file"
                            accept=".csv,text/csv,text/tab-separated-values"
                            onChange={e => void handleFile(e)}
                            disabled={isImporting}
                        />
                        {fileName && (
                            <Text variant="caption" colorVariant="muted">
                                {fileName}
                            </Text>
                        )}
                        {fileError && (
                            <Text variant="body-sm" colorVariant="error">
                                {fileError}
                            </Text>
                        )}
                    </label>

                    {parsed && !report && (
                        <div className={styles.importSummary}>
                            <Text variant="body" weight={600}>
                                {readyCount === 0
                                    ? "Nessun lead da importare."
                                    : `${readyCount} ${readyCount === 1 ? "lead pronto" : "lead pronti"}.`}
                            </Text>
                            {isImporting && (
                                <Text variant="body-sm" colorVariant="muted">
                                    Import in corso: {progress} di {readyCount}.
                                </Text>
                            )}
                            {parsed.errors.length > 0 && (
                                <>
                                    <Text variant="body-sm" colorVariant="warning">
                                        {parsed.errors.length === 1
                                            ? "1 riga scartata:"
                                            : `${parsed.errors.length} righe scartate:`}
                                    </Text>
                                    <ul className={styles.errorList}>
                                        {parsed.errors.map(err => (
                                            <li key={err.line}>
                                                <Text variant="body-sm">
                                                    Riga {err.line}: {err.reason}
                                                </Text>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}

                    {report && (
                        <div className={styles.importSummary}>
                            <Text variant="body" weight={600}>
                                Import finito.
                            </Text>
                            <Text variant="body-sm">Nuovi locali: {report.created}</Text>
                            <Text variant="body-sm">
                                Già nel CRM per telefono (richiesta aggiunta): {report.returned}
                            </Text>
                            <Text variant="body-sm">Già importati prima: {report.duplicate}</Text>
                            {report.suppressed > 0 && (
                                <Text variant="body-sm">
                                    Esclusi perché hanno chiesto di non essere contattati:{" "}
                                    {report.suppressed}
                                </Text>
                            )}
                            {report.failed > 0 && (
                                <Text variant="body-sm" colorVariant="error">
                                    Non entrati: {report.failed}. Riprova lo stesso file: le
                                    righe già entrate non si ripetono.
                                </Text>
                            )}
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
