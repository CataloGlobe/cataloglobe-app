import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Eye, Monitor, Smartphone } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import DeviceFrame from "@/components/ui/DeviceFrame/DeviceFrame";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import styles from "./PreviewPane.module.scss";

/**
 * PreviewPane — la colonna dell'anteprima accanto a un editor: Stili, Storie
 * (design system §5, scheda PreviewPane). Solo il guscio: il renderer
 * pubblico arriva come `children` (in `mode="preview"`), sempre lo stesso
 * della pagina pubblica.
 *
 * Colonna destra sticky · barra sopra: SegmentedControl sm telefono/desktop
 * + stato («Anteprima aggiornata» / «Modifiche non salvate: l'anteprima
 * mostra l'ultima versione salvata») · DeviceFrame. Varianti phone (default)
 * · desktop · plain (senza cornice). Stati: aggiornata · non aggiornata
 * (StatusBadge neutral + testo) · caricamento (Skeleton nella cornice) ·
 * errore di render (InlineBanner error al posto del contenuto).
 * Sotto 1024 va sotto l'editor, collassabile; sotto 768 è un bottone
 * «Anteprima» che apre un drawer lg. La larghezza (40 %, min 360) la dà la
 * pagina.
 */
export type PreviewDevice = "phone" | "desktop" | "plain";

export interface PreviewPaneProps {
    device?: PreviewDevice;
    /** Se assente, lo switch telefono/desktop non si mostra. */
    onDeviceChange?: (device: "phone" | "desktop") => void;
    /** `stale` = modifiche non salvate. */
    status?: "updated" | "stale";
    /** Skeleton dentro la cornice. */
    loading?: boolean;
    /** Errore di render: InlineBanner al posto del contenuto. */
    error?: string;
    /** Titolo della barra e del drawer; default «Anteprima». */
    title?: string;
    children: ReactNode;
    className?: string;
}

const DEVICE_OPTIONS = [
    { value: "phone" as const, label: "Telefono", icon: <Smartphone size={14} /> },
    { value: "desktop" as const, label: "Desktop", icon: <Monitor size={14} /> }
];

export function PreviewPane({ device = "phone", onDeviceChange, status = "updated", loading = false, error, title = "Anteprima", children, className }: PreviewPaneProps) {
    const isPhone = useMediaQuery("(max-width: 767px)");
    const isNarrow = useMediaQuery("(max-width: 1023px)");
    const [collapsed, setCollapsed] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const bodyId = useId();

    // Sotto 768 il dispositivo è già un telefono: nel drawer niente cornice
    // (375 px non starebbero in un drawer da 375).
    const framed = device !== "plain" && !isPhone;
    const content = error ? (
        <div className={styles.errorBox}>
            <InlineBanner variant="error">{error}</InlineBanner>
        </div>
    ) : !framed ? (
        <div className={styles.plain}>{loading ? <Skeleton width="100%" height={320} radius="var(--radius-inner)" /> : children}</div>
    ) : (
        <div className={styles.frameHost}>
            <DeviceFrame format={device === "desktop" ? "desktop" : "mobile"}>
                {loading ? (
                    <div className={styles.frameSkeleton}>
                        <Skeleton width="60%" height={20} radius="var(--radius-inner)" />
                        <Skeleton width="100%" height={140} radius="var(--radius-inner)" />
                        <Skeleton width="80%" height={14} radius="var(--radius-inner)" />
                        <Skeleton width="90%" height={14} radius="var(--radius-inner)" />
                    </div>
                ) : (
                    children
                )}
            </DeviceFrame>
        </div>
    );

    const statusNode =
        status === "stale" ? (
            <div className={styles.status}>
                <StatusBadge variant="neutral" label="Non aggiornata" />
                <Text as="span" variant="caption" colorVariant="muted" className={styles.statusText}>
                    Modifiche non salvate: l'anteprima mostra l'ultima versione salvata
                </Text>
            </div>
        ) : (
            <Text as="span" variant="caption" colorVariant="muted" className={styles.statusText}>
                Anteprima aggiornata
            </Text>
        );

    const bar = (
        <div className={styles.bar}>
            {onDeviceChange && framed ? (
                <SegmentedControl size="sm" value={device} onChange={onDeviceChange} options={DEVICE_OPTIONS} iconsOnly />
            ) : (
                <Text as="span" variant="body-sm" weight={500}>
                    {title}
                </Text>
            )}
            {statusNode}
            {isNarrow && !isPhone && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCollapsed(c => !c)}
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    rightIcon={<ChevronDown size={14} className={collapsed ? "" : styles.chevronOpen} />}
                >
                    {collapsed ? "Mostra" : "Nascondi"}
                </Button>
            )}
        </div>
    );

    if (isPhone) {
        return (
            <div className={`${styles.phoneTrigger} ${className ?? ""}`.trim()}>
                <Button variant="secondary" fullWidth leftIcon={<Eye size={16} />} onClick={() => setDrawerOpen(true)}>
                    {title}
                </Button>
                {status === "stale" && (
                    <Text as="span" variant="caption" colorVariant="muted">
                        Modifiche non salvate: mostra l'ultima versione salvata
                    </Text>
                )}
                <SystemDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} size="lg" aria-label={title}>
                    <DrawerLayout title={title} onClose={() => setDrawerOpen(false)}>
                        <div className={styles.drawerBody}>
                            {bar}
                            {content}
                        </div>
                    </DrawerLayout>
                </SystemDrawer>
            </div>
        );
    }

    return (
        <aside className={[styles.pane, isNarrow ? styles.narrow : "", className ?? ""].join(" ").trim()} aria-label={title}>
            {bar}
            <div id={bodyId} className={styles.body} hidden={isNarrow && collapsed}>
                {content}
            </div>
        </aside>
    );
}
