import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    ArrowRight,
    BellRing,
    CalendarCheck,
    ChevronDown,
    Clock3,
    ConciergeBell,
    QrCode as QrCodeIcon,
    Soup,
    Star,
    Check
} from "lucide-react";
import type { UserPermissions } from "@/lib/permissions";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { canSeeServizio } from "@/utils/servizioModes";
import type { TenantCapabilities } from "@/services/supabase/overviewStats";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { calculateDelta } from "@/pages/Dashboard/Analytics/utils/periodComparison";
import { useHomeTodo, type HomeTodoSede } from "./useHomeTodo";
import { useHomeWeek, type HomeWeekPair } from "./useHomeWeek";
import styles from "./HomeD.module.scss";

/** Copia «Visual Redesign PR 3», Home (D202, D203): una riga che dice cosa c'è
 *  da fare oggi, a sinistra «Cosa vuoi creare?» e sotto «Com'è andata» e la
 *  vetrina, a destra «Da fare». Solo con la D e con le basi complete. */

export type HomeCreateOption = { key: string; icon: ReactNode; title: string; text: string; to: string };

type Props = {
    tenantId: string;
    permissions: UserPermissions;
    sedi: { id: string; name: string }[] | null;
    sediError: boolean;
    /** Sedi online che non mostrano nessun menù (stato già letto dalla vetrina). */
    menuNone: { id: string; name: string }[];
    createOptions: HomeCreateOption[];
    capabilities: TenantCapabilities | null;
    catalogLower: string;
    vetrina: ReactNode;
};

type TodoItem = {
    key: string;
    icon: ReactNode;
    tone: "brand" | "wait" | "blue" | "violet";
    title: string;
    sub: string;
    sede?: string;
    button: string;
    to: string;
    urgent?: boolean;
};

const TODO_MAX = 5;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

