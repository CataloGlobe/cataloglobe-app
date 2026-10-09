import { forwardRef, type CSSProperties } from "react";
import { formatInactiveReason } from "@/utils/activityStatus";
import { PART_TITLE, type SchedaPart } from "./schedaCopy";
import {
    addressLine,
    feesFilled,
    feeValue,
    hoursGroups,
    visibleContacts,
    type SchedaFacts
} from "./schedaModel";
import styles from "./Scheda.module.scss";

interface SchedaPhoneProps {
    facts: SchedaFacts;
    /** La parte accesa (passando su una tessera). */
    highlight?: SchedaPart | null;
    /** Nella vista a fuoco le parti si toccano e portano lì. */
    onPick?: (part: SchedaPart) => void;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * La pagina pubblica in piccolo (prototipo C+++): le stesse parti, nello
 * stesso ordine, ognuna col suo `data-part` per accendersi e per agganciare
 * lo scorrimento della scheda. È un disegno, non la pagina vera: dice cosa
 * vede il cliente con i valori del draft, prima del Salva.
 */
export const SchedaPhone = forwardRef<HTMLDivElement, SchedaPhoneProps>(function SchedaPhone(
    { facts, highlight = null, onPick },
    scrRef
) {
    const { a, open } = facts;
    const vis = visibleContacts(a);
    const fees = a.fees_public ? feesFilled(a.fees) : [];
    const pay = a.payment_methods_public ? (a.payment_methods ?? []) : [];
    const serv = a.services_public ? (a.services ?? []) : [];
    const groups = a.hours_public ? hoursGroups(facts.regular, facts.now.weekday) : [];
    const reservations = a.enable_reservations && !facts.reservationsLocked;

    // Le parti che si toccano nella vista a fuoco (come nel prototipo: non i
    // due bottoni, che sono azioni e non testi).
    const part = (k: SchedaPart, className?: string, style?: CSSProperties) => ({
        "data-part": k,
        className: cx(className, onPick && styles.pp, highlight === k && styles.hl),
        style,
        ...(onPick
            ? {
                  role: "button",
                  tabIndex: 0,
                  title: `${PART_TITLE[k]}: tocca per cambiarlo`,
                  onClick: () => onPick(k),
                  onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPick(k);
                      }
                  }
              }
            : {})
    });
    const still = (k: SchedaPart, className?: string) => ({
        "data-part": k,
        className: cx(className, highlight === k && styles.hl)
    });

    const coverStyle: CSSProperties | undefined = a.cover_image ? { backgroundImage: `url("${a.cover_image}")` } : undefined;

    return (
        <div className={styles.phone} aria-label="Come la vede il cliente">
            <div className={styles.screen}>
                {a.status !== "active" && (
                    <div className={styles.susp}>
                        <b>{a.name}</b>
                        <span>
                            {a.inactive_reason
                                ? `Siamo chiusi: ${formatInactiveReason(a.inactive_reason).toLowerCase()}. Torniamo presto.`
                                : "Siamo chiusi. Torniamo presto."}
                        </span>
                    </div>
                )}
                <div className={styles.scr} ref={scrRef}>
                    <div {...part("locale", cx(styles.pCover, styles.cover, !a.cover_image && styles.coverNone), coverStyle)} />
                    <div className={styles.pBody}>
                        <div {...part("locale", styles.pIdent)}>
                            <div className={styles.pName}>{a.name || "Senza nome"}</div>
                            {a.description && <div className={styles.pDesc}>{a.description}</div>}
                        </div>
                        {a.hours_public && (
                            <div {...part("orari")}>
                                <span className={cx(styles.pOpen, !open.open && styles.pClosed)}>{open.text}</span>
                            </div>
                        )}
                        <div {...part("contatti")}>
                            {vis.length ? (
                                <div className={styles.pIcons}>
                                    {vis.map(({ field, label, Icon }) => (
                                        <span key={field} className={styles.pIc} title={label}>
                                            <Icon size={15} strokeWidth={1.75} aria-hidden />
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <span className={styles.pNone}>Nessun contatto visibile</span>
                            )}
                        </div>
                        <div {...still("prenotazioni", styles.pCta)}>
                            {reservations && <span>Prenota un tavolo</span>}
                            <span className={reservations ? styles.pCtaAlt : styles.pCtaWide}>Il menù</span>
                        </div>
                        <div {...still("ordini", styles.pMenu)}>
                            <span>Menù alla carta</span>
                            <span className={styles.pMuted}>›</span>
                        </div>
                        {a.hours_public && (
                            <div {...part("orari", styles.pSec)}>
                                <span className={styles.pH}>Orari</span>
                                <div className={styles.pHours}>
                                    {groups.map(g => (
                                        <span key={g.days} style={{ display: "contents" }}>
                                            <span className={g.today ? styles.pTd : undefined}>{g.days}</span>
                                            <span className={g.today ? styles.pTd : undefined}>{g.text}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div {...part("dove", styles.pSec)}>
                            <span className={styles.pH}>Dove siamo</span>
                            <span>{addressLine(a) || "—"}</span>
                        </div>
                        {(pay.length > 0 || serv.length > 0) && (
                            <div {...part("offrite", styles.pSec)}>
                                {pay.length > 0 && (
                                    <>
                                        <span className={styles.pH}>Pagamenti</span>
                                        <div className={styles.pChips}>
                                            {pay.map(p => (
                                                <span key={p}>{p}</span>
                                            ))}
                                        </div>
                                    </>
                                )}
                                {serv.length > 0 && (
                                    <>
                                        <span className={styles.pH} style={pay.length ? { marginTop: 4 } : undefined}>
                                            Servizi
                                        </span>
                                        <div className={styles.pChips}>
                                            {serv.map(p => (
                                                <span key={p}>{p}</span>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {fees.length > 0 && (
                            <div {...part("conto", styles.pSec)}>
                                <span className={styles.pH}>Al conto</span>
                                <div className={styles.pFees}>
                                    {fees.map(({ def, value }) => (
                                        <span key={def.key} style={{ display: "contents" }}>
                                            <span>{def.label}</span>
                                            <span>{feeValue(def, value)}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
