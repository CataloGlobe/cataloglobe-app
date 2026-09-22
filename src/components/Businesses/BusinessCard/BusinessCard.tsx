import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Clock, AlertTriangle, FileText, ExternalLink, Link as LinkIcon, Edit, Trash2 } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useToast } from "@/context/Toast/ToastContext";
import { formatInactiveReason } from "@/utils/activityStatus";
import { formatOverrideSummary } from "@/services/supabase/activeCatalog";
import {
    ACTIVE_CATALOG_ERROR_LABEL,
    ACTIVE_CATALOG_NONE_SHORT_LABEL,
    activeCatalogDisplayName,
    deriveActiveCatalogState
} from "@/utils/activeCatalogStatus";
import { buildPublicUrl } from "@/utils/publicUrl";
import type { BusinessCardProps } from "@/types/Businesses";
import styles from "./BusinessCard.module.scss";

/**
 * Una sede nella griglia: `CardGridItem` con la copertina, nome e indirizzo,
 * lo stato di pubblicazione, il «⋯» delle azioni e, in fondo, il menù attivo
 * adesso con «Gestisci». La card porta alla scheda della sede.
 */
export const BusinessCard: React.FC<BusinessCardProps> = ({
    business,
    onEdit,
    onDelete,
    activeCatalog,
    catalogsStatus = "loading",
    onManageAvailability
}) => {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const { showToast } = useToast();
    const publicUrl = buildPublicUrl(business.slug);
    const catalogState = deriveActiveCatalogState(catalogsStatus, activeCatalog);
    const detailPath = `/business/${businessId}/locations/${business.id}`;
    const suspended = business.status === "inactive";

    const badge = suspended ? (
        <StatusBadge
            variant="neutral"
            label={business.inactive_reason ? `Sospesa · ${formatInactiveReason(business.inactive_reason)}` : "Sospesa"}
        />
    ) : (
        <StatusBadge variant="success" label="Pubblicata" />
    );

    // Un solo blocco per i quattro stati del menù attivo: cambia il testo,
    // non la struttura, così la card non salta quando il dato arriva.
    const overrideSummary =
        catalogState === "resolved" && activeCatalog
            ? formatOverrideSummary(activeCatalog.hiddenCount, activeCatalog.unavailableCount)
            : null;

    const footer = (
        <div className={styles.footer}>
            <div className={styles.footerMain}>
                <span className={styles.footerIcon} aria-hidden="true">
                    <Clock size={14} strokeWidth={2} />
                </span>
                <div className={styles.footerText}>
                    <Text as="span" variant="caption" colorVariant="muted">
                        Menu attivo ora
                    </Text>
                    {catalogState === "loading" ? (
                        <Skeleton height="13px" width="118px" radius="var(--radius-inner)" />
                    ) : catalogState === "resolved" ? (
                        <Text as="span" variant="caption" weight={600} className={styles.footerValue}>
                            {activeCatalogDisplayName(activeCatalog)}
                        </Text>
                    ) : (
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.footerValue}>
                            {catalogState === "error" ? ACTIVE_CATALOG_ERROR_LABEL : ACTIVE_CATALOG_NONE_SHORT_LABEL}
                        </Text>
                    )}
                </div>
                {/* Anche a stato ignoto: il drawer risolve il catalogo da sé.
                    Nascosto a loading e none, dove non c'è nulla su cui operare. */}
                {(catalogState === "resolved" || catalogState === "error") && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onManageAvailability?.(business.id, business.name)}
                    >
                        Gestisci
                    </Button>
                )}
            </div>
            {overrideSummary && (
                <div className={styles.footerWarning}>
                    <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
                    <Text as="span" variant="caption" colorVariant="muted">
                        {overrideSummary}
                    </Text>
                </div>
            )}
        </div>
    );

    return (
        <CardGridItem
            image={business.cover_image ?? undefined}
            imageAlt={`Copertina di ${business.name}`}
            media={
                business.cover_image ? undefined : (
                    <span className={styles.placeholder} aria-hidden="true">
                        <Building2 size={32} strokeWidth={1.5} />
                    </span>
                )
            }
            title={business.name}
            subtitle={[business.address, business.city].filter(Boolean).join(", ")}
            badge={badge}
            suspended={suspended}
            to={detailPath}
            footer={footer}
            actions={
                <TableRowActions
                    ariaLabel="Azioni sede"
                    actions={[
                        { label: "Apri dettaglio", icon: FileText, onClick: () => navigate(detailPath) },
                        {
                            label: "Apri URL pubblico",
                            icon: ExternalLink,
                            onClick: () => window.open(publicUrl, "_blank", "noopener,noreferrer")
                        },
                        {
                            label: "Copia link",
                            icon: LinkIcon,
                            onClick: () => {
                                void navigator.clipboard.writeText(publicUrl);
                                showToast({ message: "Link copiato negli appunti.", type: "success" });
                            }
                        },
                        { label: "Modifica", icon: Edit, onClick: () => onEdit(business), separator: true },
                        {
                            label: "Elimina",
                            icon: Trash2,
                            onClick: () => onDelete?.(business.id),
                            variant: "destructive",
                            hidden: !onDelete
                        }
                    ]}
                />
            }
        />
    );
};
