import React from "react";
import { IconPower, IconAlertTriangle, IconSettings } from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import { V2Activity } from "@/types/v2/activity";
import styles from "../ActivityDetailPage.module.scss";

interface ActivitySettingsTabProps {
    activity: V2Activity;
    onToggleStatus: () => void;
}

export const ActivitySettingsTab: React.FC<ActivitySettingsTabProps> = ({
    activity,
    onToggleStatus
}) => {
    const isActive = activity.status === "active";

    return (
        <div className={styles.grid12}>
            {/* Stato Visibilità */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3>Configurazione Visibilità</h3>
                </div>
                <div className={styles.cardContent}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "2rem"
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    fontWeight: 600,
                                    fontSize: "1.05rem",
                                    marginBottom: "0.25rem",
                                    color: isActive ? "#059669" : "#dc2626"
                                }}
                            >
                                {isActive ? "Attività Pubblicata" : "Attività in Bozza"}
                            </div>
                            <p style={{ color: "#64748b", fontSize: "0.9375rem", margin: 0 }}>
                                {isActive
                                    ? "Il catalogo è attualmente visibile online per tutti gli utenti che dispongono dello slug o del QR code."
                                    : "L'attività è nascosta al pubblico. Solo gli amministratori possono visualizzarla in anteprima."}
                            </p>
                        </div>
                        <Button
                            variant={isActive ? "outline" : "primary"}
                            leftIcon={<IconPower size={18} />}
                            onClick={onToggleStatus}
                        >
                            {isActive ? "Sospendi" : "Pubblica"}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Zona Pericolosa */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3
                        style={{
                            color: "#dc2626",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }}
                    >
                        <IconAlertTriangle size={18} />
                        Azioni Distruttive
                    </h3>
                </div>
                <div className={styles.cardContent}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    fontWeight: 600,
                                    fontSize: "1rem",
                                    marginBottom: "0.25rem"
                                }}
                            >
                                Elimina definitivamente
                            </div>
                            <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>
                                Rimuove l'attività e tutte le configurazioni associate. Questa
                                operazione non può essere annullata.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            style={{ color: "#dc2626", borderColor: "#dc2626" }}
                        >
                            Elimina
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
