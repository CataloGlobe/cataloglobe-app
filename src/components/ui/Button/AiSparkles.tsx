import { Sparkles } from "lucide-react";
import styles from "./AiSparkles.module.scss";

/**
 * L'icona delle azioni AI («Genera con AI», «Importa con AI»): `Sparkles` in
 * `brand-primary` dentro un bottone secondario, riconoscibile senza competere
 * col primario della schermata. Dentro un bottone primario si usa `Sparkles`
 * semplice, che prende il colore del testo.
 */
export function AiSparkles({ size = 16 }: { size?: number }) {
    return <Sparkles size={size} className={styles.icon} aria-hidden="true" />;
}
