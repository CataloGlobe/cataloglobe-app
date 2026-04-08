import React from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import styles from "../ActivityDetailPage.module.scss";

export function VisibilityIcon({ visible }: { visible: boolean }) {
    return visible ? (
        <IconEye size={14} style={{ color: "var(--brand-primary)", flexShrink: 0 }} />
    ) : (
        <IconEyeOff size={14} style={{ opacity: 0.35, flexShrink: 0 }} />
    );
}

interface ContactFieldProps {
    icon: React.ReactNode;
    label: string;
    value: string | null;
    visible: boolean;
}

export function ContactField({ icon, label, value, visible }: ContactFieldProps) {
    return (
        <div className={styles.field}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {icon} {label}
            </label>
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {value ? (
                    <span>{value}</span>
                ) : (
                    <span className={styles.placeholder}>—</span>
                )}
                <VisibilityIcon visible={visible} />
            </span>
        </div>
    );
}
