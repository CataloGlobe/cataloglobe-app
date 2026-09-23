import type { ReactNode } from "react";
import styles from "./Frame.module.scss";

type FrameProps = {
    /**
     * Barre fisse (Passata 2). Renderizzate PRIMA di `.frame`, come sorelle:
     * quando lo sheet scala `.frame`, un `transform` sull'antenato renderebbe
     * `position: fixed` relativo all'antenato e le barre scalerebbero con la pagina.
     */
    fixed?: ReactNode;
    children: ReactNode;
};

/** Cornice della landing: piano esterno + pagina stondata appoggiata sopra. */
export default function Frame({ fixed, children }: FrameProps) {
    return (
        <div className={styles.landing} data-landing="">
            {fixed}
            <div className={styles.frame}>
                <div className={styles.page}>{children}</div>
            </div>
        </div>
    );
}
