import React, { useState, useRef, useEffect } from "react";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import BusinessOverridesModal from "../BusinessOverridesModal/BusinessOverridesModal";
import Text from "@components/ui/Text/Text";
import SelectCollectionModal from "../SelectCollectionModal/SelectCollectionModal";
import { QRCodeSVG } from "qrcode.react";
import { MoreVertical } from "lucide-react";
import type { BusinessCardProps } from "@/types/Businesses";
import styles from "./BusinessCard.module.scss";
import BusinessCollectionScheduleModal from "../BusinessCollectionScheduleModal/BusinessCollectionScheduleModal";

export const BusinessCard: React.FC<BusinessCardProps> = ({
    business,
    onEdit,
    onDelete,
    onOpenReviews
}) => {
    const publicUrl = `${window.location.origin}/business/${business.slug}`;

    const [showQrModal, setShowQrModal] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showSelectCollection, setShowSelectCollection] = useState(false);
    const [overrideOpen, setOverrideOpen] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);

    // ✅ STATO LOCALE SORGENTE DI VERITÀ
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
        business.active_collection_id
    );

    const menuRef = useRef<HTMLDivElement | null>(null);

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

                        <a
                            className={styles.publicUrl}
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {publicUrl}
                        </a>
                    </div>

                    {/* QR */}
                    <div className={styles.qrWrapper} onClick={() => setShowQrModal(true)}>
                        <QRCodeSVG value={publicUrl} bgColor="#f8f9fb" fgColor="#000000" />
                    </div>
                </div>

                {/* ACTIONS */}
                <div className={styles.actions}>
                    <div className={styles.actionsLeft}>
                        {activeCollectionId && (
                            <button
                                className={styles.primary}
                                onClick={() => setOverrideOpen(true)}
                            >
                                Gestisci disponibilità e prezzi
                            </button>
                        )}

                        <button
                            className={styles.secondary}
                            onClick={() => {
                                setShowSelectCollection(true);
                                setShowMenu(false);
                            }}
                        >
                            Seleziona collezione
                        </button>

                        <button
                            className={styles.secondary}
                            onClick={() => {
                                setShowScheduleModal(true);
                                setShowMenu(false);
                            }}
                        >
                            Contenuti & Orari
                        </button>

                        <button
                            className={styles.secondary}
                            onClick={() => onOpenReviews(business.id)}
                        >
                            Recensioni
                        </button>
                    </div>

                    <div className={styles.actionsRight} ref={menuRef}>
                        <button className={styles.moreButton} onClick={() => setShowMenu(v => !v)}>
                            <MoreVertical size={18} />
                        </button>

                        {showMenu && (
                            <div className={styles.dropdownMenu}>
                                <button
                                    onClick={() => {
                                        onEdit(business);
                                        setShowMenu(false);
                                    }}
                                >
                                    Modifica
                                </button>

                                <button
                                    className={styles.dangerItem}
                                    onClick={() => {
                                        onDelete(business.id);
                                        setShowMenu(false);
                                    }}
                                >
                                    Elimina
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </article>

            {/* MODALE QR */}
            <ConfirmModal
                isOpen={showQrModal}
                title="QR code dell’attività"
                description="Scansiona o scarica il QR code."
                confirmLabel="Chiudi"
                onConfirm={() => setShowQrModal(false)}
            >
                <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                    <QRCodeSVG id="qr-download" value={publicUrl} size={240} />
                    <button
                        style={{
                            marginTop: "1rem",
                            padding: "10px 16px",
                            borderRadius: 8,
                            background: "#000",
                            color: "white",
                            border: "none",
                            cursor: "pointer"
                        }}
                        onClick={downloadQrAsPng}
                    >
                        Scarica QR code
                    </button>
                </div>
            </ConfirmModal>

            {/* OVERRIDES */}
            {overrideOpen && activeCollectionId && (
                <BusinessOverridesModal
                    isOpen={overrideOpen}
                    onClose={() => setOverrideOpen(false)}
                    businessId={business.id}
                    collectionId={activeCollectionId}
                    title={`Gestisci disponibilità e prezzi — ${business.name}`}
                />
            )}

            {/* SELECT COLLECTION */}
            <SelectCollectionModal
                isOpen={showSelectCollection}
                businessId={business.id}
                activeCollectionId={activeCollectionId}
                onClose={() => setShowSelectCollection(false)}
                onUpdated={newId => {
                    // ✅ aggiornamento immediato UI
                    setActiveCollectionId(newId);
                    setShowSelectCollection(false);
                }}
            />

            <BusinessCollectionScheduleModal
                isOpen={showScheduleModal}
                businessId={business.id}
                onClose={() => setShowScheduleModal(false)}
            />
        </>
    );
};
