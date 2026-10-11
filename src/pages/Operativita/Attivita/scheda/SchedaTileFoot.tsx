import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./Scheda.module.scss";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** In fondo alla tessera: dove la vede il cliente, e «Cambia». */
export function SchedaTileFoot({ icon, text, warn = false }: { icon: ReactNode; text: string; warn?: boolean }) {
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
