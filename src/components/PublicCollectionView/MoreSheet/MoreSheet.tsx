import { useState } from "react";
import { CalendarCheck, ChevronRight, Filter, Info, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import PublicSheet from "../PublicSheet/PublicSheet";
import Text from "@components/ui/Text/Text";
import styles from "./MoreSheet.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** Apre il pannello unificato sulla vista filtri (rootView="filters"). */
    onOpenFilters: () => void;
    onOpenInfo: () => void;
    /**
     * Callback "Prenota un tavolo". Quando undefined la voce non viene
     * renderizzata. Il caller (CollectionView) lo passa solo se la sede ha
     * `enable_reservations === true` AND lo slug è disponibile.
     */
    onOpenReservation?: () => void;
    /** Filtri attivi: mostrato nel sottotitolo della voce, non come badge. */
    activeFilterCount: number;
    hasAllergensInCatalog: boolean;
    hasInfo: boolean;
    /**
     * URL pubblico canonico della sede (origin + slug), già pulito da prefisso
     * lingua/query dal caller. Quando undefined la voce "Condividi" non viene
     * renderizzata.
     */
    shareUrl?: string;
    /** Titolo per il foglio nativo Web Share (nome sede). */
    shareTitle?: string;
};

// Tempo necessario a PublicSheet per completare l'exit animation prima di
// aprire un sheet successivo: evita la sovrapposizione visiva ("pila" di
// sheet) su mobile dove le due state-update finiscono nello stesso batch
// React e il secondo sheet entra mentre il primo sta ancora uscendo.
// Riferimento: PublicSheet.tsx — desktop panel exit
// `transition={{ type: "spring", duration: 0.32 }}` (linea 225). Mobile usa
// uno spring (damping 28, stiffness 260) con settling perceived ~280-320ms.
//
// Serve SOLO per l'hop verso un'altra PublicSheet (Info), dove entrambe le
// superfici sono ancorate in basso e si muovono nella stessa direzione. Il
// passaggio ai filtri NON lo usa: quello apre il pannello ancorato in alto,
// che esce in direzione opposta e non impila nulla.
const SHEET_EXIT_DURATION_MS = 300;

export default function MoreSheet({
    isOpen,
    onClose,
    onOpenFilters,
    onOpenInfo,
    onOpenReservation,
    activeFilterCount,
    hasAllergensInCatalog,
    hasInfo,
    shareUrl,
    shareTitle,
}: Props) {
    const { t } = useTranslation("public");

    // Feedback inline sulla voce Condividi (fallback copia): la label diventa
    // "Link copiato"/"Impossibile copiare" per ~2s, poi torna. Niente toast.
    const [shareFeedback, setShareFeedback] = useState<null | "copied" | "error">(null);

    const handleShare = async () => {
        if (!shareUrl) return;
        if (navigator.share) {
            try {
                await navigator.share({ title: shareTitle, url: shareUrl });
                return;
            } catch (e) {
                // Utente annulla il foglio nativo: silenzio, nessun feedback.
                if ((e as Error).name === "AbortError") return;
                // Altri errori: cade nel fallback copia sotto.
            }
        }
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareFeedback("copied");
        } catch {
            setShareFeedback("error");
        }
        window.setTimeout(() => setShareFeedback(null), 2000);
    };

    const shareLabel =
        shareFeedback === "copied"
            ? t("more.share_copied")
            : shareFeedback === "error"
                ? t("more.share_error")
                : t("more.share_label");

    const filtersDisabled = !hasAllergensInCatalog;
    // Catalogo senza allergeni: STESSA chiave che il pannello mostra nello
    // stesso caso (allergens.filter_empty). Una frase, un punto di verità —
    // due testi diversi per la stessa condizione sarebbero un'incoerenza che
    // il cliente incontra a due tap di distanza.
    const filtersSubtitle = filtersDisabled
        ? t("allergens.filter_empty")
        : activeFilterCount > 0
            ? t("more.filters_subtitle_active", { count: activeFilterCount })
            : t("more.filters_subtitle_inactive");

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={t("more.title")}
            headerContent={
                <div className={styles.header}>
                    <Text variant="body" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                        {t("more.title")}
                    </Text>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label={t("more.close_aria")}
                    >
                        {t("more.close_label")}
                    </button>
                </div>
            }
        >
            <div className={styles.body}>
                <button
                    type="button"
                    className={styles.item}
                    disabled={filtersDisabled}
                    aria-disabled={filtersDisabled}
                    onClick={() => {
                        if (filtersDisabled) return;
                        // Niente attesa fra le due superfici: si chiudono e si
                        // aprono nello stesso commit React, e il contatore delle
                        // sheet aperte passa da 1 a 0 a 1 dentro i layout effect,
                        // cioè PRIMA del paint — il body non risulta mai
                        // sbloccato in un frame dipinto, quindi niente salto di
                        // scroll. I due movimenti vanno in direzioni opposte
                        // (sheet giù, pannello dall'alto) e non collidono.
                        onClose();
                        onOpenFilters();
                    }}
                >
                    <span className={styles.iconWrap} aria-hidden>
                        <Filter size={18} strokeWidth={2} />
                    </span>
                    <span className={styles.text}>
                        <span className={styles.itemLabel}>{t("more.filters_label")}</span>
                        {/* Il conteggio vive QUI e non in un badge: il
                            sottotitolo dice anche di cosa sono quei numeri. */}
                        <span className={styles.itemSubtitle}>{filtersSubtitle}</span>
                    </span>
                    {!filtersDisabled && (
                        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden />
                    )}
                </button>

                {onOpenReservation && (
                    <button
                        type="button"
                        className={styles.item}
                        onClick={() => {
                            onClose();
                            // Navigation unmounts the sheet anyway, so no exit
                            // animation delay is needed here.
                            onOpenReservation();
                        }}
                    >
                        <span className={styles.iconWrap} aria-hidden>
                            <CalendarCheck size={18} strokeWidth={2} />
                        </span>
                        <span className={styles.text}>
                            <span className={styles.itemLabel}>{t("more.reservation_label")}</span>
                            <span className={styles.itemSubtitle}>{t("more.reservation_subtitle")}</span>
                        </span>
                        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden />
                    </button>
                )}

                {hasInfo && (
                    <button
                        type="button"
                        className={styles.item}
                        onClick={() => {
                            onClose();
                            window.setTimeout(onOpenInfo, SHEET_EXIT_DURATION_MS);
                        }}
                    >
                        <span className={styles.iconWrap} aria-hidden>
                            <Info size={18} strokeWidth={2} />
                        </span>
                        <span className={styles.text}>
                            <span className={styles.itemLabel}>{t("more.info_label")}</span>
                            <span className={styles.itemSubtitle}>{t("more.info_subtitle")}</span>
                        </span>
                        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden />
                    </button>
                )}

                {shareUrl && (
                    <button
                        type="button"
                        className={styles.item}
                        onClick={handleShare}
                    >
                        <span className={styles.iconWrap} aria-hidden>
                            <Share2 size={18} strokeWidth={2} />
                        </span>
                        <span className={styles.text}>
                            <span className={styles.itemLabel}>{shareLabel}</span>
                            <span className={styles.itemSubtitle}>{t("more.share_subtitle")}</span>
                        </span>
                        <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden />
                    </button>
                )}
            </div>
        </PublicSheet>
    );
}
