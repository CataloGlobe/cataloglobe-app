import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./Prodotto.module.scss";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** In fondo alla tessera: dove si vede sul telefono, e «Cambia». */
export function ProdottoTileFoot({ icon, text, warn = false }: { icon: ReactNode; text: string; warn?: boolean }) {
    return (
        <div className={styles.tf}>
            <span className={cx(styles.tfText, warn && styles.tfHid)}>
                {icon}
                <span>{text}</span>
            </span>
            <span className={styles.go}>
                Cambia
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            </span>
        </div>
    );
}
