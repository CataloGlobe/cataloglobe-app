import type { ReactNode } from "react";
import { Eye, EyeOff, QrCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Switch } from "@/components/ui/Switch/Switch";
import { PART_ICON, PART_TITLE, type SchedaPart } from "./schedaCopy";
import {
    cityLine,
    closureWhat,
    closureWhen,
    feesEmpty,
    feesFilled,
    feeShort,
    filledContacts,
    streetLine,
    visibleContacts,
    type SchedaFacts
} from "./schedaModel";
import { SchedaWeek } from "./SchedaWeek";
import styles from "./Scheda.module.scss";
import { SchedaTileFoot } from "./SchedaTileFoot";

export interface TileActions {
    canManage: boolean;
    open: (part: SchedaPart) => void;
    changed: (part: SchedaPart) => boolean;
    toggleContact: (flag: ReturnType<typeof filledContacts>[number]["flag"], next: boolean) => void;
    toggleReservations: (next: boolean) => void;
    toggleOrdering: (next: boolean) => void;
    retryPrinters: () => void;
    isRetrying: boolean;
}

interface SchedaTileProps {
    part: SchedaPart;
    facts: SchedaFacts;
    actions: TileActions;
    wide?: boolean;
    highlighted?: boolean;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Dentro la tessera i controlli fanno la loro cosa, non aprono il fuoco. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const eye = <Eye size={14} strokeWidth={1.75} aria-hidden />;
const eyeOff = <EyeOff size={14} strokeWidth={1.75} aria-hidden />;

/**
 * Una tessera del cruscotto (prototipo C+++): in alto la domanda, in grande
 * la risposta, sotto i dettagli, in fondo dove la vede il cliente e
 * «Cambia». Tutta la tessera apre la vista a fuoco della sua parte.
 */
export function SchedaTile({ part, facts, actions, wide = false, highlighted = false }: SchedaTileProps) {
    const { a } = facts;
    const Icon = PART_ICON[part];
    let ans: ReactNode = null;
    let det: ReactNode = null;
    let foot: ReactNode = null;
    let muted = false;

    switch (part) {
        case "orari": {
            ans = facts.closure?.is_closed
                ? "Oggi chiuso"
                : facts.open.open
                  ? facts.open.text.replace("Aperto · chiude", "Aperti, chiudete")
                  : facts.open.text;
            if (!facts.hasHours) {
                ans = "Orari da mettere";
                muted = true;
            }
            det = (
                <>
                    <SchedaWeek facts={facts} />
                    {facts.next && (
                        <span>
                            Prossima chiusura: {closureWhat(facts.next)}, {closureWhen(facts.next)}
                        </span>
                    )}
                </>
            );
            foot = a.hours_public ? (
                <SchedaTileFoot icon={eye} text="Sulla pagina, con «Aperto» o «Chiuso»" />
            ) : (
                <SchedaTileFoot icon={eyeOff} text="Nascosti ai clienti" warn />
            );
            break;
        }
        case "dove": {
            ans = streetLine(a) || "Manca l'indirizzo";
            muted = !streetLine(a);
            det = (
                <>
                    {cityLine(a) && <span>{cityLine(a)}</span>}
                    <span>{a.google_review_url ? "Collegato a Google" : "Google non collegato"}</span>
                </>
            );
            foot = <SchedaTileFoot icon={eye} text={a.google_review_url ? "Sulla pagina e su Google" : "Sulla pagina"} />;
            break;
        }
        case "contatti": {
            const f = filledContacts(a);
            const v = visibleContacts(a);
            ans = `${v.length} sulla pagina`;
            det = f.length ? (
                f.map(c => {
                    const on = Boolean(a[c.flag]);
                    return (
                        <div key={c.field} className={styles.contactLine}>
                            <c.Icon size={14} strokeWidth={1.75} aria-hidden />
                            <span className={cx(styles.contactValue, !on && styles.contactHidden)}>{a[c.field]}</span>
                            <button
                                type="button"
                                className={styles.eye}
                                aria-pressed={on}
                                aria-label={`${c.label}: ${on ? "sulla pagina" : "solo per voi"}`}
                                title={on ? "Sulla pagina: tocca per tenerlo solo per voi" : "Solo per voi: tocca per metterlo sulla pagina"}
                                disabled={!actions.canManage}
                                onClick={e => {
                                    stop(e);
                                    actions.toggleContact(c.flag, !on);
                                }}
                                onKeyDown={stop}
                            >
                                {on ? <Eye size={16} strokeWidth={1.75} aria-hidden /> : <EyeOff size={16} strokeWidth={1.75} aria-hidden />}
                            </button>
                        </div>
                    );
                })
            ) : (
                <span>Nessun contatto scritto.</span>
            );
            foot =
                f.length > v.length ? (
                    <SchedaTileFoot icon={eyeOff} text={`${f.length - v.length} solo per voi`} />
                ) : (
                    <SchedaTileFoot icon={eye} text="Tutti sulla pagina" />
                );
            break;
        }
        case "offrite": {
            const pay = a.payment_methods ?? [];
            const serv = a.services ?? [];
            ans = `${pay.length} modi di pagare · ${serv.length} servizi`;
            muted = !pay.length && !serv.length;
            det = (
                <>
                    {pay.length > 0 && (
                        <span>
                            {pay.slice(0, 3).join(", ")}
                            {pay.length > 3 ? "…" : ""}
                        </span>
                    )}
                    {serv.length > 0 && (
                        <span>
                            {serv.slice(0, 3).join(", ")}
                            {serv.length > 3 ? "…" : ""}
                        </span>
                    )}
                </>
            );
            foot =
                a.payment_methods_public && a.services_public ? (
                    <SchedaTileFoot icon={eye} text="In fondo alla pagina" />
                ) : (
                    <SchedaTileFoot icon={eyeOff} text="In parte nascosti" warn />
                );
            break;
        }
        case "conto": {
            const f = feesFilled(a.fees);
            const empty = feesEmpty(a.fees);
            ans = f.length ? f.map(({ def, value }) => feeShort(def, value)).join(" · ") : "Niente oltre ai piatti";
            muted = !f.length;
            const list = empty.map(d => d.label.toLowerCase()).join(", ");
            det = empty.length ? <span>{list.charAt(0).toUpperCase() + list.slice(1)}: non messi.</span> : null;
            foot = a.fees_public ? <SchedaTileFoot icon={eye} text="Sulla pagina" /> : <SchedaTileFoot icon={eyeOff} text="Nascosto ai clienti" warn />;
            break;
        }
        case "prenotazioni": {
            if (facts.reservationsLocked) {
                ans = "Con il piano Pro";
                muted = true;
                det = <span>Il bottone «Prenota un tavolo» arriva con il Pro.</span>;
                foot = <SchedaTileFoot icon={eyeOff} text="Non compare sulla pagina" />;
                break;
            }
            const on = a.enable_reservations;
            ans = on ? "Si prenota dalla pagina" : "Spente";
            muted = !on;
            det = (
                <>
                    <span onClick={stop} onKeyDown={stop}>
                        <Switch size="sm" label={on ? "Accese" : "Spente"} checked={on} onChange={actions.toggleReservations} disabled={!actions.canManage} />
                    </span>
                    {on ? (
                        <span>
                            {a.reservation_capacity ? `Fino a ${a.reservation_capacity} coperti` : "Capienza da mettere"} ·{" "}
                            {a.reservation_confirmation_mode === "auto" ? "si confermano da sole" : "le confermate voi, una per una"}
                        </span>
                    ) : (
                        <span>Il bottone «Prenota un tavolo» non compare.</span>
                    )}
                </>
            );
            foot = <SchedaTileFoot icon={on ? eye : eyeOff} text={on ? "Bottone «Prenota un tavolo» sulla pagina" : "Non compare sulla pagina"} />;
            break;
        }
        case "ordini": {
            if (facts.orderingLocked) {
                ans = "Con il piano Pro";
                muted = true;
                det = <span>Dal QR si guarda il menù, non si ordina.</span>;
                foot = <SchedaTileFoot icon={<QrCode size={14} strokeWidth={1.75} aria-hidden />} text="QR solo per il menù" />;
                break;
            }
            const on = a.ordering_enabled;
            const active = facts.printers.filter(p => p.is_active);
            ans = on ? "Si ordina dal tavolo" : "Spenti";
            muted = !on;
            det = (
                <>
                    <span onClick={stop} onKeyDown={stop}>
                        <Switch size="sm" label={on ? "Accesi" : "Spenti"} checked={on} onChange={actions.toggleOrdering} disabled={!actions.canManage} />
                    </span>
                    {on ? (
                        <span>
                            {active.length
                                ? `Le comande si stampano da sole: ${active.map(p => p.label).join(", ")}`
                                : "Le comande arrivano in Comande; nessuna stampante collegata"}
                        </span>
                    ) : (
                        <span>Dal QR si guarda il menù, non si ordina.</span>
                    )}
                    {on &&
                        facts.down.map(p => (
                            <div key={p.id} className={styles.prob}>
                                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
                                <span>La stampante «{p.label}» non risponde</span>
                                <span onClick={stop} onKeyDown={stop} style={{ flex: "none", minWidth: 0 }}>
                                    <Button variant="secondary" size="sm" loading={actions.isRetrying} onClick={actions.retryPrinters}>
                                        Riprova
                                    </Button>
                                </span>
                            </div>
                        ))}
                </>
            );
            foot = <SchedaTileFoot icon={<QrCode size={14} strokeWidth={1.75} aria-hidden />} text={on ? "Dal QR sul tavolo" : "QR solo per il menù"} />;
            break;
        }
        default:
            return null;
    }

    return (
        <div
            className={cx(styles.tile, wide && styles.w2, highlighted && styles.tileHl)}
            data-k={part}
            role="button"
            tabIndex={0}
            aria-label={`${PART_TITLE[part]}: apri`}
            onClick={() => actions.open(part)}
            onKeyDown={e => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                    e.preventDefault();
                    actions.open(part);
                }
            }}
        >
            <div className={styles.th}>
                <span className={styles.ico}>
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <b className={styles.thTitle}>{PART_TITLE[part]}</b>
                {actions.changed(part) && <span className={styles.chg}>Da salvare</span>}
            </div>
            <div className={cx(styles.ans, muted && styles.ansMuted)}>{ans}</div>
            {det && <div className={styles.det}>{det}</div>}
            {foot}
        </div>
    );
}
