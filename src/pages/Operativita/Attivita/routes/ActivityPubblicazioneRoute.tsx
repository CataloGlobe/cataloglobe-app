import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusStrip } from "@/components/ui/StatusStrip/StatusStrip";
import Text from "@/components/ui/Text/Text";
import { QrCode, type QrCodeHandle, type QrCodeImageSettings } from "@/components/ui/QrCode/QrCode";
import { DeleteActivityDialog } from "@/components/Businesses/DeleteActivityDialog/DeleteActivityDialog";
import { ExportCatalogDrawer } from "../tabs/ExportCatalogDrawer";
import { SuspendActivityDialog } from "../components/SuspendActivityDialog";
import { ActivityQrDrawer, QR_DEFAULT_BG, QR_DEFAULT_FG } from "../components/ActivityQrDrawer";
import { useActivityDetail } from "../ActivityDetailContext";
import { updateActivity } from "@/services/supabase/activities";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import { buildPublicUrl } from "@/utils/publicUrl";
import { formatInactiveReason, type InactiveReason } from "@/utils/activityStatus";
import styles from "./ActivityPubblicazioneRoute.module.scss";

/**
 * Pubblicazione (§31.1): come si raggiunge questo locale, e se è
 * raggiungibile. Indirizzo, QR, menù in PDF, stato, eliminazione. Le azioni
 * sono immediate (§31.4); i colori del QR stanno nel draft di pagina.
 */
