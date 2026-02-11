import React, { useState, useRef, useEffect } from "react";
import BusinessOverrides from "../BusinessOverrides/BusinessOverrides";
import Text from "@components/ui/Text/Text";
import { QRCodeSVG } from "qrcode.react";
import { MoreVertical } from "lucide-react";
import type { BusinessCardProps } from "@/types/Businesses";
import styles from "./BusinessCard.module.scss";
import BusinessCollectionSchedule from "../BusinessCollectionSchedule/BusinessCollectionSchedule";
import { Button } from "@/components/ui";
import { IconButton } from "@/components/ui/Button/IconButton";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge/Badge";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { useToast } from "@/context/Toast/ToastContext";
import { downloadBusinessCatalogPdf } from "@/services/pdf/catalogPdf";

export const BusinessCard: React.FC<BusinessCardProps> = ({
    business,
    totalBusinesses,
    onEdit,
    onDelete,
    onOpenReviews
}) => {
    const publicUrl = `${window.location.origin}/${business.slug}`;

    const [showQrModal, setShowQrModal] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    const menuRef = useRef<HTMLDivElement | null>(null);

    const navigate = useNavigate();
    const { showToast } = useToast();

    const canSchedule = business.compatible_collection_count > 0;
    const hasScheduled = business.scheduled_compatible_collection_count > 0;
    const canOverride = totalBusinesses > 1 && hasScheduled;
    const canDownloadPdf = business.scheduled_compatible_collection_count > 0;

    /* ==============================
       CLICK OUTSIDE PER CHIUDERE MENU
    =============================== */
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        }

        if (showMenu) document.addEventListener("mousedown", handleClickOutside);

        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMenu]);

    /* ==============================
       DOWNLOAD QR
    =============================== */
    function downloadQrAsPng() {
        const el = document.getElementById("qr-download");

        if (!(el instanceof SVGSVGElement)) return;

        const xml = new XMLSerializer().serializeToString(el);
        const svg64 = btoa(xml);
        const img = new Image();
        img.src = `data:image/svg+xml;base64,${svg64}`;

        img.onload = () => {
            const canvas = document.createElement("canvas");
            const size = 2000;
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);

            const pngFile = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = pngFile;
            link.download = `qr-${business.slug}.png`;
            link.click();
        };
    }

    async function handleDownloadPdf() {
        if (!canDownloadPdf || isDownloadingPdf) return;

        try {
            setIsDownloadingPdf(true);
            await downloadBusinessCatalogPdf({
                businessId: business.id,
                businessSlug: business.slug
            });
            showToast({
                type: "success",
                message: "PDF generato con successo."
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Errore durante il download.";
            showToast({
                type: "error",
                message
            });
        } finally {
            setIsDownloadingPdf(false);
        }
    }

    return (
        <>
            <article className={styles.card}>
                <div className={styles.top}>
                    {/* Thumbnail */}
                    <div className={styles.thumbnail}>
                        {business.cover_image ? (
                            <img src={business.cover_image} alt={`Copertina di ${business.name}`} />
                        ) : (
                            <div className={styles.thumbnailPlaceholder} />
                        )}
                    </div>

                    {/* INFO */}
                    <div className={styles.info}>
                        <Text as="h3" variant="title-sm" weight={600}>
                            {business.name}
                        </Text>

                        <Text variant="body" colorVariant="muted">
                            {business.address}, {business.city}
                        </Text>

                        <Text
                            as="a"
                            variant="body-sm"
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            color="#6366f1"
                        >
                            {publicUrl}
                        </Text>

                        <div className={styles.badges}>
                            {/* Primary attiva ora */}
                            {business.active_primary_collection_name && (
                                <Badge>{business.active_primary_collection_name}</Badge>
                            )}

                            {/* Backup primary (solo se NON c'è una primary attiva) */}
                            {!business.active_primary_collection_name &&
                                business.fallback_primary_collection_name && (
                                    <Badge variant="warning">
                                        {business.fallback_primary_collection_name}
                                    </Badge>
                                )}

                            {/* Special attiva */}
                            {business.active_special_collection_name && (
                                <Badge>{business.active_special_collection_name}</Badge>
                            )}
                        </div>
                    </div>

                    {/* QR */}
                    <div className={styles.qrWrapper} onClick={() => setShowQrModal(true)}>
                        <QRCodeSVG value={publicUrl} bgColor="#f8f9fb" fgColor="#000000" />
                    </div>
                </div>

                {/* ACTIONS */}
                <div className={styles.actions}>
                    <div className={styles.actionsLeft}>
                        {/* Override */}
                        {canOverride && (
                            <Button variant="primary" onClick={() => setOverrideOpen(true)}>
                                Gestisci disponibilità e prezzi
                            </Button>
                        )}

                        {/* Schedule */}
                        {canSchedule && (
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setShowScheduleModal(true);
                                    setShowMenu(false);
                                }}
                            >
                                Contenuti & Orari
                            </Button>
                        )}

                        {/* CTA solo se NON può schedulare */}
                        {!canSchedule && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate("/dashboard/collections")}
                            >
                                Crea catalogo
                            </Button>
                        )}

                        <Button variant="outline" onClick={() => onOpenReviews(business.id)}>
                            Recensioni
                        </Button>

                        <Button
                            variant="secondary"
                            loading={isDownloadingPdf}
                            disabled={!canDownloadPdf}
                            onClick={handleDownloadPdf}
                        >
                            Scarica PDF
                        </Button>
                    </div>

                    <div className={styles.actionsRight}>
                        <DropdownMenu
                            placement="bottom-end"
                            trigger={
                                <IconButton
                                    icon={<MoreVertical size={18} />}
                                    aria-label="Azioni attività"
                                    variant="ghost"
                                />
                            }
                        >
                            <DropdownItem
                                onClick={() => {
                                    onEdit(business);
                                }}
                            >
                                Modifica
                            </DropdownItem>

                            <DropdownItem
                                danger
                                onClick={() => {
                                    onDelete(business.id);
                                }}
                            >
                                Elimina
                            </DropdownItem>
                        </DropdownMenu>
                    </div>
                </div>
            </article>

            {/* MODALE QR */}
            <ModalLayout
                isOpen={showQrModal}
                onClose={() => setShowQrModal(false)}
                width="sm"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-md" weight={700}>
                            QR code dell’attività
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Scansiona o scarica il QR code.
                        </Text>
                    </div>

                    <div className={styles.headerRight}>
                        <Button variant="secondary" onClick={() => setShowQrModal(false)}>
                            Chiudi
                        </Button>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <div className={styles.modalContent}>
                        <QRCodeSVG id="qr-download" value={publicUrl} size={240} />

                        <Button variant="primary" size="lg" onClick={downloadQrAsPng}>
                            Scarica QR Code
                        </Button>
                    </div>
                </ModalLayoutContent>
            </ModalLayout>

            {/* OVERRIDES */}
            <BusinessOverrides
                isOpen={overrideOpen}
                onClose={() => setOverrideOpen(false)}
                businessId={business.id}
                title={`${business.name} - Disponibilità e prezzi`}
            />

            {/* SELECT COLLECTION */}
            <BusinessCollectionSchedule
                isOpen={showScheduleModal}
                businessId={business.id}
                businessType={business.type}
                onClose={() => setShowScheduleModal(false)}
            />
        </>
    );
};
