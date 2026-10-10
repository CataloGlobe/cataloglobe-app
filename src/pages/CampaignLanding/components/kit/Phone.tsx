import type { ReactNode } from "react";
import styles from "./Phone.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * Il telefono simulato della landing: cornice, isola e schermo. Il contenuto
 * è disegnato su 300 px di larghezza e scalato; la misura la dà il genitore
 * col mixin `ld-phone` sulla `className`.
 */
export function Phone({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div className={cx(styles.phone, className)}>
            <span className={styles.buttons} aria-hidden="true" />
            <span className={styles.volume} aria-hidden="true" />
            <span className={styles.island} />
            <div className={styles.screen}>
                <div className={styles.content}>{children}</div>
            </div>
        </div>
    );
}

function StatusIcons() {
    return (
        <span className={styles.sbIcons}>
            <svg viewBox="0 0 18 11" fill="currentColor">
                <rect x="0" y="7" width="3" height="4" rx="1" />
                <rect x="5" y="5" width="3" height="6" rx="1" />
                <rect x="10" y="2.5" width="3" height="8.5" rx="1" />
                <rect x="15" y="0" width="3" height="11" rx="1" />
            </svg>
            <svg viewBox="0 0 26 12">
                <rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity=".5" />
                <rect x="2" y="2" width="16" height="8" rx="1.8" fill="currentColor" />
                <rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity=".5" />
            </svg>
        </span>
    );
}

/** Barra di stato, dentro il contenuto da 300 px. `shade`: velo scuro per gli screenshot. */
export function PhoneStatusBar({ time, timeOut, shade }: { time: string; timeOut?: boolean; shade?: boolean }) {
    return (
        <div className={cx(styles.statusBar, shade && styles.statusShade)} aria-hidden="true">
            <span className={cx(styles.sbTime, timeOut && styles.sbTimeOut)}>{time}</span>
            <StatusIcons />
        </div>
    );
}
