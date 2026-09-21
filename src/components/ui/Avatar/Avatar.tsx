import type { CSSProperties } from "react";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import styles from "./Avatar.module.scss";

/**
 * Avatar — chi è: iniziali o immagine, in un cerchio (design system §5,
 * scheda Avatar). Membri del Team, menu utente nell'header, leading della
 * ListRow membro.
 *
 * Cerchio hover-bg · iniziali (1–2 lettere, 500, gray-800) o immagine ·
 * puntino di stato opzionale in basso a destra (success-500 = online).
 * Taglie sm 24 (righe) · md 32 (header, tabella) · lg 40 (drawer membro);
 * testo 11/12/14. Mai un'icona generica di omino. Caricamento = Skeleton
 * tondo. Bordo 1px surface quando sta su un'immagine (`onImage`).
 *
 * Non per un'azienda o una sede (→ Logo o icona), non per un ruolo (→ Badge).
 */
export type AvatarSize = "sm" | "md" | "lg";
const SIZE_PX: Record<AvatarSize, number> = { sm: 24, md: 32, lg: 40 };

export interface AvatarProps {
    name?: string;
    imageUrl?: string;
    size?: AvatarSize;
    /** Fondo custom (l'header lo usa per il tenant); di norma non serve. */
    gradient?: string;
    /** @deprecated L'avatar è sempre un cerchio. */
    rounded?: boolean;
    /** Puntino success-500 in basso a destra: solo se serve davvero. */
    status?: "online";
    /** Bordo 1px surface: quando l'avatar sta sopra un'immagine. */
    onImage?: boolean;
    /** Skeleton tondo della stessa taglia. */
    loading?: boolean;
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

export function Avatar({ name, imageUrl, size = "md", gradient, status, onImage = false, loading = false, className }: AvatarProps) {
    const px = SIZE_PX[size];
    if (loading) {
        return <Skeleton width={px} height={px} radius="50%" className={className} />;
    }

    const initials = deriveInitials(name);
    const classes = [styles.avatar, styles[size], onImage ? styles.onImage : "", className ?? ""].join(" ").trim();
    const style: CSSProperties | undefined = gradient ? { background: gradient } : undefined;

    return (
        <span className={classes} style={style} role="img" aria-label={name ?? "Utente"}>
            {imageUrl ? <img src={imageUrl} alt="" className={styles.image} /> : <span className={styles.initials}>{initials}</span>}
            {status === "online" && <span className={styles.dot} aria-label="Online" />}
        </span>
    );
}
