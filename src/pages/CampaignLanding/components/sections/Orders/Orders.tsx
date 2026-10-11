import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { Kicker } from "@pages/CampaignLanding/components/kit/Kit";
import { ORDERS } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import styles from "./Orders.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Durata di un passo. ⚠️ Stessa durata in Orders.module.scss ($step-ms, la barretta). */
const STEP_MS = 3000;
/** Uscita della scena vecchia. ⚠️ Stessa durata in Orders.module.scss ($leave-ms). */
const LEAVE_MS = 300;

/** Scena del passo: la vecchia, mentre esce, resta ferma allo stato finale. */
function renderScene(step: number, still: boolean) {
    if (step === 0) return <OrderPanel still={still} />;
    if (step === 1) return <TicketPanel />;
    return <FloorPanel />;
}

function BillIcon({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
            <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
    );
}

function BellIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
    );
}

type TableState = "busy" | "free" | "bill" | "call";
const FLOOR: { n: number; shape: "round" | "rect"; state: TableState }[] = [
    { n: 2, shape: "round", state: "busy" },
    { n: 4, shape: "rect", state: "busy" },
    { n: 5, shape: "round", state: "free" },
    { n: 7, shape: "rect", state: "bill" },
    { n: 9, shape: "round", state: "busy" },
    { n: 10, shape: "rect", state: "free" },
    { n: 12, shape: "round", state: "call" },
    { n: 14, shape: "rect", state: "busy" },
    { n: 15, shape: "round", state: "free" }
];

/**
 * Scena 1: il cliente tocca «+» sui piatti (tagliere, spritz due volte,
 * tiramisù, acqua); al primo tocco sale la barra: a sinistra «Invia l'ordine»,
 * a destra il carrello che conta i piatti; poi il pulsante si preme e dice
 * «Ordine inviato ✓». Un istante della sequenza per ogni voce di TAPS.
 */
const TAPS: { ms: number; dish?: number }[] = [
    // Scena da STEP_MS (3 s): «Ordine inviato» resta a vista quasi un secondo.
    { ms: 300, dish: 0 },
    { ms: 600, dish: 1 },
    { ms: 850, dish: 1 },
    { ms: 1100, dish: 2 },
    { ms: 1350, dish: 3 },
    { ms: 1900 },
    { ms: 2050 }
];
const PRESS_AT = 5;
const SENT_AT = 6;

function OrderPanel({ still }: { still: boolean }) {
    const { order } = ORDERS;
    /** Quanti istanti di TAPS sono passati. */
    const [at, setAt] = useState(0);

    useEffect(() => {
        if (still) return;
        const ids = TAPS.map((t, i) => window.setTimeout(() => setAt(i + 1), t.ms));
        return () => ids.forEach((id) => window.clearTimeout(id));
    }, [still]);

    const done = still ? TAPS.length : at;
    const qty = (dish: number) => TAPS.slice(0, done).filter((t) => t.dish === dish).length;
    const lastTap = done > 0 ? TAPS[done - 1].dish : undefined;
    const sent = done >= SENT_AT;
    const items = order.dishes.reduce((n, _d, i) => n + qty(i), 0);
    const total = order.dishes.reduce((sum, d, i) => sum + qty(i) * parseInt(d.price, 10), 0);

    return (
        <div className={styles.order}>
            <div className={styles.orderHead}>
                <Kicker>{order.label}</Kicker>
                <span className={styles.tableChip}>{order.table}</span>
            </div>
            {order.dishes.map((d, i) => (
                <div key={d.name} className={styles.dish}>
                    <span className={styles.dishText}>
                        <span className={styles.dishName}>{d.name}</span>
                        <span className={styles.dishDesc}>{d.desc}</span>
                    </span>
                    <span className={styles.dishPrice}>{d.price}</span>
                    <span
                        // Chiave nuova a ogni tocco: l'onda riparte.
                        key={qty(i)}
                        className={cx(styles.plus, !still && lastTap === i && styles.plusTap)}
                        aria-hidden="true"
                    >
                        +
                    </span>
                </div>
            ))}
            {/* A sinistra il pulsante che invia, a destra il carrello che si riempie. */}
            <div className={cx(styles.sendBar, done > 0 && styles.sendBarUp)}>
                <span className={cx(styles.sendBtn, done === PRESS_AT + 1 && styles.sendBtnPress)}>
                    <span>{sent ? order.sent : order.send}</span>
                    <span>{total} €</span>
                </span>
                <span className={styles.cart}>
                    <ShoppingBag size={20} strokeWidth={2.2} aria-hidden="true" />
                    {/* Chiave = quantità: il numero rimbalza a ogni piatto aggiunto. */}
                    <span key={items} className={styles.cartCount}>
                        {items}
                    </span>
                </span>
            </div>
        </div>
    );
}

