import { useTranslation } from "react-i18next";
import { CalendarClock, Monitor, Smartphone, Tablet } from "lucide-react";
import { IconUserShield } from "@tabler/icons-react";
import type { DeviceFrameFormat } from "@/components/ui/DeviceFrame/DeviceFrame";
import styles from "./PublicPreviewBar.module.scss";

type Props = {
    /** Formati offerti, già filtrati con la regola "≤ dispositivo reale".
     *  Con un solo formato (dispositivo reale mobile) le pillole non compaiono. */
    formats: DeviceFrameFormat[];
    /** Formato corrente: quello del frame, o il dispositivo reale se nessun frame. */
    activeFormat: DeviceFrameFormat;
    onSelectFormat: (format: DeviceFrameFormat) => void;
    /** Istante simulato (`?simulate=`) già validato, o null se non attivo. */
    simulateAt: string | null;
    /** Barra fissa in cima allo scroll (ramo frame: il frame tablet supera
     *  la viewport e il controllo formato deve restare raggiungibile). */
    sticky?: boolean;
};

const FORMAT_ICON: Record<DeviceFrameFormat, typeof Monitor> = {
    desktop: Monitor,
    tablet: Tablet,
    mobile: Smartphone
};

/**
 * Barra riservata in cima alla pagina pubblica: visibile SOLO a chi ha una
 * relazione reale con il tenant (vedi useTenantMembership), mai a un cliente.
 *
 * Una sola barra per tutti i casi: solo formato, solo `simulate`, entrambi.
 * Sezione "Barra non visibile ai clienti" (neutra) sempre presente; sezione
 * "Contenuto simulato — data" (gialla, distinta) solo con `simulate` attivo;
 * pillole formato a destra. Stile scuro/neutro coerente con l'header della
 * pagina pubblica: il contenuto mostrato è sempre quello reale, cambia solo
 * il formato — l'allarme giallo resta confinato alla sezione simulazione.
 */
export default function PublicPreviewBar({ formats, activeFormat, onSelectFormat, simulateAt, sticky = false }: Props) {
    const { t } = useTranslation("public");

    return (
        <div className={`${styles.bar} ${sticky ? styles.barSticky : ""}`} role="region" aria-label={t("page.preview_bar.not_visible")}>
            <div className={styles.sections}>
                <span className={styles.section}>
                    <IconUserShield size={15} stroke={1.75} aria-hidden="true" />
                    <span>{t("page.preview_bar.not_visible")}</span>
                </span>
                {simulateAt && (
                    <>
                        <span className={styles.divider} aria-hidden="true" />
                        <span className={`${styles.section} ${styles.sectionSimulated}`}>
                            <CalendarClock size={15} strokeWidth={1.75} aria-hidden="true" />
                            <span>
                                {t("page.preview_bar.simulated")}
                                {" — "}
                                {new Date(simulateAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                            </span>
                        </span>
                    </>
                )}
            </div>
            {formats.length > 1 && (
            <div className={styles.formats} role="group" aria-label={t("page.preview_bar.format_label")}>
                {formats.map(format => {
                    const Icon = FORMAT_ICON[format];
                    const isActive = format === activeFormat;
                    return (
                        <button
                            key={format}
                            type="button"
                            className={styles.pill}
                            data-active={isActive ? "true" : undefined}
                            aria-pressed={isActive}
                            onClick={() => onSelectFormat(format)}
                        >
                            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                            <span>{t(`page.preview_bar.format_${format}`)}</span>
                        </button>
                    );
                })}
            </div>
            )}
        </div>
    );
}
