import React, { useState } from "react";
import {
    IconCircleCheck,
    IconCircleX,
    IconExternalLink,
    IconEdit,
    IconCheck,
    IconX,
    IconLoader2
} from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import { V2Activity } from "@/types/activity";
import { V2ActivityGroup } from "@/types/activity-group";
import styles from "../ActivityDetailPage.module.scss";

interface ActivityInfoTabProps {
    activity: V2Activity;
    groups: V2ActivityGroup[];
    publicUrl: string;
    onSave: (updates: Partial<V2Activity>) => Promise<void>;
    isSaving: boolean;
    onNavigateToGroups: () => void;
    onCopyToClipboard: () => void;
}

export const ActivityInfoTab: React.FC<ActivityInfoTabProps> = ({
    activity,
    groups,
    publicUrl,
    onSave,
    isSaving,
    onNavigateToGroups,
    onCopyToClipboard
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localName, setLocalName] = useState(activity.name);
    const [localDescription, setLocalDescription] = useState(activity.description || "");

    const handleEditToggle = () => {
        if (isEditing) {
            setLocalName(activity.name);
            setLocalDescription(activity.description || "");
        }
        setIsEditing(prev => !prev);
    };

    const handleSave = async () => {
        await onSave({
            name: localName,
            description: localDescription
        });
        setIsEditing(false);
    };

    return (
        <div className={styles.grid12}>
            {/* Card 1: Identità */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3>Identità Attività</h3>
                    {!isEditing ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<IconEdit size={16} />}
                            onClick={handleEditToggle}
                        >
                            Modifica
                        </Button>
                    ) : (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<IconX size={16} />}
                                onClick={handleEditToggle}
                                disabled={isSaving}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                leftIcon={
                                    isSaving ? (
                                        <IconLoader2 size={16} className="animate-spin" />
                                    ) : (
                                        <IconCheck size={16} />
                                    )
                                }
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                Salva modifiche
                            </Button>
                        </div>
                    )}
                </div>
                <div className={styles.cardContent}>
                    <div className={styles.infoGrid}>
                        {/* Campi interni... */}
                        <div className={styles.field}>
                            <label>Nome attività</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={localName}
                                    onChange={e => setLocalName(e.target.value)}
                                    className={styles.input}
                                />
                            ) : (
                                <span>{activity.name}</span>
                            )}
                        </div>

                        <div className={styles.field}>
                            <label>Stato</label>
                            <div
                                className={`${styles.statusBadge} ${activity.status === "active" ? styles.active : styles.inactive}`}
                            >
                                {activity.status === "active" ? (
                                    <>
                                        <IconCircleCheck size={14} style={{ marginRight: 4 }} />
                                        Attiva
                                    </>
                                ) : (
                                    <>
                                        <IconCircleX size={14} style={{ marginRight: 4 }} />
                                        Inattiva
                                    </>
                                )}
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label>Slug</label>
                            <a
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.slugLink}
                            >
                                {activity.slug}
                                <IconExternalLink size={14} style={{ marginLeft: 6 }} />
                            </a>
                        </div>

                        <div className={styles.field}>
                            <label>URL Pubblico</label>
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                <span
                                    style={{
                                        fontSize: "0.875rem",
                                        color: "#64748b",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "200px"
                                    }}
                                >
                                    {publicUrl}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onCopyToClipboard}
                                    style={{ height: "auto", padding: "2px 8px" }}
                                >
                                    Copia
                                </Button>
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label>Gruppi</label>
                            <div className={styles.badgeList}>
                                {groups.length > 0 ? (
                                    groups.map(group => (
                                        <span key={group.id} className={styles.groupBadge}>
                                            {group.name}
                                        </span>
                                    ))
                                ) : (
                                    <span className={styles.placeholder}>Nessun gruppo</span>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onNavigateToGroups}
                                    style={{ padding: "0 4px" }}
                                >
                                    +
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Card 2: Descrizione */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3>Descrizione</h3>
                </div>
                <div className={styles.cardContent}>
                    <div className={styles.infoGrid}>
                        <div className={styles.field + " " + styles.fullWidth}>
                            <label>Presentazione Attività</label>
                            {isEditing ? (
                                <textarea
                                    className={styles.textarea}
                                    value={localDescription}
                                    onChange={e => setLocalDescription(e.target.value)}
                                />
                            ) : (
                                <div className={styles.descriptionBox}>
                                    {activity.description || (
                                        <p className={styles.placeholder}>
                                            Nessuna descrizione presente. Aggiungi una descrizione
                                            per presentare l'attività nel catalogo pubblico.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={styles.field + " " + styles.fullWidth}>
                            <label>Localizzazione</label>
                            <span>
                                {activity.address
                                    ? `${activity.address}, ${activity.city || ""}`
                                    : activity.city || "—"}
                            </span>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
