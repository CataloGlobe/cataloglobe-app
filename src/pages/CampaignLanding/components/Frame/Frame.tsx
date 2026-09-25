import type { ReactNode } from "react";
import styles from "./Frame.module.scss";

type FrameProps = {
    /**
     * Barre fisse (navigazione). Renderizzate prima delle sezioni, come sorelle:
     * nessun antenato con `transform`, così `position: fixed` resta sulla finestra.
     */
    fixed?: ReactNode;
    children: ReactNode;
};

/** Radice della landing: token, font, pagina bianca a tutta larghezza. */
export default function Frame({ fixed, children }: FrameProps) {
    return (
        <div className={styles.landing} data-landing="">
            {fixed}
            <main className={styles.page}>{children}</main>
        </div>
    );
}