function todayIso(offsetDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function whenLabel(date: string, time: string): string {
    const day =
        date === todayIso()
            ? "oggi"
            : date === todayIso(1)
              ? "domani"
              : new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
    return `${day} alle ${time.slice(0, 5)}`;
}

function todoFor(
    sede: HomeTodoSede,
    seesServizio: boolean,
    b: string,
    catalogLower: string,
    showSede: boolean,
    menuNone: boolean
): TodoItem[] {
    const s = `${b}/locations/${sede.id}`;
    const tag = showSede ? sede.name : undefined;
    const items: TodoItem[] = [];
    if (sede.pending.length > 0) {
        const first = sede.pending[0];
        const others = sede.pending.length - 1;
        items.push({
            key: `pren-${sede.id}`,
            icon: <CalendarCheck />,
            tone: "blue",
            title: `${plural(sede.pending.length, "Una prenotazione", "prenotazioni")} da confermare`,
            sub:
                `${first.customer_name}, ${whenLabel(first.reservation_date, first.reservation_time)} · ` +
                `${plural(first.party_size, "una persona", "persone")}` +
                (others === 1 ? " e un'altra" : others > 1 ? ` e altre ${others}` : ""),
            sede: tag,
            button: "Conferma",
            to: `${s}/prenotazioni`,
            urgent: true
        });
    }
    if (sede.newOrders > 0 || sede.callingTables > 0) {
        const parts = [
            sede.newOrders > 0 ? plural(sede.newOrders, "una comanda nuova", "comande nuove") : "",
            sede.callingTables > 0 ? plural(sede.callingTables, "un tavolo che chiama", "tavoli che chiamano") : ""
        ].filter(Boolean);
        const title = parts.join(" e ");
        items.push({
            key: `sala-${sede.id}`,
            icon: <BellRing />,
            tone: "wait",
            title: title.charAt(0).toUpperCase() + title.slice(1),
            sub: "In sala adesso",
            sede: tag,
            // Chi ha le comande ma non vede In servizio va sulle Comande della sede.
            button: seesServizio ? "Vai al servizio" : "Vai alle comande",
            to: seesServizio ? `${s}/servizio` : `${s}/comande`,
            urgent: true
        });
    }
    if (menuNone) {
        items.push({
            key: `menu-${sede.id}`,
            icon: <QrCodeIcon />,
            tone: "wait",
            title: `${sede.name} non mostra nessun ${catalogLower}`,
            sub: "Chi inquadra il QR trova la pagina vuota",
            sede: tag,
            button: "Risolvi",
            to: `${b}/scheduling?vista=calendario`,
            urgent: true
        });
    }
    if (sede.oldOrders > 0) {
        items.push({
            key: `old-${sede.id}`,
            icon: <Clock3 />,
            tone: "brand",
            title: `${plural(sede.oldOrders, "Una comanda rimasta aperta", "comande rimaste aperte")}`,
            sub: "Da un servizio precedente: non sono state chiuse",
            sede: tag,
            button: "Chiudile",
            to: `${s}/servizio?parte=comande`
        });
    }
    if (sede.unavailable > 0) {
        items.push({
            key: `dish-${sede.id}`,
            icon: <Soup />,
            tone: "brand",
            title: `${plural(sede.unavailable, "Un prodotto tolto", "prodotti tolti")} dal ${catalogLower}`,
            sub: "Non disponibili adesso in questa sede",
            sede: tag,
            button: "Controlla",
            to: `${s}/cosa-vedono`
        });
    }
    if (sede.lowReviews > 0) {
        items.push({
            key: `rev-${sede.id}`,
            icon: <Star />,
            tone: "violet",
            title: `${plural(sede.lowReviews, "Una recensione bassa", "recensioni basse")} negli ultimi 7 giorni`,
            sub: "Restano a voi: non vanno su Google",
            sede: tag,
            button: "Vedi quali",
            to: `${s}/recensioni?filtro=basse&period=7d`
        });
    }
    return items;
}

function Delta({ pair, points }: { pair: { now: number; before: number }; points?: boolean }) {
    const value = points ? pair.now - pair.before : calculateDelta(pair.now, pair.before);
    if (value == null || !Number.isFinite(value)) return <em className={styles.dl}>&nbsp;</em>;
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const abs = Math.abs(value);
    const text = points ? abs.toFixed(1).replace(".", ",") : `${Math.round(abs)}%`;
    return (
        <em className={`${styles.dl} ${value > 0 ? styles.up : value < 0 ? styles.down : ""}`}>
            {sign}
            {text}
        </em>
    );
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("it-IT");

export function HomeD({
    tenantId,
    permissions,
    sedi,
    sediError,
    menuNone,
    createOptions,
    capabilities,
    catalogLower,
    vetrina
}: Props) {
    const navigate = useNavigate();
    const { hasFeature } = usePlanFeatures();
    const [all, setAll] = useState(false);
    const b = `/business/${tenantId}`;

    const todo = useHomeTodo(tenantId, sedi, permissions, sediError);

    const seeAnalytics = canDoOnAnyActivity(permissions, "analytics.read");
    const show = {
        visits: seeAnalytics,
        revenue: seeAnalytics && hasFeature("table_ordering"),
        covers: seeAnalytics && hasFeature("table_reservation"),
        rating: canDoOnAnyActivity(permissions, "reviews.read")
    };
    const anyWeek = show.visits || show.revenue || show.covers || show.rating;
    const week = useHomeWeek(tenantId, anyWeek, show);

    const many = (sedi?.length ?? 0) > 1;
    const noneIds = new Set(menuNone.map(m => m.id));
    const items =
        todo.status === "ready"
            ? todo.sedi
                  .flatMap(sede => todoFor(sede, canSeeServizio(permissions, sede.id), b, catalogLower, many, noneIds.has(sede.id)))
                  // Prima le urgenti, l'ordine di ogni gruppo resta.
                  .sort((x, y) => Number(!!y.urgent) - Number(!!x.urgent))
            : [];
    const n = items.length;
    const cut = n > TODO_MAX + 1 && !all;
    const visible = cut ? items.slice(0, TODO_MAX) : items;
    const urgent = items.some(i => i.urgent);
    const partial = todo.status === "ready" && todo.partial;

    // «Apri il servizio»: la prima sede dove chi guarda vede In servizio.
    const servizioSede = sedi?.find(s => canSeeServizio(permissions, s.id));

    const count = n === 1 ? "una cosa" : `${n} cose`;
    const line =
        todo.status !== "ready" || !sedi || (partial && n === 0) ? null : (
            <>
                {sedi.length === 1 ? `Oggi a ${sedi[0].name}: ` : `Oggi in ${sedi.length} sedi: `}
                {n > 0 ? (
                    <>
                        <b className={urgent ? styles.hot : undefined}>{count}</b> da fare.
                    </>
                ) : (
                    <>
                        <b>niente</b> da fare.
                    </>
                )}
            </>
        );

    // «Da provare» sulle cose che si creano ma non sono ancora accese.
    const tryKeys = new Set<string>();
    if (capabilities) {
        if (!capabilities.featured.active) tryKeys.add("evidenza");
        if (!capabilities.stories.active) tryKeys.add("storia");
    }
    const already = capabilities
        ? [
              capabilities.ordering.active && "Comande",
              capabilities.reservations.active && "Prenotazioni",
              capabilities.reviews.active && "Recensioni",
              capabilities.team.active && "Team",
              capabilities.languages.active && "Lingue"
          ].filter((x): x is string => !!x)
        : [];
    const alreadyText =
        already.length > 1 ? `${already.slice(0, -1).join(", ")} e ${already[already.length - 1]}` : already[0];

    const makeCard =
        createOptions.length > 0 ? (
            <Card
                title="Cosa vuoi creare?"
                className={`${styles.card} ${styles.make}`}
                actions={<span className={styles.hint}>ogni voce ti accompagna passo per passo</span>}
            >
                <ul className={styles.mks}>
                    {createOptions.map((option, i) => {
                        const tryIt = tryKeys.has(option.key);
                        return (
                            <li key={option.key} style={{ "--i": i } as React.CSSProperties}>
                                <Link to={option.to} className={styles.mk} data-kind={option.key}>
                                    {tryIt && <i className={styles.tag}>Da provare</i>}
                                    <span className={styles.mkIc} aria-hidden="true">
                                        {option.icon}
                                    </span>
                                    <span>
                                        <b>{option.title}</b>
                                        <small>{option.text}</small>
                                    </span>
                                    <span className={styles.go}>
                                        {tryIt ? "Prova" : "Crea"} <ArrowRight aria-hidden="true" />
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
                {alreadyText && <p className={styles.foot}>Già accesi: {alreadyText}.</p>}
            </Card>
        ) : null;

    const tile = (key: string, label: string, to: string, i: number, body: ReactNode) => (
        <Link key={key} to={to} className={styles.t} style={{ "--i": i } as React.CSSProperties}>
            <span>{label}</span>
            {body}
        </Link>
    );
    const pairBody = (pair: HomeWeekPair, fmt: (n: number) => string) =>
        pair ? (
            <>
                <b>{fmt(pair.now)}</b>
                <Delta pair={pair} />
            </>
        ) : (
            <b>—</b>
        );
    const analytics = `${b}/analytics?period=7d`;
    let weekCard: ReactNode = null;
    if (anyWeek) {
        const tiles: ReactNode[] = [];
        if (week.status === "loading") {
            const k = [show.visits, show.revenue, show.covers, show.rating].filter(Boolean).length;
            for (let i = 0; i < k; i++) tiles.push(<Skeleton key={i} height="78px" radius="20px" />);
        } else {
            const w = week.week;
            if (show.visits) tiles.push(tile("v", "Visite alla pagina", analytics, tiles.length, pairBody(w.visits, fmtInt)));
            if (show.revenue)
                tiles.push(tile("r", "Incasso al tavolo", analytics, tiles.length, pairBody(w.revenue, x => `${fmtInt(x)} €`)));
            if (show.covers) tiles.push(tile("c", "Coperti", analytics, tiles.length, pairBody(w.covers, fmtInt)));
            if (show.rating)
                tiles.push(
                    tile(
                        "s",
                        "Voto medio",
                        `${b}/reviews?period=7d`,
                        tiles.length,
                        w.rating && w.rating.total > 0 ? (
                            <>
                                <b>
                                    {w.rating.now.toFixed(1).replace(".", ",")} <span aria-hidden="true">★</span>
                                    <span className={styles.sr}>stelle</span>
                                </b>
                                {w.rating.beforeTotal > 0 ? (
                                    <Delta pair={w.rating} points />
                                ) : (
                                    <em className={styles.dl}>&nbsp;</em>
                                )}
                            </>
                        ) : (
                            <b>—</b>
                        )
                    )
                );
        }
        weekCard = (
            <Card
                title="Com'è andata"
                className={styles.card}
                actions={<span className={styles.hint}>ultimi 7 giorni</span>}
            >
                <div className={styles.wk}>{tiles}</div>
                <p className={styles.foot}>Rispetto alla settimana prima. Tocca un numero per vederlo in Andamento.</p>
            </Card>
        );
    }

    let todoBody: ReactNode;
    if (todo.status === "loading") {
        todoBody = (
            <div className={styles.doLoading}>
                <Skeleton height="44px" />
                <Skeleton height="44px" />
                <Skeleton height="44px" />
            </div>
        );
    } else if (todo.status === "error") {
        todoBody = <p className={styles.foot}>Non riusciamo a leggere cosa c'è da fare.</p>;
    } else if (n === 0 && partial) {
        todoBody = <p className={styles.foot}>Alcune letture non sono riuscite: riprova tra poco o guarda nelle sezioni.</p>;
    } else if (n === 0) {
        todoBody = (
            <div className={styles.ok}>
                <span className={`${styles.ic} ${styles.icOk}`} aria-hidden="true">
                    <Check />
                </span>
                <b>Tutto a posto</b>
                <span>Quando arriva qualcosa da fare, da qualsiasi sezione, lo trovi qui.</span>
            </div>
        );
    } else {
        todoBody = (
            <>
                <ul className={styles.do}>
                    {visible.map((item, i) => (
                        <li key={item.key} style={{ "--i": i } as React.CSSProperties}>
                            <span className={`${styles.ic} ${styles[`ic_${item.tone}`]}`} aria-hidden="true">
                                {item.icon}
                            </span>
                            <span className={styles.doText}>
                                <b>{item.title}</b>
                                <small>
                                    {item.sede && <span className={styles.sdt}>{item.sede}</span>}
                                    {item.sub}
                                </small>
                            </span>
                            <Button
                                size="sm"
                                variant={item.urgent && i === 0 ? "primary" : "secondary"}
                                onClick={() => navigate(item.to)}
                            >
                                {item.button}
                            </Button>
                        </li>
                    ))}
                </ul>
                {n > TODO_MAX + 1 && (
                    <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(v => !v)}>
                        {all ? "Mostra meno" : `Altre ${n - TODO_MAX}`}
                        <ChevronDown aria-hidden="true" />
                    </button>
                )}
            </>
        );
    }

    const todoCard = (
        <Card
            title="Da fare"
            className={`${styles.card} ${styles.todo}`}
            actions={
                todo.status === "ready" ? (
                    <span className={`${styles.n} ${n === 0 ? styles.nZero : ""}`} aria-label={`${n} da fare`}>
                        {n}
                    </span>
                ) : undefined
            }
        >
            {todoBody}
        </Card>
    );

    return (
        <div className={styles.home}>
            <div className={styles.cmd}>
                <p className={styles.answer} aria-live="off">
                    {line ?? (todo.status === "loading" ? <Skeleton height="30px" width="320px" /> : null)}
                </p>
                {servizioSede && (
                    <Button
                        variant="primary"
                        leftIcon={<ConciergeBell size={18} />}
                        onClick={() => navigate(`${b}/locations/${servizioSede.id}/servizio`)}
                    >
                        Apri il servizio
                    </Button>
                )}
            </div>
            <div className={styles.hm}>
                <div className={styles.left}>
                    {makeCard}
                    {(weekCard || vetrina) && (
                        <div className={`${styles.l2} ${weekCard ? "" : styles.l2One}`}>
                            {weekCard}
                            {vetrina}
                        </div>
                    )}
                </div>
                <div className={styles.col}>{todoCard}</div>
            </div>
        </div>
    );
}

