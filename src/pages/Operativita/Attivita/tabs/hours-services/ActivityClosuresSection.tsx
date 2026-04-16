import React from "react";
import { IconPlus, IconEdit, IconTrash } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import type { V2ActivityClosure } from "@/types/activity-closures";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

function formatDateIT(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function formatClosureStatus(c: V2ActivityClosure): string {
    if (c.is_closed) return "Chiuso";
    return `${c.opens_at!.slice(0, 5)} – ${c.closes_at!.slice(0, 5)}`;
}

interface ActivityClosuresSectionProps {
    closures: V2ActivityClosure[];
    onCreateRequest: () => void;
    onEditRequest: (closure: V2ActivityClosure) => void;
    onDeleteRequest: (closure: V2ActivityClosure) => void;
}

export const ActivityClosuresSection: React.FC<ActivityClosuresSectionProps> = ({
    closures,
    onCreateRequest,
    onEditRequest,
    onDeleteRequest,
}) => {
    return (
        <Card className={pageStyles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.headerLeft}>
                    <h3 className={styles.sectionTitle}>Chiusure straordinarie</h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<IconPlus size={16} />}
                    onClick={onCreateRequest}
                >
                    Nuova chiusura
                </Button>
            </div>
            <div className={pageStyles.cardContent}>
                {closures.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna chiusura straordinaria configurata.
                    </Text>
                ) : (
                    <table className={styles.closuresTable}>
                        <thead>
                            <tr>
                                <th className={styles.closuresTableHead}>Data</th>
                                <th className={styles.closuresTableHead}>Etichetta</th>
                                <th className={styles.closuresTableHead}>Stato</th>
                                <th className={styles.closuresTableHead}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {closures.map((c) => (
                                <tr key={c.id} className={styles.closuresTableRow}>
                                    <td className={styles.closuresTableCell}>
                                        {formatDateIT(c.closure_date)}
                                    </td>
                                    <td className={c.label ? styles.closuresTableCell : styles.closuresTableCellMuted}>
                                        {c.label ?? "—"}
                                    </td>
                                    <td className={styles.closuresTableCell}>
                                        {formatClosureStatus(c)}
                                    </td>
                                    <td className={styles.closuresTableActions}>
                                        <button
                                            type="button"
                                            className={styles.closuresActionBtn}
                                            onClick={() => onEditRequest(c)}
                                            aria-label="Modifica"
                                        >
                                            <IconEdit size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.closuresActionBtn} ${styles.closuresActionBtnDanger}`}
                                            onClick={() => onDeleteRequest(c)}
                                            aria-label="Elimina"
                                        >
                                            <IconTrash size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </Card>
    );
};
