import type { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./SettingRow.module.scss";

/**
 * Una riga di impostazione (Allegato A, «Sezioni di impostazioni a righe»):
 * a sinistra il nome e una riga su cosa decide, in una colonna da 300 px; a
 * destra il controllo. Le righe vicine si separano con 1 px di `border`;
 * sotto 768 px le due colonne si impilano.
 *
 * Con un interruttore come `control`, i campi che ne dipendono vanno in
 * `children`: si aprono sotto la riga, solo quando li si passa.
 *
 * Va nel body `flush` di una Card, o in un contenitore senza padding: il
 * padding (24) è della riga.
 */
export interface SettingRowProps {
    label: ReactNode;
    /** Una riga su cosa decide l'impostazione. */
    description?: ReactNode;
    /** `id` del controllo, per legare il nome come `<label>`. */
    htmlFor?: string;
    control: ReactNode;
    /**
     * `end` (predefinito): il controllo sta a destra, largo quanto serve.
     * `fill`: il controllo occupa tutta la colonna, allineato a sinistra
     * (scelte a scheda, campi, testi d'aiuto sotto): le scelte di righe
     * vicine hanno così la stessa larghezza.
     */
    controlLayout?: "end" | "fill";
    /** Campi che dipendono dal controllo: sotto la riga. */
    children?: ReactNode;
}

export function SettingRow({ label, description, htmlFor, control, controlLayout = "end", children }: SettingRowProps) {
    return (
        <div className={styles.row} data-setting-row>
            <div className={styles.main}>
                <div className={styles.text}>
                    {htmlFor ? (
                        <Text as="label" htmlFor={htmlFor} variant="body" weight={600}>
                            {label}
                        </Text>
                    ) : (
                        <Text as="span" variant="body" weight={600}>
                            {label}
                        </Text>
                    )}
                    {description && (
                        <Text as="span" variant="caption" colorVariant="muted">
                            {description}
                        </Text>
                    )}
                </div>
                <div className={`${styles.control} ${controlLayout === "fill" ? styles.controlFill : ""}`}>{control}</div>
            </div>
            {children && <div className={styles.dependent}>{children}</div>}
        </div>
    );
}
