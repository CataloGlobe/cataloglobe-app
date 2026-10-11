import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dismissAdded, useAddedNotice } from "./addedNoticeStore";
import styles from "./AddedNotice.module.scss";

/** Quanto resta a vista; col fuoco o il puntatore sopra il conto si ferma. */
const VISIBLE_MS = 4000;

/**
 * Avviso «Aggiunto · nome» con «Annulla» sopra la barra in basso (spec §7).
 * Sempre montato: la regione `status` esiste prima del testo, così i lettori di
 * schermo lo annunciano. Entra e esce solo con opacity e transform (più
 * visibility a scatto).
 */
export default function AddedNotice() {
    const { t } = useTranslation("public");
    const notice = useAddedNotice();
    const [held, setHeld] = useState(false);
    // L'ultimo testo resta durante l'uscita.
    const lastName = useRef("");
    if (notice) lastName.current = notice.name;

    useEffect(() => {
        if (!notice || held) return;
        const id = window.setTimeout(() => dismissAdded(notice.id), VISIBLE_MS);
        return () => window.clearTimeout(id);
    }, [notice, held]);

    return (
        <div className={styles.region}>
            {/* Il testo per i lettori di schermo nasce a ogni avviso (key): anche lo stesso piatto due volte si annuncia. */}
            <div className={styles.srOnly} role="status" aria-live="polite">
                {notice ? <span key={notice.id}>{t("order_sheet.added", { name: notice.name })}</span> : null}
            </div>
            <div
                className={styles.notice}
                data-open={notice ? "" : undefined}
                inert={!notice}
                onPointerEnter={() => setHeld(true)}
                onPointerLeave={() => setHeld(false)}
                onFocus={() => setHeld(true)}
                onBlur={() => setHeld(false)}
            >
                <span className={styles.text} aria-hidden="true">
                    {t("order_sheet.added", { name: lastName.current })}
                </span>
                <button
                    type="button"
                    className={styles.undo}
                    aria-label={t("order_sheet.undo_aria", { name: lastName.current })}
                    onClick={() => {
                        if (!notice) return;
                        notice.undo();
                        dismissAdded(notice.id);
                        setHeld(false);
                    }}
                >
                    {t("order_sheet.undo")}
                </button>
            </div>
        </div>
    );
}
