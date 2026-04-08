import React, { useState } from "react";
import {
    IconCircleCheck,
    IconCircleX,
    IconExternalLink,
    IconEdit,
    IconMail,
    IconPhone,
    IconWorld,
    IconBrandInstagram,
    IconBrandFacebook,
    IconBrandWhatsapp,
    IconPencil
} from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import { V2Activity } from "@/types/activity";
import { V2ActivityGroup } from "@/types/activity-group";
import { useTenantId } from "@/context/useTenantId";
import { ContactField } from "../components/ContactField";
import { ContactsMainDrawer } from "./contacts/ContactsMainDrawer";
import { ContactsSocialDrawer } from "./contacts/ContactsSocialDrawer";
import { ActivityIdentityDrawer } from "./info/ActivityIdentityDrawer";
import { ActivitySlugDrawer } from "./info/ActivitySlugDrawer";
import styles from "../ActivityDetailPage.module.scss";

interface ActivityInfoTabProps {
    activity: V2Activity;
    groups: V2ActivityGroup[];
    publicUrl: string;
    showGroups: boolean;
    onNavigateToGroups: () => void;
    onReload: () => Promise<void>;
}

export const ActivityInfoTab: React.FC<ActivityInfoTabProps> = ({
    activity,
    groups,
    publicUrl,
    showGroups,
    onNavigateToGroups,
    onReload
}) => {
    const tenantId = useTenantId();

    const [isIdentityDrawerOpen, setIsIdentityDrawerOpen] = useState(false);
    const [isSlugDrawerOpen, setIsSlugDrawerOpen] = useState(false);
    const [mainDrawerOpen, setMainDrawerOpen] = useState(false);
    const [socialDrawerOpen, setSocialDrawerOpen] = useState(false);

    return (
        <>
            <div className={styles.grid12}>
                {/* Card 1: Identità */}
                <Card className={`${styles.card} ${styles.colSpan12}`}>
                    <div className={styles.cardHeader}>
                        <h3>Identità Attività</h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<IconEdit size={16} />}
                            onClick={() => setIsIdentityDrawerOpen(true)}
                        >
                            Modifica
                        </Button>
                    </div>
                    <div className={styles.cardContent}>
                        <div className={styles.infoGrid}>
                            <div className={styles.field}>
                                <label>Nome attività</label>
                                <span>{activity.name}</span>
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
                                <label>Indirizzo web</label>
                                <span className={styles.slugValue}>
                                    <a
                                        href={publicUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.slugLink}
                                    >
                                        {activity.slug}
                                    </a>
                                    <IconExternalLink size={14} />
                                    <button
                                        className={styles.slugEditIcon}
                                        onClick={() => setIsSlugDrawerOpen(true)}
                                        title="Modifica indirizzo web"
                                    >
                                        <IconPencil size={14} />
                                    </button>
                                </span>
                            </div>

                            <div className={styles.field + " " + styles.descriptionField}>
                                <label>Presentazione Attività</label>
                                <div className={styles.descriptionBox}>
                                    {activity.description || (
                                        <span className={styles.placeholder}>
                                            Nessuna descrizione
                                        </span>
                                    )}
                                </div>
                            </div>

                            {showGroups && (
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
                            )}
                        </div>
                    </div>
                </Card>

                {/* Card 3: Contatti Principali */}
                <Card className={`${styles.card} ${styles.colSpan6}`}>
                    <div className={styles.cardHeader}>
                        <h3>Contatti Principali</h3>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setMainDrawerOpen(true)}
                        >
                            <IconPencil size={14} />
                            Modifica
                        </Button>
                    </div>
                    <div className={styles.cardContent}>
                        <div className={styles.infoGrid}>
                            <ContactField
                                icon={<IconMail size={14} />}
                                label="Email pubblica"
                                value={activity.email_public}
                                visible={activity.email_public_visible}
                            />
                            <ContactField
                                icon={<IconPhone size={14} />}
                                label="Telefono"
                                value={activity.phone}
                                visible={activity.phone_public}
                            />
                            <ContactField
                                icon={<IconWorld size={14} />}
                                label="Sito web"
                                value={activity.website}
                                visible={activity.website_public}
                            />
                        </div>
                    </div>
                </Card>

                {/* Card 4: Social Network */}
                <Card className={`${styles.card} ${styles.colSpan6}`}>
                    <div className={styles.cardHeader}>
                        <h3>Social Network</h3>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSocialDrawerOpen(true)}
                        >
                            <IconPencil size={14} />
                            Modifica
                        </Button>
                    </div>
                    <div className={styles.cardContent}>
                        <div className={styles.infoGrid}>
                            <ContactField
                                icon={<IconBrandInstagram size={14} />}
                                label="Instagram"
                                value={activity.instagram}
                                visible={activity.instagram_public}
                            />
                            <ContactField
                                icon={<IconBrandFacebook size={14} />}
                                label="Facebook"
                                value={activity.facebook}
                                visible={activity.facebook_public}
                            />
                            <ContactField
                                icon={<IconBrandWhatsapp size={14} />}
                                label="WhatsApp"
                                value={activity.whatsapp}
                                visible={activity.whatsapp_public}
                            />
                        </div>
                    </div>
                </Card>
            </div>

            {tenantId && (
                <>
                    <ActivityIdentityDrawer
                        open={isIdentityDrawerOpen}
                        onClose={() => setIsIdentityDrawerOpen(false)}
                        activity={activity}
                        tenantId={tenantId}
                        onSuccess={onReload}
                    />

                    <ActivitySlugDrawer
                        open={isSlugDrawerOpen}
                        onClose={() => setIsSlugDrawerOpen(false)}
                        activity={activity}
                        tenantId={tenantId}
                        onSuccess={onReload}
                    />

                    <ContactsMainDrawer
                        open={mainDrawerOpen}
                        onClose={() => setMainDrawerOpen(false)}
                        activity={activity}
                        tenantId={tenantId}
                        onSuccess={onReload}
                    />

                    <ContactsSocialDrawer
                        open={socialDrawerOpen}
                        onClose={() => setSocialDrawerOpen(false)}
                        activity={activity}
                        tenantId={tenantId}
                        onSuccess={onReload}
                    />
                </>
            )}
        </>
    );
};