export default function ActivityPubblicazioneRoute() {
    const { activity, tenantId, businessId, reload, canManage, canDelete, draft } = useActivityDetail();
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const navigate = useNavigate();

    const publicUrl = buildPublicUrl(activity.slug);
    const isActive = activity.status === "active";

    // ── QR ──────────────────────────────────────────────────────────────────
    const qrRef = useRef<QrCodeHandle>(null);
    const [isQrDrawerOpen, setIsQrDrawerOpen] = useState(false);
    const [showLogo, setShowLogo] = useState(true);
    const fgColor = draft.draft.qr_fg_color ?? QR_DEFAULT_FG;
    const bgColor = draft.draft.qr_bg_color ?? QR_DEFAULT_BG;

    const logoUrl = useMemo(() => {
        const path = selectedTenant?.logo_url;
        if (!path) return null;
        return path.startsWith("http") ? path : getTenantLogoPublicUrl(path);
    }, [selectedTenant?.logo_url]);

    const qrImageSettings: QrCodeImageSettings | undefined =
        logoUrl && showLogo
            ? { src: logoUrl, width: 30, height: 30, excavate: true, crossOrigin: "anonymous" }
            : undefined;

    // ── Indirizzo ───────────────────────────────────────────────────────────
    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            showToast({ message: "URL copiato.", type: "success" });
        } catch {
            showToast({ message: "Impossibile copiare l'URL.", type: "error" });
        }
    }, [publicUrl, showToast]);

    // ── PDF ─────────────────────────────────────────────────────────────────
    const [isExportOpen, setIsExportOpen] = useState(false);

    // ── Stato ───────────────────────────────────────────────────────────────
    const [isSuspendOpen, setIsSuspendOpen] = useState(false);
    const [suspendMode, setSuspendMode] = useState<"suspend" | "edit-reason">("suspend");
    const [isResuming, setIsResuming] = useState(false);

    const handleResume = useCallback(async () => {
        setIsResuming(true);
        try {
            await updateActivity(activity.id, tenantId, { status: "active", inactive_reason: null });
            await reload();
            showToast({ message: "Sede pubblicata.", type: "success" });
        } catch {
            showToast({ message: "Impossibile riprendere la pubblicazione.", type: "error" });
        } finally {
            setIsResuming(false);
        }
    }, [activity.id, tenantId, reload, showToast]);

    const handleSuspendConfirm = useCallback(
        async (reason: InactiveReason): Promise<boolean> => {
            try {
                if (suspendMode === "edit-reason") {
                    await updateActivity(activity.id, tenantId, { inactive_reason: reason });
                    await reload();
                    showToast({ message: "Motivo aggiornato.", type: "success" });
                } else {
                    await updateActivity(activity.id, tenantId, { status: "inactive", inactive_reason: reason });
                    await reload();
                    showToast({ message: "Sede sospesa.", type: "success" });
                }
                return true;
            } catch {
                showToast({
                    message: suspendMode === "edit-reason" ? "Impossibile aggiornare il motivo." : "Impossibile sospendere la sede.",
                    type: "error"
                });
                return false;
            }
        },
        [activity.id, tenantId, suspendMode, reload, showToast]
    );

    // ── Elimina ─────────────────────────────────────────────────────────────
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    return (
        <div className={styles.page}>
            <Card title="Indirizzo pubblico" flush>
                <ListRow
                    title="URL"
                    subtitle={publicUrl}
                    trailing={
                        <div className={styles.rowActions}>
                            <Button variant="secondary" size="sm" onClick={() => void handleCopyLink()}>
                                Copia
                            </Button>
                            <Button as="a" variant="ghost" size="sm" href={publicUrl} target="_blank" rel="noopener noreferrer">
                                Apri in una nuova scheda
                            </Button>
                        </div>
                    }
                />
            </Card>

            <Card
                title="QR code"
                subtitle="Da stampare sul tavolo, sulla vetrina, sul volantino"
                actions={
                    <>
                        <Button variant="ghost" size="sm" onClick={() => void qrRef.current?.downloadPng()}>
                            Scarica PNG
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => qrRef.current?.downloadSvg()}>
                            Scarica SVG
                        </Button>
                    </>
                }
            >
                <div className={styles.qrRow}>
                    <QrCode
                        ref={qrRef}
                        value={publicUrl}
                        size="lg"
                        level="H"
                        fgColor={fgColor}
                        bgColor={bgColor}
                        imageSettings={qrImageSettings}
                        fileName={`qr-${activity.slug}`}
                        showActions={false}
                        status={isActive ? "ready" : "unavailable"}
                    />
                    <div className={styles.qrText}>
                        <Text variant="body-sm" colorVariant="muted">
                            {isActive
                                ? "Chi lo inquadra apre la pagina pubblica di questa sede."
                                : "La sede è sospesa: chi lo inquadra legge il motivo, non il menù."}
                        </Text>
                        <div>
                            <Button variant="secondary" size="sm" onClick={() => setIsQrDrawerOpen(true)}>
                                Personalizza
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            <Card
                title="Menù in PDF"
                subtitle="Una versione stampabile del menù attivo"
                actions={
                    <Button variant="secondary" size="sm" onClick={() => setIsExportOpen(true)}>
                        Esporta
                    </Button>
                }
            >
                <Text variant="body-sm" colorVariant="muted">
                    Scegli menù, stile e cosa includere: l'export apre un pannello a sé perché è una cosa che si
                    produce, non una che si configura.
                </Text>
            </Card>

            <Card title="Stato">
                <StatusStrip
                    tone={isActive ? "success" : "neutral"}
                    badge={isActive ? "Pubblicata" : "Sospesa"}
                    title={
                        isActive
                            ? "Chiunque abbia il link o il QR vede il menù"
                            : `Sospesa · ${activity.inactive_reason ? formatInactiveReason(activity.inactive_reason) : "senza motivo"}`
                    }
                    description={
                        isActive
                            ? "Sospendere chiede il motivo: manutenzione, chiusura temporanea, non disponibile."
                            : "La pagina pubblica mostra il motivo al posto del menù finché non riprendi."
                    }
                    action={
                        canManage ? (
                            isActive ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSuspendMode("suspend");
                                        setIsSuspendOpen(true);
                                    }}
                                >
                                    Sospendi la pubblicazione
                                </Button>
                            ) : (
                                <div className={styles.rowActions}>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            setSuspendMode("edit-reason");
                                            setIsSuspendOpen(true);
                                        }}
                                    >
                                        Modifica il motivo
                                    </Button>
                                    <Button variant="primary" size="sm" onClick={() => void handleResume()} loading={isResuming}>
                                        Riprendi la pubblicazione
                                    </Button>
                                </div>
                            )
                        ) : undefined
                    }
                />
            </Card>

            {canDelete && (
                <Card variant="danger" title="Elimina il locale">
                    <div className={styles.dangerBody}>
                        <Text variant="body-sm" colorVariant="muted">
                            Elimina la sede e tutto ciò che le appartiene: tavoli, QR, prenotazioni, storico ordini,
                            stampanti collegate. Irreversibile. L'indirizzo web si libera e i link in giro smettono di
                            funzionare.
                        </Text>
                        <div>
                            <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
                                Elimina questa sede
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            <ActivityQrDrawer
                open={isQrDrawerOpen}
                onClose={() => setIsQrDrawerOpen(false)}
                value={publicUrl}
                fileName={`qr-${activity.slug}`}
                fgColor={fgColor}
                bgColor={bgColor}
                onFgColorChange={color => draft.set("qr_fg_color", color)}
                onBgColorChange={color => draft.set("qr_bg_color", color)}
                showLogo={showLogo}
                onShowLogoChange={setShowLogo}
                logoUrl={logoUrl}
                canEdit={canManage}
            />
            <ExportCatalogDrawer
                open={isExportOpen}
                onClose={() => setIsExportOpen(false)}
                activityId={activity.id}
                activityName={activity.name}
                tenantId={tenantId}
            />
            <SuspendActivityDialog
                isOpen={isSuspendOpen}
                onClose={() => setIsSuspendOpen(false)}
                onConfirm={handleSuspendConfirm}
                mode={suspendMode}
                initialReason={suspendMode === "edit-reason" ? activity.inactive_reason : null}
            />
            <DeleteActivityDialog
                isOpen={isDeleteOpen}
                activity={{ id: activity.id, name: activity.name }}
                businessId={businessId}
                tenantId={tenantId}
                onClose={() => setIsDeleteOpen(false)}
                onDeleted={() => navigate(`/business/${businessId}/locations`)}
            />
        </div>
    );
}
