import { type ReactNode } from "react";
import { Building2, MessageCircle } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "./OfferBlock.module.scss";

/**
 * OfferBlock — «Non puoi, ecco cosa serve»: il corpo del drawer al posto di
 * un form destinato a fallire (design system §5, scheda OfferBlock).
 *
 * Anatomia: icona 32 · titolo title-sm · prezzo della prossima title-md 700
 * + prorata caption · una riga · azione primaria · «Annulla».
 * Due forme: `upgrade` (fino a 5 sedi: self-service, prezzo e prorata) e
 * `contact` (oltre: «serve un piano dedicato», azione = scrivi all'assistenza).
 * Dentro SystemDrawer md, centrato, padding 48 verticale, testo max 360.
 *
 * Non se il limite non è noto prima del submit (allora è un bug); non per un
 * vuoto (→ EmptyState, che crea qualcosa: questo no).
 */
export interface OfferBlockProps {
    variant: "upgrade" | "contact";
    /** Default: Building2 (upgrade) / MessageCircle (contact). */
    icon?: ReactNode;
    /** «Hai usato tutte le 3 sedi pagate». */
    title: string;
    /** Solo `upgrade`: già formattato, «12 € al mese». */
    price?: string;
    /** Solo `upgrade`: «oggi paghi 4,80 € per i 12 giorni rimasti». */
    prorata?: string;
    /** Una riga. */
    description?: string;
    /** Default «Aggiungi una sede» / «Scrivi all'assistenza». */
    actionLabel?: string;
    onAction: () => void;
    /** L'azione in corso: Button loading, Annulla disabilitato. */
    loading?: boolean;
    cancelLabel?: string;
    onCancel?: () => void;
    className?: string;
}

export function OfferBlock({
    variant,
    icon,
    title,
    price,
    prorata,
    description,
    actionLabel,
    onAction,
    loading = false,
    cancelLabel = "Annulla",
    onCancel,
    className
}: OfferBlockProps) {
    const upgrade = variant === "upgrade";
    const iconNode = icon ?? (upgrade ? <Building2 /> : <MessageCircle />);
    return (
        <div className={`${styles.block} ${className ?? ""}`.trim()}>
            <div className={styles.icon} aria-hidden="true">
                {iconNode}
            </div>
            <Text as="h2" variant="title-sm" weight={600} align="center" className={styles.title}>
                {title}
            </Text>
            {upgrade && price && (
                <div className={styles.price}>
                    <Text as="div" variant="title-md" weight={700} align="center" className={styles.priceValue}>
                        {price}
                    </Text>
                    {prorata && (
                        <Text as="div" variant="caption" colorVariant="muted" align="center">
                            {prorata}
                        </Text>
                    )}
                </div>
            )}
            {description && (
                <Text as="p" variant="body-sm" colorVariant="muted" align="center" className={styles.description}>
                    {description}
                </Text>
            )}
            <div className={styles.actions}>
                <Button variant="primary" onClick={onAction} loading={loading}>
                    {actionLabel ?? (upgrade ? "Aggiungi una sede" : "Scrivi all'assistenza")}
                </Button>
                {onCancel && (
                    <Button variant="ghost" onClick={onCancel} disabled={loading}>
                        {cancelLabel}
                    </Button>
                )}
            </div>
        </div>
    );
}