function TicketPanel() {
    const { ticket } = ORDERS;
    return (
        <div className={styles.kitchen}>
            <Kicker className={styles.kitchenLabel}>{ticket.label}</Kicker>
            <span className={styles.slot} aria-hidden="true" />
            <div className={styles.ticketOut}>
                <div className={styles.ticket}>
                    <div className={styles.ticketPaper}>
                        <div className={styles.ticketHead}>
                            <span className={styles.ticketTable}>{ticket.table}</span>
                            <span className={styles.ticketTime}>{ticket.time}</span>
                        </div>
                        <div className={styles.ticketMeta}>{ticket.meta}</div>
                        <div className={styles.ticketRule} />
                        {ticket.lines.map((l) => (
                            <div key={l.name} className={styles.ticketLine}>
                                <span>{l.qty}</span>
                                <span>{l.name}</span>
                            </div>
                        ))}
                        <div className={cx(styles.ticketRule, styles.ticketRuleEnd)} />
                    </div>
                    <div className={styles.zigzag} />
                </div>
            </div>
            <p className={styles.kitchenNote}>{ticket.note}</p>
        </div>
    );
}

function FloorPanel() {
    const { floor } = ORDERS;
    return (
        <div className={styles.floorScene}>
            <Kicker>{floor.label}</Kicker>
            <div className={styles.floor}>
                {FLOOR.map((t) => (
                    <div key={t.n} className={styles.cell}>
                        <div className={cx(styles.table, styles[t.shape], styles[t.state])}>
                            {t.shape === "round" ? (
                                <>
                                    <span className={cx(styles.chair, styles.chairTop)} />
                                    <span className={cx(styles.chair, styles.chairBottom)} />
                                </>
                            ) : (
                                <>
                                    <span className={cx(styles.chair, styles.chairTL)} />
                                    <span className={cx(styles.chair, styles.chairTR)} />
                                    <span className={cx(styles.chair, styles.chairBL)} />
                                    <span className={cx(styles.chair, styles.chairBR)} />
                                </>
                            )}
                            {t.n}
                            {t.state === "bill" && (
                                <span className={styles.flag}>
                                    <BillIcon size={11} />
                                </span>
                            )}
                            {t.state === "call" && (
                                <span className={styles.flag}>
                                    <BellIcon />
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    <span className={cx(styles.dot, styles.dotCall)} />
                    {floor.legend.call}
                </span>
                <span className={styles.legendItem}>
                    <span className={cx(styles.dot, styles.dotBill)} />
                    {floor.legend.bill}
                </span>
                <span className={styles.legendItem}>
                    <span className={cx(styles.dot, styles.dotFree)} />
                    {floor.legend.free}
                </span>
            </div>
            <div className={styles.alert}>
                <span className={styles.alertIcon}>
                    <BillIcon size={12} />
                </span>
                <span className={styles.alertText}>{floor.alert}</span>
                <span className={styles.alertTime}>{floor.alertTime}</span>
            </div>
        </div>
    );
}

/**
 * Tre linguette che avanzano da sole ogni 3 s finché sono sullo schermo; la
 * linguetta attiva si riempie da sinistra di un velo blu per la durata del
 * passo. Uscite del tutto tornano al passo 1. Al clic la linguetta scelta resta
 * ferma (niente velo), anche dopo un'uscita. Pannello ad altezza fissa (324 px);
 * la scena riparte quando il pannello torna in vista. Con reduced-motion le
 * scene sono nello stato finale.
 */
function OrdersDemo() {
    const ref = useRef<HTMLDivElement>(null);
    const [step, setStep] = useState(0);
    const [pinned, setPinned] = useState(false);
    const visible = useVisible(ref, 0.3, () => {
        if (!pinned) setStep(0);
    });
    const reduced = useReducedMotion();

    const running = visible && !pinned && !reduced;

    // Passaggio: la scena vecchia resta 300 ms mentre esce, la nuova entra dal
    // lato verso cui va la linguetta (dir 1 = avanti, −1 = indietro).
    const [shown, setShown] = useState(0);
    const [leaving, setLeaving] = useState<{ step: number; n: number } | null>(null);
    const [dir, setDir] = useState(1);
    const prev = useRef(step);
    useEffect(() => {
        if (prev.current === step) return;
        const from = prev.current;
        prev.current = step;
        if (reduced) return;
        setDir(step > from || (from === 2 && step === 0) ? 1 : -1);
        setLeaving({ step: from, n: shown });
        setShown((n) => n + 1);
        const id = window.setTimeout(() => setLeaving(null), LEAVE_MS);
        return () => window.clearTimeout(id);
        // Solo al cambio di passo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    // Un timer per passo: il velo (rimontato a ogni passo e a ogni ripresa) e il
    // cambio di passo partono insieme.
    useEffect(() => {
        if (!running) return;
        const id = window.setTimeout(() => setStep((s) => (s + 1) % 3), STEP_MS);
        return () => window.clearTimeout(id);
    }, [running, step]);

    return (
        <div ref={ref}>
            <div className={styles.tabs} role="tablist" aria-label={ORDERS.copy.title.lead}>
                <div className={cx(styles.cursor, styles[`cursor${step}`])} aria-hidden="true" />
                {ORDERS.steps.map((s, i) => (
                    <button
                        key={s.label}
                        type="button"
                        role="tab"
                        id={`landing-orders-tab-${i}`}
                        aria-selected={i === step}
                        aria-controls="landing-orders-panel"
                        className={cx(styles.tab, i === step && styles.tabOn)}
                        onClick={() => {
                            setStep(i);
                            setPinned(true);
                        }}
                    >
                        {running && i === step && <span key={step} className={styles.progress} aria-hidden="true" />}
                        <span className={styles.tabLabel}>{s.label}</span>
                        <span className={styles.tabSub}>{s.sub}</span>
                    </button>
                ))}
            </div>
            <div className={styles.panel} role="tabpanel" id="landing-orders-panel" aria-labelledby={`landing-orders-tab-${step}`}>
                {leaving && (
                    <div key={`out-${leaving.step}-${leaving.n}`} className={cx(styles.scene, styles.sceneOut)} style={{ "--dir": dir } as CSSProperties} aria-hidden="true">
                        {renderScene(leaving.step, true)}
                    </div>
                )}
                <div key={`${step}-${visible}`} className={cx(styles.scene, styles.sceneIn)} style={{ "--dir": dir } as CSSProperties}>
                    {renderScene(step, reduced)}
                </div>
            </div>
            <p className={styles.printer}>{ORDERS.printerNote}</p>
        </div>
    );
}

/** 4 · Ordini dal tavolo (Piano Pro): i tre passi, dal cliente alla sala. */
export default function Orders() {
    return <Problem id="come" tone="white" copy={ORDERS.copy} visualSide="right" visualGap="none" visual={<OrdersDemo />} />;
}
