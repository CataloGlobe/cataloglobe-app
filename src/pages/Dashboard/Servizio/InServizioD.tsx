import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Maximize2, Minimize2 } from "lucide-react";

import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";
import { OrdersBoard, type OrdersSummary } from "@/pages/Dashboard/Orders/Orders";
import ServizioElenco from "./ServizioElenco";

import styles from "./InServizioD.module.scss";

/** Le tre parti di In servizio: affiancate da tablet in su, una alla volta al telefono. */
export type InServizioDPart = "comande" | "sala" | "arrivo";

const PARTS: readonly InServizioDPart[] = ["comande", "sala", "arrivo"];
/** Il pannello aperto di un tavolo, una prenotazione o una tavolata (come in Servizio). */
const DETAIL_PARAMS = ["tavolo", "prenotazione", "tavolata"] as const;

function readPart(value: string | null): InServizioDPart | null {
    return PARTS.includes(value as InServizioDPart) ? (value as InServizioDPart) : null;
}

type Props = {
    tenantId: string;
    activityId: string;
    /** Mappa o Elenco della sala: è il `?modo=` di sempre. */
    view: "mappa" | "elenco";
    onViewChange: (view: "mappa" | "elenco") => void;
    /** Comande (piano e `orders.read`). */
    showComande: boolean;
    /** Mappa (piano e `seatings.read` più tavoli). */
    canMappa: boolean;
    /** Elenco: sala e arrivi (piano e permessi delle prenotazioni). */
    canElenco: boolean;
    /** Prenotazioni da confermare (numero sul selettore), dove vederle tutte e il gesto fatto. */
    conf: number;
    prenotazioniHref: string;
    onPendingChange: () => void;
    /** I numeri delle Comande, per la riga «Adesso» in testata. */
    summary: OrdersSummary;
    onSummary: (summary: OrdersSummary) => void;
    walkinOpen: boolean;
    onWalkinClose: () => void;
    createOpen: boolean;
    onCreateClose: () => void;
};

const ZERO: OrdersSummary = { nuove: 0, pronte: 0, attese: 0 };

/**
 * In servizio della D (copia «Visual Redesign PR 3»): la riga «Adesso», le
 * Comande in tre colonne e accanto la sala, «In sala» (Mappa o Elenco) o «In
 * arrivo». Sotto i 700 px di pagina una parte alla volta, col selettore.
 * «Allarga» dà tutta la larghezza a un riquadro. La parte scelta sta in
 * `?parte=`, la vista della sala nel `?modo=` di sempre.
 */
