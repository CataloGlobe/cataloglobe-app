import { useEffect, useRef, useState } from "react";
import Problem from "@pages/CampaignLanding/components/Problem/Problem";
import { Kicker } from "@pages/CampaignLanding/components/kit/Kit";
import { ORDERS } from "@pages/CampaignLanding/content/landing";
import { useReducedMotion } from "@pages/CampaignLanding/hooks/useReducedMotion";
import { useVisible } from "@pages/CampaignLanding/hooks/useVisible";
import styles from "./Orders.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Durata di un passo. ⚠️ Stessa durata in Orders.module.scss ($step-ms, la barretta). */
const STEP_MS = 3000;

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

/** Scena 1: il pulsante si preme a 1700 ms e a 1850 dice «Ordine inviato ✓» (le righe entrano in CSS). */
const PRESS_MS = 1700;
const SENT_MS = 1850;

/** Scena 1: la scheda dell'ordine dal telefono del cliente, al centro del riquadro. */
function OrderPanel({ still }: { still: boolean }) {
    const { order } = ORDERS;
    const [phase, setPhase] = useState<"idle" | "press" | "sent">("idle");

    useEffect(() => {
        if (still) return;
        const t1 = window.setTimeout(() => setPhase("press"), PRESS_MS);
        const t2 = window.setTimeout(() => setPhase("sent"), SENT_MS);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [still]);

    const sent = still || phase === "sent";

    return (
        <div className={styles.order}>
            <div className={styles.orderCard}>
                <div className={styles.orderHead}>
                    <Kicker>{order.label}</Kicker>
                    <span className={styles.tableChip}>{order.table}</span>
                </div>
                {order.lines.map((l) => (
                    <div key={l.name} className={styles.line}>
                        <span className={styles.qty}>{l.qty}</span>
                        <span className={styles.lineName}>{l.name}</span>
                        <span className={styles.linePrice}>{l.price}</span>
                    </div>
                ))}
                <div className={styles.total}>
                    <span>{order.totalLabel}</span>
                    <span>{order.total}</span>
                </div>
                <div className={cx(styles.send, phase === "press" && styles.sendPress)}>{sent ? order.sent : order.send}</div>
                <p className={styles.orderNote}>{order.note}</p>
            </div>
        </div>
    );
}

/** Scena 2: la comanda esce dalla fessura della stampante e si srotola (CSS). */
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
                <div key={`${step}-${visible}`} className={styles.panelIn}>
                    {step === 0 && <OrderPanel still={reduced} />}
                    {step === 1 && <TicketPanel />}
                    {step === 2 && <FloorPanel />}
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
