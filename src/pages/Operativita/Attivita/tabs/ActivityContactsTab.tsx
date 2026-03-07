import React from "react";
import {
    IconMail,
    IconPhone,
    IconBrandInstagram,
    IconBrandFacebook,
    IconBrandWhatsapp,
    IconWorld
} from "@tabler/icons-react";
import { Card } from "@/components/ui";
import { V2Activity } from "@/types/v2/activity";
import styles from "../ActivityDetailPage.module.scss";

interface ActivityContactsTabProps {
    activity: V2Activity;
}

export const ActivityContactsTab: React.FC<ActivityContactsTabProps> = ({ activity }) => {
    return (
        <div className={styles.grid12}>
            {/* Blocco: Contatti Principali */}
            <Card className={`${styles.card} ${styles.colSpan6}`}>
                <div className={styles.cardHeader}>
                    <h3>Contatti Principali</h3>
                </div>
                <div className={styles.cardContent}>
                    <div className={styles.infoGrid}>
                        <div className={styles.field}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <IconMail size={14} /> Email Pubblica
                            </label>
                            <span className={styles.placeholder}>—</span>
                        </div>
                        <div className={styles.field}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <IconPhone size={14} /> Telefono
                            </label>
                            <span className={styles.placeholder}>—</span>
                        </div>
                        <div className={styles.field + " " + styles.fullWidth}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <IconWorld size={14} /> Sito Web Esterno
                            </label>
                            <span className={styles.placeholder}>—</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Blocco: Social Network */}
            <Card className={`${styles.card} ${styles.colSpan6}`}>
                <div className={styles.cardHeader}>
                    <h3>Social Network</h3>
                </div>
                <div className={styles.cardContent}>
                    <div className={styles.infoGrid}>
                        <div className={styles.field}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <IconBrandInstagram size={14} /> Instagram
                            </label>
                            <span className={styles.placeholder}>@username</span>
                        </div>
                        <div className={styles.field}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <IconBrandFacebook size={14} /> Facebook
                            </label>
                            <span className={styles.placeholder}>facebook.com/page</span>
                        </div>
                        <div className={styles.field}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <IconBrandWhatsapp size={14} /> WhatsApp
                            </label>
                            <span className={styles.placeholder}>Numero WhatsApp</span>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
