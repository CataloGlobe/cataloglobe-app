import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Menu } from "@/components/ui/Menu/Menu";
import Text from "@/components/ui/Text/Text";
import { QrCode, type QrCodeHandle, type QrCodeImageSettings } from "@/components/ui/QrCode/QrCode";
import { ExportCatalogDrawer } from "../tabs/ExportCatalogDrawer";
import { ActivitySlugDrawer } from "../tabs/info/ActivitySlugDrawer";
import { ActivityQrDrawer, QR_DEFAULT_BG, QR_DEFAULT_FG } from "../components/ActivityQrDrawer";
import { useActivityDetail } from "../ActivityDetailContext";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { getActivitySlugAliases } from "@/services/supabase/activitySlugAliases";
import type { ActivitySlugAlias } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import { buildPublicUrl } from "@/utils/publicUrl";
import styles from "./ActivityPubblicazioneRoute.module.scss";

/**
 * Link e QR (Officina 3): come si raggiunge questo locale. In fondo al
 * biglietto da visita, a tutta larghezza: indirizzo, QR, menù in PDF. Lo
 * stato e l'eliminazione sono passati nel «⋯» della testata. Le azioni sono
 * immediate (§31.4); i colori del QR stanno nel draft di pagina.
 */
export default function ActivityPubblicazioneRoute() {
    const { activity, tenantId, reload, canManage, draft } = useActivityDetail();
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();

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

    // ── Indirizzi precedenti (cambio indirizzo, operazione a sé) ────────────
    const [isSlugOpen, setIsSlugOpen] = useState(false);
    const [aliases, setAliases] = useState<ActivitySlugAlias[]>([]);
    const loadAliases = useCallback(async () => {
        try {
            setAliases(await getActivitySlugAliases(activity.id, tenantId));
        } catch {
            // Non critico: la riga dice «nessuno».
        }
    }, [activity.id, tenantId]);
    useEffect(() => {
        void loadAliases();
    }, [loadAliases]);

    // ── PDF ─────────────────────────────────────────────────────────────────
    const [isExportOpen, setIsExportOpen] = useState(false);

    return (
        <div className={styles.page}>
            <Card
                title="Link e QR"
                subtitle="Da stampare sul tavolo, sulla vetrina, sul volantino"
                actions={
                    canManage ? (
                        <Button variant="secondary" size="sm" onClick={() => setIsSlugOpen(true)}>
                            Cambia indirizzo
                        </Button>
                    ) : undefined
                }
                flush
            >
                <ListRow
                    title="Indirizzo attuale"
                    subtitle={publicUrl}
                    trailing={
                        <div className={styles.rowActions}>
                            <Button variant="secondary" size="sm" onClick={() => void handleCopyLink()}>
                                Copia
                            </Button>
                            <Button
                                as="a"
                                variant="ghost"
                                size="sm"
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                rightIcon={<ExternalLink size={14} strokeWidth={1.75} aria-hidden />}
                            >
                                Apri
                            </Button>
                        </div>
                    }
                />
                <ListRow
                    title="Indirizzi precedenti"
                    subtitle={aliases.length === 0 ? "Nessuno" : `${aliases.length} · i vecchi link continuano a funzionare`}
                    onClick={() => setIsSlugOpen(true)}
                />
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
                        {/* U5: il resolver segue gli indirizzi precedenti
                            (activity_slug_aliases), finché non si rimuovono. */}
                        <Text variant="caption" colorVariant="muted">
                            Se cambi indirizzo, il QR già stampato continua a funzionare, finché non rimuovi il vecchio
                            indirizzo dagli indirizzi precedenti.
                        </Text>
                        <div className={styles.rowActions}>
                            <Button variant="secondary" size="sm" onClick={() => setIsQrDrawerOpen(true)}>
                                Personalizza
                            </Button>
                            <Menu
                                trigger={
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        rightIcon={<ChevronDown size={14} strokeWidth={1.75} aria-hidden />}
                                    >
                                        Scarica
                                    </Button>
                                }
                            >
                                <Menu.Item
                                    description="Per la stampa e i documenti"
                                    onSelect={() => void qrRef.current?.downloadPng()}
                                >
                                    PNG
                                </Menu.Item>
                                <Menu.Item
                                    description="Per la tipografia: resta nitido a ogni misura"
                                    onSelect={() => qrRef.current?.downloadSvg()}
                                >
                                    SVG
                                </Menu.Item>
                            </Menu>
                        </div>
                    </div>
                </div>
            </Card>

            <Card
                layout="row"
                title="Menù in PDF"
                subtitle="Scegli menù, stile e cosa includere"
                actions={
                    <Button variant="secondary" size="sm" onClick={() => setIsExportOpen(true)}>
                        Crea il PDF
                    </Button>
                }
            />

            <ActivitySlugDrawer
                open={isSlugOpen}
                onClose={() => setIsSlugOpen(false)}
                activity={activity}
                tenantId={tenantId}
                aliases={aliases}
                onSuccess={() => {
                    void reload();
                    void loadAliases();
                }}
                onAliasRemoved={loadAliases}
                canEdit={canManage}
            />
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
        </div>
    );
}
