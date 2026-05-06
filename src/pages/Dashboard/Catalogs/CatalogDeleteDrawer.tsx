import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconAlertTriangle } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { deleteCatalog, type V2Catalog } from "@/services/supabase/catalogs";
import {
    listSchedulesUsingCatalog,
    type CatalogScheduleUsage
} from "@/services/supabase/layoutScheduling";
import { isPostgrestFKError } from "@/utils/supabaseErrors";
import styles from "./CatalogDeleteDrawer.module.scss";

const MAX_VISIBLE_SCHEDULES = 10;

type ScheduleStatus = "active" | "scheduled" | "expired" | "disabled";

interface CatalogDeleteDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    catalog: V2Catalog | null;
    tenantId: string;
    businessId: string;
    catalogLabel: string;
    onSuccess: () => void | Promise<void>;
}

const STATUS_LABEL: Record<ScheduleStatus, string> = {
    active: "Attiva",
    scheduled: "Programmata",
    expired: "Scaduta",
    disabled: "Disabilitata"
};

const STATUS_PILL_CLASS: Record<ScheduleStatus, string> = {
    active: styles.pillActive,
    scheduled: styles.pillScheduled,
    expired: styles.pillExpired,
    disabled: styles.pillDisabled
};

function deriveScheduleStatus(rule: CatalogScheduleUsage, now: Date): ScheduleStatus {
    if (!rule.enabled) return "disabled";
    if (rule.end_at !== null && new Date(rule.end_at) < now) return "expired";
    if (rule.start_at !== null && new Date(rule.start_at) > now) return "scheduled";
    return "active";
}

function StatusPill({ status }: { status: ScheduleStatus }) {
    return (
        <span className={`${styles.pill} ${STATUS_PILL_CLASS[status]}`}>
            {STATUS_LABEL[status]}
        </span>
    );
}

