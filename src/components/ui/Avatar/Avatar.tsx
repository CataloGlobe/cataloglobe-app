import { CSSProperties } from "react";
import styles from "./Avatar.module.scss";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
    name?: string;
    imageUrl?: string;
    size?: AvatarSize;
    gradient?: string;
    rounded?: boolean;
    className?: string;
}

function deriveInitials(name?: string): string {
    if (!name) return "?";
    const trimmed = name.trim();
    if (!trimmed) return "?";
    if (trimmed.includes("@")) {
        const local = trimmed.split("@")[0];
        return (local[0] ?? "?").toUpperCase();
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    const first = parts[0][0] ?? "";
    const last = parts[parts.length - 1][0] ?? "";
    return (first + last).toUpperCase();
}

export function Avatar({ name, imageUrl, size = "md", gradient, rounded, className }: AvatarProps) {
    const initials = deriveInitials(name);
    const classes = [
        styles.avatar,
        styles[size],
        rounded ? styles.rounded : null,
        className
    ].filter(Boolean).join(" ");
    const style: CSSProperties | undefined = gradient ? { background: gradient } : undefined;

    if (imageUrl) {
        return (
            <span className={classes} style={style}>
                <img src={imageUrl} alt="" className={styles.image} />
            </span>
        );
    }
    return (
        <span className={classes} style={style} aria-hidden="true">
            <span className={styles.initials}>{initials}</span>
        </span>
    );
}
