import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, AlertTriangle, Store, ExternalLink, Link as LinkIcon } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useToast } from "@/context/Toast/ToastContext";
import { ACTIVE_LABEL, formatInactiveReason } from "@/utils/activityStatus";
import { formatOverrideSummary } from "@/services/supabase/activeCatalog";
import {
    ACTIVE_CATALOG_ERROR_LABEL,
    activeCatalogDisplayName,
    deriveActiveCatalogState
} from "@/utils/activeCatalogStatus";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { buildPublicUrl } from "@/utils/publicUrl";
import type { BusinessCardProps } from "@/types/Businesses";
import { PendingReservationsLink } from "../PendingReservationsLink/PendingReservationsLink";
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
    onManageAvailability,
    pendingReservations = 0
}) => {
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const { showToast } = useToast();
    const { catalogLabel } = useVerticalConfig();
    const publicUrl = buildPublicUrl(business.slug);
    const catalogState = deriveActiveCatalogState(catalogsStatus, activeCatalog);
    const detailPath = `/business/${businessId}/locations/${business.id}`;
    const suspended = business.status === "inactive";

    // Un solo blocco per i quattro stati del menù attivo: cambia il testo,
    // non la struttura, così la card non salta quando il dato arriva.
    const overrideSummary =
        !suspended && catalogState === "resolved" && activeCatalog
            ? formatOverrideSummary(activeCatalog.hiddenCount, activeCatalog.unavailableCount)
            : null;

    // S1: l'avviso «N nascosti, N non disponibili» sta nel corpo, accanto
    // allo stato, in warning-700 con l'icona.
    const badge = (
        <div className={styles.status}>
            {suspended ? (
                <StatusBadge
                    variant="neutral"
                    label={business.inactive_reason ? `Sospesa · ${formatInactiveReason(business.inactive_reason)}` : "Sospesa"}
                />
            ) : (
                <StatusBadge variant="success" label={ACTIVE_LABEL} />
            )}
            {overrideSummary && (
                <span className={styles.overrides}>
                    <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
                    <Text as="span" variant="caption" className={styles.overridesText}>
                        {overrideSummary}
                    </Text>
                </span>
            )}
        </div>
    );

    // S2: sospesa → la pagina pubblica non si vede, non «menù attivo»; senza
    // menù → l'avviso ambra di Panoramica. «Gestisci» su ogni card.
    const menuValue = suspended ? (
        <Text as="span" variant="caption" weight={600} className={styles.footerValue}>
            Non visibile ai clienti
        </Text>
    ) : catalogState === "loading" ? (
        <Skeleton height="13px" width="118px" radius="var(--radius-inner)" />
    ) : catalogState === "resolved" ? (
        <Text as="span" variant="caption" weight={600} className={styles.footerValue}>
            {activeCatalogDisplayName(activeCatalog)}
        </Text>
    ) : catalogState === "none" ? (
        <StatusBadge variant="warning" label={`Nessun ${catalogLabel.toLowerCase()} attivo`} />
    ) : (
        <Text as="span" variant="caption" colorVariant="muted" className={styles.footerValue}>
            {ACTIVE_CATALOG_ERROR_LABEL}
        </Text>
    );

    // S1: piede ad altezza fissa, uguale in ogni card.
    const footer = (
        <div className={styles.footer}>
            <div className={styles.footerText}>
                <Text as="span" variant="caption" colorVariant="muted">
                    {suspended ? "Pagina pubblica" : `${catalogLabel} adesso`}
                </Text>
                {menuValue}
            </div>
            {/* Fuori dal link della card (un link non ne contiene un altro):
                porta alla coda di questa sede. Sulla stessa riga, così il
                piede resta alto 68 px. */}
            {pendingReservations > 0 && (
                <PendingReservationsLink count={pendingReservations} to={`${detailPath}/prenotazioni`} />
            )}
            {/* «Gestisci» porta a «Cosa vedono i clienti» della sede: serve in
                ogni stato, anche senza menù o sospesa (S2). */}
            <Button
                variant="secondary"
                size="sm"
                onClick={() => onManageAvailability?.(business.id, business.name)}
            >
                Gestisci
            </Button>
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
                        rowAction.edit(() => onEdit(business)),
                        { label: "Apri sede", icon: Store, onClick: () => navigate(detailPath) },
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
                        rowAction.remove(() => onDelete?.(business.id), { hidden: !onDelete })
                    ]}
                />
            }
        />
    );
};