export function CatalogDeleteDrawer({
    isOpen,
    onClose,
    catalog,
    tenantId,
    businessId,
    catalogLabel,
    onSuccess
}: CatalogDeleteDrawerProps) {
    const { showToast } = useToast();
    const [schedulesUsing, setSchedulesUsing] = useState<CatalogScheduleUsage[] | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadUsage = useCallback(async (): Promise<void> => {
        if (!catalog) return;
        setIsLoadingUsage(true);
        try {
            const data = await listSchedulesUsingCatalog(tenantId, catalog.id);
            setSchedulesUsing(data);
        } catch (err) {
            console.error("Errore caricamento regole bloccanti:", err);
            setSchedulesUsing([]);
            showToast({
                message: "Impossibile verificare l'utilizzo, procedi con cautela.",
                type: "error"
            });
        } finally {
            setIsLoadingUsage(false);
        }
    }, [tenantId, catalog, showToast]);

    useEffect(() => {
        if (!isOpen || !catalog) {
            setSchedulesUsing(null);
            setIsDeleting(false);
            return;
        }
        void loadUsage();
    }, [isOpen, catalog, loadUsage]);

    const handleDelete = async (): Promise<void> => {
        if (!catalog) return;
        if (schedulesUsing && schedulesUsing.length > 0) return;

        setIsDeleting(true);
        try {
            await deleteCatalog(catalog.id, tenantId);
            showToast({ message: "Catalogo eliminato.", type: "success" });
            await onSuccess();
            onClose();
        } catch (err) {
            if (isPostgrestFKError(err)) {
                showToast({
                    message:
                        "Il catalogo è ora utilizzato da una regola creata di recente. Aggiorno l'elenco...",
                    type: "error"
                });
                await loadUsage();
            } else {
                console.error("Errore eliminazione catalogo:", err);
                showToast({ message: "Errore durante l'eliminazione.", type: "error" });
            }
        } finally {
            setIsDeleting(false);
        }
    };

    if (!catalog) return null;

    const now = new Date();
    const blocking = schedulesUsing ?? [];
    const hasBlocking = blocking.length > 0;
    const visibleSchedules = blocking.slice(0, MAX_VISIBLE_SCHEDULES);
    const hiddenCount = blocking.length - visibleSchedules.length;

    const statuses = blocking.map(rule => deriveScheduleStatus(rule, now));
    const hasActiveOrScheduled = statuses.some(s => s === "active" || s === "scheduled");
    const bannerVariant: "warning" | "info" = hasActiveOrScheduled ? "warning" : "info";

    const isDeleteDisabled = isLoadingUsage || hasBlocking;
    const tooltipMessage = "Rimuovi prima i collegamenti dalle regole";
    const catalogLabelLower = catalogLabel.toLowerCase();

    const deleteButton = (
        <Button
            variant="danger"
            onClick={handleDelete}
            loading={isDeleting}
            disabled={isDeleteDisabled}
        >
            Elimina
        </Button>
    );

    return (
        <SystemDrawer open={isOpen} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <div className={styles.header}>
                        <Text variant="title-sm" weight={600} colorVariant="error">
                            {`Elimina ${catalogLabel}`}
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        {hasBlocking ? (
                            <Tooltip content={tooltipMessage}>
                                <span className={styles.deleteButtonWrapper}>{deleteButton}</span>
                            </Tooltip>
                        ) : (
                            deleteButton
                        )}
                    </>
                }
            >
                <div className={styles.body}>
                    <div className={styles.warningBox}>
                        <IconAlertTriangle size={20} className={styles.warningIcon} />
                        <div className={styles.warningCopy}>
                            <Text variant="body-sm" weight={600}>
                                Attenzione
                            </Text>
                            <Text variant="body-sm">
                                Sei sicuro di voler eliminare il {catalogLabelLower}{" "}
                                <strong>{catalog.name}</strong>? Tutta la struttura di categorie e
                                i collegamenti ai prodotti verranno eliminati in modo
                                irreversibile. I prodotti originali non verranno cancellati dal tuo
                                database.
                            </Text>
                        </div>
                    </div>

                    {isLoadingUsage && (
                        <div className={styles.usageLoading}>
                            <Text variant="body-sm" colorVariant="muted">
                                Verifica utilizzo in regole di programmazione...
                            </Text>
                        </div>
                    )}

                    {!isLoadingUsage && hasBlocking && (
                        <div className={styles.usageSection}>
                            <Text
                                variant="caption"
                                colorVariant="muted"
                                className={styles.sectionLabel}
                            >
                                Regole di programmazione collegate
                            </Text>

                            <InlineBanner variant={bannerVariant}>
                                {hasActiveOrScheduled
                                    ? `Questo catalogo è utilizzato da ${blocking.length} ${
                                          blocking.length === 1 ? "regola" : "regole"
                                      }. Rimuovi i collegamenti prima di eliminarlo.`
                                    : `Questo catalogo è collegato a ${blocking.length} ${
                                          blocking.length === 1 ? "regola" : "regole"
                                      } disabilitate o scadute. Eliminalo solo se sei sicuro: le regole resteranno orfane.`}
                            </InlineBanner>

                            <ul className={styles.scheduleList}>
                                {visibleSchedules.map(rule => {
                                    const status = deriveScheduleStatus(rule, now);
                                    return (
                                        <li key={rule.id} className={styles.scheduleItem}>
                                            <Link
                                                to={`/business/${businessId}/scheduling/${rule.id}`}
                                                className={styles.scheduleLink}
                                            >
                                                <Text
                                                    variant="body-sm"
                                                    className={styles.scheduleName}
                                                >
                                                    {rule.name ?? "Regola senza nome"}
                                                </Text>
                                                <StatusPill status={status} />
                                            </Link>
                                        </li>
                                    );
                                })}
                                {hiddenCount > 0 && (
                                    <li className={styles.scheduleItem}>
                                        <Link
                                            to={`/business/${businessId}/scheduling`}
                                            className={styles.scheduleMoreLink}
                                        >
                                            <Text variant="body-sm" colorVariant="muted">
                                                Altre {hiddenCount}{" "}
                                                {hiddenCount === 1 ? "regola" : "regole"}...
                                            </Text>
                                        </Link>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
