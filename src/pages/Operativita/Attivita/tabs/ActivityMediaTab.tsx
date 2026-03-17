import React from "react";
import { IconPhoto, IconPlus, IconTrash, IconCheck, IconEdit } from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import { V2Activity } from "@/types/activity";
import styles from "../ActivityDetailPage.module.scss";

interface ActivityMediaTabProps {
    activity: V2Activity;
}

export const ActivityMediaTab: React.FC<ActivityMediaTabProps> = ({ activity }) => {
    return (
        <div className={styles.grid12}>
            {/* Sezione Copertina */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3>Immagine di Copertina</h3>
                    <Button variant="ghost" size="sm" leftIcon={<IconEdit size={16} />}>
                        Modifica
                    </Button>
                </div>
                <div className={styles.cardContent}>
                    <div className={styles.coverImageWrapper}>
                        {activity.cover_image ? (
                            <>
                                <img src={activity.cover_image || undefined} alt="Copertina" />
                                <div className={styles.editOverlay}>
                                    <IconEdit size={32} />
                                </div>
                            </>
                        ) : (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    height: "100%",
                                    color: "#94a3b8"
                                }}
                            >
                                <IconPhoto size={48} stroke={1} />
                                <span style={{ marginTop: "1rem" }}>Carica immagine 16:9</span>
                            </div>
                        )}
                    </div>
                    <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#64748b" }}>
                        Utilizzata come sfondo principale nella testata del tuo catalogo pubblico.
                    </p>
                </div>
            </Card>

            {/* Sezione Galleria */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3>Galleria Immagini</h3>
                    <Button variant="primary" size="sm" leftIcon={<IconPlus size={16} />}>
                        Aggiungi Media
                    </Button>
                </div>
                <div className={styles.cardContent}>
                    <div className={styles.galleryGrid}>
                        {/* Placeholder Card Aggiungi */}
                        <div
                            className={styles.galleryCard}
                            style={{
                                borderStyle: "dashed",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#94a3b8"
                            }}
                        >
                            <IconPlus size={32} />
                            <span style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
                                Aggiungi
                            </span>
                        </div>

                        {/* Eventuali immagini esistenti (Placeholder per preview) */}
                        {activity.cover_image && (
                            <div className={styles.galleryCard}>
                                <img src={activity.cover_image || undefined} alt="Media" />
                                <div className={styles.badge}>Copertina</div>
                                <div className={styles.galleryOverlay}>
                                    <IconTrash size={20} />
                                </div>
                            </div>
                        )}
                    </div>
                    <p
                        style={{
                            marginTop: "1.5rem",
                            fontSize: "0.875rem",
                            color: "#64748b",
                            textAlign: "center"
                        }}
                    >
                        La gestione della galleria multi-immagine sarà disponibile a breve.
                    </p>
                </div>
            </Card>
        </div>
    );
};