export function InServizioD({
    tenantId,
    activityId,
    view,
    onViewChange,
    showComande,
    canMappa,
    canElenco,
    conf,
    prenotazioniHref,
    onPendingChange,
    summary,
    onSummary,
    walkinOpen,
    onWalkinClose,
    createOpen,
    onCreateClose
}: Props) {
    const [searchParams, setSearchParams] = useSearchParams();
    const canSala = canMappa || canElenco;
    const available = PARTS.filter(p => (p === "comande" ? showComande : p === "sala" ? canSala : canElenco));
    const [wide, setWide] = useState<"comande" | "destra" | null>(null);
    const asked = readPart(searchParams.get("parte"));
    // Senza una parte scelta si parte dalle Comande; ma con un tavolo o una
    // prenotazione aperti, o con la sala allargata, resta la sala: il pannello
    // del tavolo stringe la pagina e la farebbe sparire sotto i 700 px.
    const inSala = wide === "destra" || DETAIL_PARAMS.some(key => searchParams.has(key));
    const fallback = inSala && available.includes("sala") ? "sala" : available[0];
    const part: InServizioDPart = asked && available.includes(asked) ? asked : (fallback ?? "sala");
    // Accanto alle Comande: la sala, oppure gli arrivi se scelti.
    const right: "sala" | "arrivo" = part === "arrivo" || !canSala ? "arrivo" : "sala";

    const setPart = useCallback(
        (next: InServizioDPart) =>
            setSearchParams(
                prev => {
                    prev.set("parte", next);
                    return prev;
                },
                { replace: true }
            ),
        [setSearchParams]
    );

    const { nuove, attese } = showComande ? summary : ZERO;
    const count = (n: number) => (n > 0 ? ` ${n}` : "");

    const partOptions = available.map(p => ({
        value: p,
        label: p === "comande" ? `Comande${count(nuove)}` : p === "sala" ? `In sala${count(attese)}` : `In arrivo${count(conf)}`
    }));
    const rightOptions = (["sala", "arrivo"] as const)
        .filter(p => available.includes(p))
        .map(p => ({ value: p, label: p === "sala" ? `In sala${count(attese)}` : `In arrivo${count(conf)}` }));
    const viewOptions = [
        ...(canMappa ? [{ value: "mappa" as const, label: "Mappa" }] : []),
        ...(canElenco ? [{ value: "elenco" as const, label: "Elenco" }] : [])
    ];
    const salaView: "mappa" | "elenco" = view === "mappa" && canMappa ? "mappa" : canElenco ? "elenco" : "mappa";

    const wideButton = (which: "comande" | "destra") => (
        <IconButton
            className={styles.wideButton}
            variant="ghost"
            size="sm"
            icon={wide === which ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            aria-label={wide === which ? "Rimpicciolisci" : "Allarga"}
            aria-pressed={wide === which}
            onClick={() => setWide(w => (w === which ? null : which))}
        />
    );

    return (
        <div className={styles.page} data-part={part} data-right={right} data-wide={wide ?? undefined} data-comande={showComande || undefined}>
            {available.length > 1 && (
                <div className={styles.partSwitch}>
                    <SegmentedControl<InServizioDPart> value={part} onChange={setPart} size="sm" label="Parti di In servizio" options={partOptions} />
                </div>
            )}

            <div className={styles.grid}>
                {showComande && (
                    <section className={`${styles.card} ${styles.comande}`} aria-label="Comande">
                        <header className={styles.cardHead}>
                            <h2 className={styles.cardTitle}>Comande</h2>
                            {wideButton("comande")}
                        </header>
                        <div className={styles.cardBody}>
                            <OrdersBoard embedded={{ createOpen, onCreateClose, onSummary }} />
                        </div>
                    </section>
                )}

                {(canSala || canElenco) && (
                    <section className={`${styles.card} ${styles.right}`} aria-label={right === "sala" ? "In sala" : "In arrivo"}>
                        <header className={styles.cardHead}>
                            <h2 className={styles.rightTitle}>{right === "sala" ? "In sala" : "In arrivo"}</h2>
                            {rightOptions.length > 1 && (
                                <div className={styles.rightSwitch}>
                                    <SegmentedControl<"sala" | "arrivo">
                                        value={right}
                                        onChange={setPart}
                                        size="sm"
                                        label="In sala o in arrivo"
                                        options={rightOptions}
                                    />
                                </div>
                            )}
                            <span className={styles.headTail}>
                                {right === "sala" && viewOptions.length > 1 && (
                                    <SegmentedControl<"mappa" | "elenco">
                                        value={salaView}
                                        onChange={onViewChange}
                                        size="sm"
                                        label="Vista della sala"
                                        options={viewOptions}
                                    />
                                )}
                                {showComande && wideButton("destra")}
                            </span>
                        </header>
                        <div className={styles.cardBody}>
                            {right === "sala" && salaView === "mappa" && <TablesLiveView tenantId={tenantId} activityId={activityId} />}
                            {(right === "arrivo" || salaView === "elenco") && (
                                <ServizioElenco
                                    activityId={activityId}
                                    walkinOpen={walkinOpen}
                                    onWalkinClose={onWalkinClose}
                                    part={right === "arrivo" ? "arriving" : "inRoom"}
                                    pendingTotal={conf}
                                    pendingHref={prenotazioniHref}
                                    onPendingChange={onPendingChange}
                                />
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

/**
 * La riga «Adesso» (copia `.now`): una frase coi numeri del momento, in
 * testata accanto ai pulsanti. Sotto i 700 px non c'è: i numeri stanno nel
 * selettore delle parti. Non si legge a voce a ogni cambio (`aria-live="off"`):
 * i numeri cambiano col realtime e col conteggio ogni minuto.
 */
export function AdessoD({ summary, conf }: { summary: OrdersSummary; conf: number }) {
    const { nuove, pronte, attese } = summary;
    const calm = nuove + pronte + attese + conf === 0;
    return (
        <p className={styles.now} role="status" aria-live="off" aria-label="Adesso">
            <span className={styles.nowLabel}>Adesso</span>
            {calm ? (
                <span className={styles.calm}>Niente da fare.</span>
            ) : (
                <>
                    {nuove > 0 && <NowItem tone="new" n={nuove} text={nuove === 1 ? "comanda nuova" : "comande nuove"} />}
                    {pronte > 0 && <NowItem tone="ready" n={pronte} text={pronte === 1 ? "pronta da portare" : "pronte da portare"} />}
                    {attese > 0 && <NowItem tone="wait" n={attese} text={attese === 1 ? "tavolo ti aspetta" : "tavoli ti aspettano"} />}
                    {conf > 0 && (
                        <NowItem tone="booking" n={conf} text={conf === 1 ? "prenotazione da confermare" : "prenotazioni da confermare"} />
                    )}
                </>
            )}
        </p>
    );
}

function NowItem({ tone, n, text }: { tone: "new" | "ready" | "wait" | "booking"; n: number; text: string }) {
    return (
        <span className={styles.nowItem}>
            <i className={styles.dot} data-tone={tone} aria-hidden="true" />
            <span>
                <b>{n}</b> {text}
            </span>
        </span>
    );
}
