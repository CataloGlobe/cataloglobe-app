import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, PanelLeft, PanelLeftClose, Plus, Square, Store, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { ChipGroupMultiple } from "@/components/ui/Chip/ChipGroup";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import {
    CAL_KINDS,
    FSLOT,
    KIND_LABEL,
    axisFor,
    dayCtx,
    dayOfWeek,
    dayParts,
    entriesFromRules,
    fLane,
    fLines,
    hhmm,
    okDate,
    q,
    romeToday,
    shortName,
    specFor,
    why,
    type Axis,
    type CalEntry,
    type CalKind,
    type CalNames,
    type CalSeat,
    type CalWhen,
    type DayNum,
    type LaneSeg,
    type Line,
    type LineSeg
} from "./calendarModel";
import { CalendarioPanel, type ProductInfo } from "./CalendarioPanel";
import type { DropItem } from "./calendarWrites";
import { CalendarioSection, type SectionGroup } from "./CalendarioSection";
import {
    blankDraft,
    cloneDraft,
    draftEntry,
    draftFromEntry,
    draftLabel,
    hoursText,
    isDish,
    listIt,
    mShort,
    elides,
    missing,
    whenKey,
    type Draft,
    type DraftLookups,
    type PickProduct,
    type PickThing
} from "./calendarDraft";
import s from "./CalendarioView.module.scss";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAYS_L = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const KIND_COLOR: Record<CalKind, string> = {
    menu: "var(--cal-menu)",
    style: "var(--cal-style)",
    price: "var(--cal-price)",
    visibility: "var(--cal-visibility)",
    featured: "var(--cal-featured)"
};
// ogni menù e ogni stile ha la sua tinta, sempre la stessa per lo stesso nome
const SHADES: Partial<Record<CalKind, string[]>> = {
    menu: ["#6366f1", "#0369a1", "#7c3aed", "#a855f7", "#c2410c", "#be123c", "#4338ca", "#9333ea"],
    style: ["#0f766e", "#b91c1c", "#0e7490", "#15803d"]
};

export type CalSede = { id: string; name: string };

export type CalendarioViewProps = {
    rules: readonly LayoutRule[];
    names: CalNames;
    /** Le sedi che si possono guardare: una sola dentro la sede. */
    sedi: readonly CalSede[];
    groupIdsByActivity: Readonly<Record<string, readonly string[]>>;
    groupNames: ReadonlyMap<string, string>;
    /** Pulsante a destra nella barra (Aggiungi, al passo 3). */
    actions?: ReactNode;
    /** Listino e categoria dei piatti, per il pannello. */
    products?: ReadonlyMap<string, ProductInfo>;
    formatNames?: ReadonlyMap<string, string>;
    /** Chi può togliere: senza, il pannello è in sola lettura. */
    isWritable?: (rule: LayoutRule) => boolean;
    /** «Modifica completa». */
    onOpenRule?: (rule: LayoutRule) => void;
    /** «Togli»: una regola intera, o un suo piatto o contenuto. */
    onDrop?: (rule: LayoutRule, item?: DropItem) => Promise<void>;
    /** La sezione Aggiungi / Modifica completa: senza, «Modifica completa» va al dettaglio della regola. */
    section?: {
        pickList: readonly PickProduct[];
        catalogs: readonly PickThing[];
        styles: readonly PickThing[];
        featured: readonly PickThing[];
        groups: readonly SectionGroup[];
        /** Dove nasce una cosa nuova: la sede, dentro la sede. */
        defaultWhere: CalEntry["where"];
        /** Lo stile di sistema, se non c'è una regola di base. */
        systemStyleId: string | null;
        canAdd: boolean;
        onSave: (draft: Draft, lookups: DraftLookups) => Promise<void>;
        onDrop: (draft: Draft) => Promise<void>;
        /** Porta alla pagina dove si crea un menù, uno stile, un In evidenza. */
        onGoNew: (kind: CalKind) => void;
    };
};

type RowOpts = { only?: CalKind; list?: readonly CalEntry[]; ax?: Axis; pv?: string };

const KEPT_KEY = "calendario:da-parte";

type Pick = { kind: CalKind; thing: string; date: DayNum; sede: string; from: number };
const NO_PRODUCTS: ReadonlyMap<string, ProductInfo> = new Map();
const NO_FORMATS: ReadonlyMap<string, string> = new Map();

type OpenLane = { kind: CalKind; day: number; sede: string } | null;

const monthLong = (d: DayNum) => MONTHS[dayParts(d).month];
const dayLong = (d: DayNum) => `${DAYS_L[dayOfWeek(d)]} ${dayParts(d).day} ${monthLong(d)} ${dayParts(d).year}`;
const weekLong = (w: DayNum) => {
    const a = dayParts(w), b = dayParts(w + 6);
    return a.month === b.month
        ? `${a.day}–${b.day} ${MONTHS[b.month]} ${b.year}`
        : `${a.day} ${MONTHS[a.month]} – ${b.day} ${MONTHS[b.month]} ${b.year}`;
};
const fH = (g: { from: number; to: number }) => hhmm(g.from) + "–" + hhmm(g.to);

/* ---------- il tooltip leggero: segue il puntatore, si legge subito ---------- */
// prima riga in grassetto, righe che cominciano con ~ in grigio (il perché)
function useTip() {
    const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const onPointerMove = useCallback((ev: RPointerEvent) => {
        const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-tip]");
        setTip(el ? { text: el.dataset.tip ?? "", x: ev.clientX, y: ev.clientY } : null);
    }, []);
    const hide = useCallback(() => setTip(null), []);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !tip) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        let x = tip.x + 14, y = tip.y + 16;
        if (x + w > window.innerWidth - 8) x = tip.x - w - 14;
        if (y + h > window.innerHeight - 8) y = tip.y - h - 12;
        el.style.left = Math.max(8, x) + "px";
        el.style.top = Math.max(8, y) + "px";
    }, [tip]);
    const node = tip ? (
        <div ref={ref} className={s.tip} aria-hidden="true">
            {tip.text.split("\n").map((r, i) =>
                i === 0 ? <b key={i}>{r}</b> : r.startsWith("~") ? <span key={i} className={s.why}>{r.slice(1)}</span> : <span key={i}>{r}</span>
            )}
        </div>
    ) : null;
    return { onPointerMove, hide, node };
}
// per chi legge con lo screen reader: le righe del tooltip in una frase sola
const aria = (tip: string) =>
    tip
        .replace(/(^|\n)~/g, "$1")
        .split("\n")
        .map(r => (/[.!?]$/.test(r) ? r : r + "."))
        .join(" ");

/* ---------- le ore in alto: etichette corte, una ogni 1, 2 o 3 ore ---------- */
function useHourStep(axis: Axis) {
    const ref = useRef<HTMLDivElement>(null);
    const [step, setStep] = useState(1);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const fit = () => {
            const px = el.clientWidth / ((axis.to - axis.from) / 60);
            setStep(px >= 30 ? 1 : px >= 17 ? 2 : 3);
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, [axis.from, axis.to]);
    return { ref, step };
}

export default function CalendarioView({
    rules,
    names,
    sedi,
    groupIdsByActivity,
    groupNames,
    actions,
    products = NO_PRODUCTS,
    formatNames = NO_FORMATS,
    isWritable,
    onOpenRule,
    onDrop,
    section
}: CalendarioViewProps) {
    const [nowDate, setNowDate] = useState(() => new Date());
    useEffect(() => {
        const t = window.setInterval(() => setNowDate(new Date()), 60_000);
        return () => window.clearInterval(t);
    }, []);
    const today = romeToday(nowDate);
    const nowRome = toRomeDateTime(nowDate);
    const nowMin = nowRome.hour * 60 + nowRome.minute;
    const monday = today - dayOfWeek(today);

    const [week, setWeek] = useState<DayNum>(monday);
    const [dDay, setDDay] = useState(dayOfWeek(today));
    const [view, setView] = useState<"day" | "week">("week");
    const [panel, setPanel] = useState(true);
    const [pop, setPop] = useState(false);
    const [monOff, setMonOff] = useState(0);
    const multi = sedi.length > 1;
    const [picked, setPicked] = useState<string[]>(() => sedi.slice(0, 2).map(x => x.id));
    const [open, setOpen] = useState<OpenLane>(() => (sedi[0] ? { kind: "menu", day: dayOfWeek(today), sede: sedi[0].id } : null));
    // la linea toccata apre il pannello piccolo; la colonna del mese si chiude e torna alla chiusura
    const [pick, setPick] = useState<Pick | null>(null);
    const [panelBefore, setPanelBefore] = useState(true);
    const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
    // la sezione Aggiungi / Modifica completa prende il posto del calendario
    const [sec, setSec] = useState<{ back: boolean } | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [kept, setKept] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    const upd = useCallback((fn: (d: Draft) => void) => {
        setDraft(d => {
            if (!d) return d;
            const n = cloneDraft(d);
            fn(n);
            return n;
        });
    }, []);
    const openPick = (p: Pick) => {
        if (!pick) {
            setPanelBefore(panel);
            setPanel(false);
        }
        setPick(p);
        setPop(false);
        setNote(null);
    };
    const closePick = () => {
        if (pick) setPanel(panelBefore);
        setPick(null);
    };
    useEffect(() => {
        if (!pick) return;
        const esc = (ev: KeyboardEvent) => {
            if (ev.key === "Escape" && !pop) {
                setPanel(panelBefore);
                setPick(null);
            }
        };
        document.addEventListener("keydown", esc);
        return () => document.removeEventListener("keydown", esc);
    }, [pick, pop, panelBefore]);

    // le sedi cambiano (dati caricati, permessi): si tengono quelle che ci sono ancora
    useEffect(() => {
        setPicked(prev => {
            const ok = prev.filter(id => sedi.some(x => x.id === id));
            return ok.length ? ok : sedi.slice(0, 2).map(x => x.id);
        });
    }, [sedi]);

    const shown = multi ? sedi.filter(x => picked.includes(x.id)) : sedi.slice(0, 1);
    const entries = useMemo(() => entriesFromRules(rules, names), [rules, names]);
    const axis = useMemo(() => axisFor(entries), [entries]);
    const seatOf = useCallback((id: string): CalSeat => ({ activityId: id, groupIds: groupIdsByActivity[id] ?? [] }), [groupIdsByActivity]);

    const shade = useMemo(() => {
        const m = new Map<string, string>();
        for (const k of ["menu", "style"] as const) {
            const things = [...new Set(entries.filter(e => e.kind === k).map(e => e.thing))].sort((a, b) => a.localeCompare(b, "it"));
            things.forEach((t, i) => m.set(k + ":" + t, SHADES[k]![i % SHADES[k]!.length]));
        }
        return m;
    }, [entries]);
    const colorOf = (k: CalKind, thing: string) => shade.get(k + ":" + thing) ?? KIND_COLOR[k];

    const whereFor = useCallback(
        (e: CalEntry) => {
            const w = e.where;
            if (w.all) return "per tutte le sedi";
            if (w.activityIds.length === 1 && !w.groupIds.length) return "per " + (sedi.find(x => x.id === w.activityIds[0])?.name ?? "una sede");
            if (w.groupIds.length === 1 && !w.activityIds.length) return "per il gruppo «" + (groupNames.get(w.groupIds[0]) ?? "") + "»";
            return "per " + (w.activityIds.length + w.groupIds.length) + " sedi o gruppi";
        },
        [sedi, groupNames]
    );

    // come nel pannello: «Tutte le sedi», «Gruppo «Costa»», «Centro, Porto»
    const whereLong = useCallback(
        (e: CalEntry) => {
            const w = e.where;
            if (w.all) return "Tutte le sedi";
            const parts = [
                ...w.groupIds.map(id => "Gruppo «" + (groupNames.get(id) ?? "") + "»"),
                ...w.activityIds.map(id => sedi.find(x => x.id === id)?.name ?? "un'altra sede")
            ];
            return parts.join(", ");
        },
        [sedi, groupNames]
    );

    const { onPointerMove, hide, node: tipNode } = useTip();
    const hours = useHourStep(axis);

    const selDay = week + dDay;
    const step = (dir: number) => {
        if (view === "day") {
            const d = selDay + dir;
            setWeek(d - dayOfWeek(d));
            setDDay(dayOfWeek(d));
        } else setWeek(w => w + 7 * dir);
        setMonOff(0);
    };
    const goToday = () => {
        setWeek(monday);
        setDDay(dayOfWeek(today));
        setMonOff(0);
    };
    const goDay = (d: DayNum) => {
        setWeek(d - dayOfWeek(d));
        setDDay(dayOfWeek(d));
        setMonOff(0);
        setPop(false);
    };

    // giorni con un'occasione: una regola con un periodo tocca quel giorno in una sede scelta
    const hasOcc = (d: DayNum) => entries.some(e => e.when.period && okDate(e.when, d) && shown.some(x => specFor(e, seatOf(x.id)) !== null));

    /* ---------- tooltip ---------- */
    const segTip = (k: CalKind, g: LaneSeg, seat: CalSeat) => {
        if (k === "featured") return `${KIND_LABEL.featured} · ${fH(g)}\n${g.onda.length} insieme: ${g.onda.join(", ")}.\n~Tocca per aprire la corsia.`;
        let t = `${KIND_LABEL[k]} · ${fH(g)}\nIn onda: ${g.onda.map(q).join(" + ")}.`;
        g.hidden.forEach(x => {
            const l = g.reps.find(e => e.thing === x);
            t += `\nSotto non si vede ${q(x)}.\n~Vince ${q(g.win!.thing)}${l ? ", che " + why(g.win!, l, seat, whereFor) : ""}.`;
        });
        return t + "\n~Tocca per aprire la corsia.";
    };
    const lineTip = (ln: Line, g: LineSeg, seat: CalSeat) => {
        const h = `${ln.thing} · ${fH(g)}`;
        if (g.state === "off") return `${h}\nC'è, ma qui non si vede.\n~Vince ${q(g.by)}${g.self && g.win ? ", che " + why(g.win, g.self, seat, whereFor) : ""}.`;
        if (ln.add) return `${h}\nIn onda, si aggiunge${g.with.length ? " a " + g.with.map(q).join(", ") : ""}.\n~Non toglie niente.`;
        return `${h}\nIn onda.` + (g.covers.length ? `\nPrende il posto di ${g.covers.map(q).join(", ")}.` : "");
    };

    /* ---------- una sede, i suoi giorni ---------- */
    const rows = (sede: CalSede, days: number[], label: (i: number, d: DayNum) => ReactNode, o: RowOpts = {}) => {
        const seat = seatOf(sede.id);
        const list = o.list ?? entries, ax = o.ax ?? axis;
        const X = (m: number) => ((m - ax.from) / (ax.to - ax.from)) * 100;
        const NH = (ax.to - ax.from) / 60;
        return days.map(i => {
            const date = week + i, isToday = date === today;
            const lanes = (o.only ? [o.only] : CAL_KINDS).map(k => ({ k, ctx: dayCtx(list, k, seat, date) }))
                .map(l => ({ ...l, segs: fLane(l.ctx, ax) }))
                .filter(l => o.only || view === "day" || l.segs.length);
            // l'ora di adesso: dopo mezzanotte sta in coda alla serata di ieri
            const nowX = isToday && nowMin >= ax.from ? X(nowMin) : date === today - 1 && nowMin + 1440 < ax.to ? X(nowMin + 1440) : null;
            return (
                <div key={sede.id + ":" + i} className={`${s.fday} ${isToday ? s.today : ""}`}>
                    <div className={s.fdl}>{label(i, date)}</div>
                    <div className={s.flabs}>
                        {lanes.map(l => {
                            const isOpen = !!o.only || (!!open && open.kind === l.k && (view === "day" || open.day === i) && open.sede === sede.id);
                            const lines = isOpen ? fLines(l.ctx, ax) : [];
                            return (
                                <div key={l.k} className={s.fl}>
                                    {o.only ? (
                                        <span className={`${s.flab} ${s.open}`} style={{ "--c": KIND_COLOR[l.k] } as CSSProperties}>
                                            <span className={s.sq} />
                                            <span className={s.flt}>{KIND_LABEL[l.k]}</span>
                                        </span>
                                    ) : (
                                    <button
                                        type="button"
                                        className={`${s.flab} ${isOpen ? s.open : ""}`}
                                        aria-expanded={isOpen}
                                        style={{ "--c": KIND_COLOR[l.k] } as CSSProperties}
                                        onClick={() => setOpen(isOpen ? null : { kind: l.k, day: i, sede: sede.id })}
                                    >
                                        <span className={s.sq} />
                                        <span className={s.flt}>{KIND_LABEL[l.k]}</span>
                                        {isOpen ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
                                    </button>
                                    )}
                                    {lines.map(ln => (
                                        <div key={ln.thing} className={`${s.fname} ${ln.preview ? s.pv : ""}`} style={{ "--c": colorOf(l.k, ln.thing) } as CSSProperties}>
                                            <span>{l.k === "menu" ? shortName(ln.thing) : ln.thing}</span>
                                            {ln.preview && o.pv && <em className={s.pv}>{o.pv}</em>}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                    <div className={s.ftl} style={{ backgroundSize: `calc(100% / ${NH}) 100%` }}>
                        {lanes.map(l => {
                            const isOpen = !!o.only || (!!open && open.kind === l.k && (view === "day" || open.day === i) && open.sede === sede.id);
                            if (!isOpen)
                                return (
                                    <div key={l.k} className={s.flane}>
                                        {l.segs.length ? (
                                            l.segs.map(g => seg(l.k, g))
                                        ) : (
                                            <span className={s.fnone}>{l.k === "price" ? "prezzi di listino" : "niente"}</span>
                                        )}
                                    </div>
                                );
                            const lines = fLines(l.ctx, ax);
                            return (
                                <div key={l.k} className={`${s.flane} ${s.fopen}`}>
                                    <div className={s.fgap} />
                                    {lines.map(ln => (
                                        <div key={ln.thing} className={s.fline}>
                                            {ln.segs.map(g => {
                                                const tip = lineTip(ln, g, seat);
                                                if (o.only)
                                                    return (
                                                        <span
                                                            key={g.from}
                                                            className={`${s.fls} ${g.state === "on" ? s.on : s.off} ${g.pv ? s.pv : ""}`}
                                                            data-tip={tip}
                                                            style={{ "--c": colorOf(l.k, ln.thing), left: X(g.from) + "%", width: X(g.to) - X(g.from) + "%" } as CSSProperties}
                                                        />
                                                    );
                                                return (
                                                    <button
                                                        key={g.from}
                                                        type="button"
                                                        className={`${s.fls} ${g.state === "on" ? s.on : s.off}`}
                                                        data-tip={tip}
                                                        aria-label={aria(tip)}
                                                        aria-pressed={!!pick && pick.kind === l.k && pick.thing === ln.thing && pick.date === date && pick.sede === sede.id && pick.from === g.from}
                                                        onClick={() => openPick({ kind: l.k, thing: ln.thing, date, sede: sede.id, from: g.from })}
                                                        style={{ "--c": colorOf(l.k, ln.thing), left: X(g.from) + "%", width: X(g.to) - X(g.from) + "%" } as CSSProperties}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                        {nowX !== null && <div className={s.now} style={{ left: nowX + "%" }} aria-hidden="true" />}
                    </div>
                </div>
            );

            function seg(k: CalKind, g: LaneSeg) {
                const tip = segTip(k, g, seat);
                const pos = { left: `calc(${X(g.from)}% + 1px)`, width: `calc(${X(g.to) - X(g.from)}% - 2px)` };
                const openIt = () => setOpen({ kind: k, day: i, sede: sede.id });
                if (k === "featured") {
                    const pc = Math.min(56, 12 + g.onda.length * 5);
                    return (
                        <button key={g.from} type="button" className={`${s.fseg} ${s.ev2} ${g.hidden.length ? s.hid : ""}`} data-tip={tip} aria-label={aria(tip)} onClick={openIt}
                            style={{ "--c": KIND_COLOR.featured, ...pos, background: `color-mix(in srgb, var(--c) ${pc}%, var(--surface))` } as CSSProperties}>
                            {g.onda.length}
                        </button>
                    );
                }
                const cols = g.onda.map(n => colorOf(k, n));
                const bg = cols.length > 1
                    ? `linear-gradient(to bottom, ${cols.map((c, j) => `color-mix(in srgb, ${c} 24%, var(--surface)) ${(j / cols.length) * 100}% ${((j + 1) / cols.length) * 100}%`).join(", ")})`
                    : `color-mix(in srgb, ${cols[0]} 18%, var(--surface))`;
                return (
                    <button key={g.from} type="button" className={`${s.fseg} ${g.hidden.length ? s.hid : ""}`} data-tip={tip} aria-label={aria(tip)} onClick={openIt}
                        style={{ "--c": cols[0], ...pos, background: bg } as CSSProperties}>
                        {g.onda.map(n => (k === "menu" ? shortName(n) : n)).join(" + ")}
                    </button>
                );
            }
        });
    };

    const dayLabel = (i: number, date: DayNum) => (
        <>
            <span>{DAYS[i]}</span>
            <b>{dayParts(date).day}</b>
        </>
    );

    let body: ReactNode;
    if (view === "day") body = shown.map(x => rows(x, [dDay], () => <b className={s.gsn}>{x.name}</b>));
    else
        body = shown.map(x => (
            <div key={x.id}>
                {shown.length > 1 && (
                    <div className={s.gsh}>
                        <span className={s.gst}>
                            <Store size={15} aria-hidden />
                            {x.name}
                        </span>
                    </div>
                )}
                {rows(x, [0, 1, 2, 3, 4, 5, 6], dayLabel)}
            </div>
        ));

    const hoursFor = (ax: Axis, st: number) => {
        const out: ReactNode[] = [];
        for (let m = Math.ceil(ax.from / 60) * 60 + 60; m < ax.to; m += 60) {
            const h = (m - ax.from) / 60;
            const hidden = st === 1 ? false : st === 2 ? h % 2 !== 0 : (h - 1) % 3 !== 0;
            out.push(
                <span key={m} hidden={hidden} style={{ left: ((m - ax.from) / (ax.to - ax.from)) * 100 + "%" }}>
                    {(m / 60) % 24}
                </span>
            );
        }
        return out;
    };
    const hoursHead = hoursFor(axis, hours.step);

    const miniMonth = () => {
        const sp = dayParts(selDay);
        const first = Math.round(Date.UTC(sp.year, sp.month + monOff, 1) / 86_400_000);
        const fp = dayParts(first);
        const last = Math.round(Date.UTC(fp.year, fp.month + 1, 0) / 86_400_000);
        const weeks: DayNum[] = [];
        for (let w = first - dayOfWeek(first); w <= last; w += 7) weeks.push(w);
        const ml = MONTHS[fp.month];
        return (
            <div className={s.mm}>
                <div className={s.mmh}>
                    <b>{ml.charAt(0).toUpperCase() + ml.slice(1) + " " + fp.year}</b>
                    <span>
                        <IconButton size="sm" icon={<ChevronUp size={14} />} aria-label="Mese precedente" onClick={() => setMonOff(o => o - 1)} />
                        <IconButton size="sm" icon={<ChevronDown size={14} />} aria-label="Mese successivo" onClick={() => setMonOff(o => o + 1)} />
                    </span>
                </div>
                <div className={`${s.mmw} ${s.mmwd}`}>
                    {["L", "M", "M", "G", "V", "S", "D"].map((x, i) => (
                        <span key={i}>{x}</span>
                    ))}
                </div>
                {weeks.map(w => (
                    <div key={w} className={`${s.mmw} ${view === "week" && w === week ? s.sel : ""}`}>
                        {[0, 1, 2, 3, 4, 5, 6].map(i => {
                            const d = w + i, dp = dayParts(d), occ = hasOcc(d), isSel = view === "day" && d === selDay;
                            const cls = [s.mmd, dp.month !== fp.month ? s.out : "", d === today ? s.isToday : "", isSel ? s.sel : "", occ ? s.dot : ""].join(" ");
                            return (
                                <button key={i} type="button" className={cls} aria-label={dayLong(d) + (occ ? ", c'è un'occasione" : "")} aria-current={isSel ? "date" : undefined} onClick={() => goDay(d)}>
                                    {dp.day}
                                </button>
                            );
                        })}
                    </div>
                ))}
                <p className={s.mmk}>
                    <i />
                    giorni con un'occasione
                </p>
            </div>
        );
    };

    const togglePicked = (id: string) => setPicked(p => (p.includes(id) ? (p.length > 1 ? p.filter(x => x !== id) : p) : sedi.filter(x => x.id === id || p.includes(x.id)).map(x => x.id)));

    /* ---------- la sezione Aggiungi / Modifica completa ---------- */
    const L = useMemo<DraftLookups>(
        () => ({
            products: new Map((section?.pickList ?? []).map(x => [x.id, x])),
            catalogs: names.catalogs,
            styles: names.styles,
            featured: names.featured,
            sedi: new Map(sedi.map(x => [x.id, x.name])),
            groups: groupNames,
            multi
        }),
        [section?.pickList, names, sedi, groupNames, multi]
    );
    // oggi menù e stile vanno in coppia: si parte da quelli della regola di base
    const base = useMemo(
        () =>
            rules.find(r => r.enabled && r.rule_type === "layout" && r.applyToAll && r.time_mode === "always" && !r.start_at && !r.end_at && r.layout?.catalog_id && r.layout?.style_id)
                ?.layout ?? null,
        [rules]
    );
    const pairFor = (k: CalKind) =>
        k === "menu" ? (base?.style_id ?? section?.systemStyleId ?? section?.styles[0]?.id ?? null) : k === "style" ? (base?.catalog_id ?? section?.catalogs[0]?.id ?? null) : null;
    const openAdd = () => {
        setSec({ back: !!pick });
        setDraft(null);
        setNote(null);
    };
    const openFull = (e: CalEntry, only?: string) => {
        setSec({ back: true });
        setDraft(draftFromEntry(e, L, only ?? null));
        setNote(null);
    };
    const closeSec = (saved: boolean) => {
        const back = sec?.back;
        setSec(null);
        setDraft(null);
        if (saved || !back) closePick();
    };
    // «Tieni da parte» sopravvive all'uscita verso Menù, Stili, In evidenza
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(KEPT_KEY);
            if (raw) setKept(JSON.parse(raw) as Draft);
        } catch {
            /* niente da riprendere */
        }
    }, []);
    const keep = (d: Draft | null) => {
        setKept(d);
        try {
            if (d) sessionStorage.setItem(KEPT_KEY, JSON.stringify(d));
            else sessionStorage.removeItem(KEPT_KEY);
        } catch {
            /* resta solo finché la pagina è aperta */
        }
    };
    const saveSec = async (then?: CalKind) => {
        if (!section || !draft) return;
        setBusy(true);
        try {
            await section.onSave(draft, L);
            const pd = draft.when.period;
            if (pd && (pd.from > week + 6 || pd.to < week)) {
                setWeek(pd.from - dayOfWeek(pd.from));
                setDDay(dayOfWeek(pd.from));
            }
            setNote({ text: (draft.mode === "edit" ? "Salvato: " : "Aggiunto al calendario: ") + draftLabel(draft, L) + "." });
            closeSec(true);
            if (then) section.onGoNew(then);
        } catch {
            setNote({ text: "Non siamo riusciti a salvare. Riprova.", error: true });
        } finally {
            setBusy(false);
        }
    };
    const dropSec = async () => {
        if (!section || !draft) return;
        setBusy(true);
        try {
            await section.onDrop(draft);
            setNote({ text: "Tolto dal calendario: " + draftLabel(draft, L) + "." });
            closeSec(true);
        } catch {
            setNote({ text: "Non siamo riusciti a toglierlo. Riprova.", error: true });
        } finally {
            setBusy(false);
        }
    };

    // l'anteprima: il calendario con la bozza dentro
    const pvEntry = useMemo(() => (draft ? draftEntry(draft, L, nowDate.getTime()) : null), [draft, L, nowDate]);
    const pvList = useMemo(() => {
        if (!draft) return null;
        let list: CalEntry[] = entries;
        const r = draft.rule;
        if (r && draft.kind === "featured" && draft.only) list = list.filter(e => e.id !== `${r.id}:featured:${draft.only}`);
        else if (r && !draft.only) list = list.filter(e => !(e.ruleId === r.id && e.kind === draft.kind));
        return pvEntry ? [...list, pvEntry] : list;
    }, [draft, entries, pvEntry]);
    const pvAx = useMemo(() => (pvList ? axisFor(pvList) : axis), [pvList, axis]);
    const pvReach = pvEntry ? shown.filter(x => specFor(pvEntry, seatOf(x.id)) !== null) : shown;
    const pvSedi = pvReach.length ? pvReach : pvEntry ? sedi.filter(x => specFor(pvEntry, seatOf(x.id)) !== null).slice(0, 1) : shown.slice(0, 1);

    // cosa cambia nel calendario, nella settimana che si vede
    const effect = (): string[] => {
        if (!draft || !pvList) return [];
        if (missing(draft, L)) return ["Scegli prima cosa mettere: poi qui vedi dove va in onda."];
        const wk = week === monday ? "Questa settimana" : "Nella settimana del " + mShort(week);
        const groupsOf = new Map<string, string[]>();
        for (const x of pvSedi.length ? pvSedi : shown) {
            const seat = seatOf(x.id), cov = new Set<string>(), by = new Set<string>();
            let mins = 0, off = 0, days = 0;
            for (let i = 0; i < 7; i++) {
                let on = 0;
                for (const l of fLines(dayCtx(pvList, draft.kind, seat, week + i), pvAx).filter(l => l.preview))
                    for (const g of l.segs) {
                        const m = g.to - g.from;
                        if (g.state === "on") {
                            on += m;
                            g.covers.forEach(c => cov.add(c));
                        } else {
                            off += m;
                            if (g.by) by.add(g.by);
                        }
                    }
                if (on) {
                    mins += on;
                    days++;
                }
            }
            const out: string[] = [], pd = draft.when.period;
            if (!mins && !off)
                out.push(`${wk} non c'è${pd && pd.from > week + 6 ? ": comincia " + (elides(pd.from) ? "l'" : "il ") + mShort(pd.from) : pd && pd.to < week ? ": è già finito" : ""}.`);
            else {
                out.push(`${wk} è in onda ${days} ${days === 1 ? "giorno" : "giorni"}, ${hoursText(mins)} in tutto.`);
                if (cov.size) out.push(`Prende il posto di ${listIt([...cov].map(q))} quando si sovrappongono.`);
                if (by.size) out.push(`Per ${hoursText(off)} non si vede: lo copre ${listIt([...by].map(q))}.`);
            }
            const k = out.join("\n");
            groupsOf.set(k, [...(groupsOf.get(k) ?? []), x.name]);
        }
        // le sedi con lo stesso risultato stanno insieme
        return [...groupsOf.entries()].flatMap(([k, ss]) => {
            const r = k.split("\n");
            if (multi) r[0] = "A " + listIt(ss) + ": " + r[0].charAt(0).toLowerCase() + r[0].slice(1);
            return r;
        });
    };

    // le durate che ci sono già, prima quelle dello stesso tipo: al massimo sei
    const durs = (k: CalKind): CalWhen[] => {
        const m = new Map<string, CalWhen>();
        for (const e of [...entries.filter(x => x.kind === k), ...entries]) {
            if (m.size >= 6) break;
            const key = whenKey(e.when);
            if (key === "||" || (e.when.period && e.when.period.to < today) || m.has(key)) continue;
            m.set(key, e.when);
        }
        return [...m.values()].sort((a, b) => (a.period ? 1 : 0) - (b.period ? 1 : 0) || (a.period?.from ?? 0) - (b.period?.from ?? 0));
    };
    const counts = Object.fromEntries(
        CAL_KINDS.map(k => {
            const es = entries.filter(e => e.kind === k && !(e.when.period && e.when.period.to < today));
            const n = isDish(k) ? es.reduce((t, e) => t + (k === "price" ? new Set(e.rule.price_overrides.map(o => o.product_id)).size : e.rule.visibility_overrides.length), 0) : es.length;
            return [k, n];
        })
    ) as Record<CalKind, number>;

    /* ---------- il pannello della linea toccata ---------- */
    let pickView: ReactNode = null;
    if (pick) {
        const seat = seatOf(pick.sede);
        const ctx = dayCtx(entries, pick.kind, seat, pick.date);
        const ln = fLines(ctx, axis).find(l => l.thing === pick.thing);
        const g = ln?.segs.find(x => x.from <= pick.from && pick.from < x.to);
        const entry = g?.self ?? entries.find(e => e.kind === pick.kind && e.thing === pick.thing && specFor(e, seat) !== null);
        if (entry) {
            const paired = entry.kind === "menu" ? "style" : entry.kind === "style" ? "menu" : null;
            const pairedName = paired ? (entries.find(x => x.ruleId === entry.ruleId && x.kind === paired)?.thing ?? null) : null;
            const dp = dayParts(pick.date);
            pickView = (
                <CalendarioPanel
                    key={entry.id + ":" + pick.date + ":" + pick.from}
                    entry={entry}
                    line={ln}
                    seg={g}
                    seat={seat}
                    dateText={`${DAYS_L[dayOfWeek(pick.date)].toLowerCase()} ${dp.day} ${MONTHS[dp.month]}`}
                    sedeName={multi ? (sedi.find(x => x.id === pick.sede)?.name ?? null) : null}
                    color={colorOf(entry.kind, entry.thing)}
                    whereFor={whereFor}
                    whereLong={whereLong}
                    products={products}
                    formatNames={formatNames}
                    pairedName={pairedName}
                    writable={!!onDrop && (isWritable ? isWritable(entry.rule) : false)}
                    onClose={closePick}
                    onFull={only => (section ? openFull(entry, only) : onOpenRule?.(entry.rule))}
                    onDrop={async item => {
                        if (!onDrop) return;
                        try {
                            await onDrop(entry.rule, item);
                            setNote({ text: "Tolto dal calendario." });
                            const left = entry.kind === "price" ? entry.rule.price_overrides.length : entry.kind === "visibility" ? entry.rule.visibility_overrides.length : 1;
                            if (!item || entry.kind === "featured" || left <= 1) closePick();
                        } catch {
                            setNote({ text: "Non siamo riusciti a toglierlo. Riprova.", error: true });
                        }
                    }}
                />
            );
        }
    }

    const label = view === "day" ? dayLong(selDay) : weekLong(week);
    const unit = view === "day" ? "Giorno" : "Settimana";

    // la data in alto apre il calendario del mese: si chiude cliccando fuori o con Esc
    const popRef = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!pop) return;
        const off = (ev: MouseEvent) => {
            if (popRef.current && !popRef.current.contains(ev.target as Node)) setPop(false);
        };
        const esc = (ev: KeyboardEvent) => ev.key === "Escape" && setPop(false);
        document.addEventListener("mousedown", off);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", off);
            document.removeEventListener("keydown", esc);
        };
    }, [pop]);

    const noteNode = note && (
        <p className={`${s.itoast} ${note.error ? s.err : ""}`} role="status">
            {note.error ? <XIcon size={15} aria-hidden /> : <Check size={15} aria-hidden />}
            <span>{note.text}</span>
        </p>
    );

    if (sec && section) {
        const pd = draft?.when.period;
        const away = !!pd && (pd.from > week + 6 || pd.to < week);
        const preview = draft && pvList && (
            <aside className={s.iprev} aria-label="Anteprima">
                <div className={s.iph}>
                    <b>Anteprima · {KIND_LABEL[draft.kind]}</b>
                    <span className={s.iwk}>
                        <IconButton size="sm" icon={<ChevronLeft size={14} />} aria-label="Settimana precedente" onClick={() => setWeek(w => w - 7)} />
                        <span>{weekLong(week)}</span>
                        <IconButton size="sm" icon={<ChevronRight size={14} />} aria-label="Settimana successiva" onClick={() => setWeek(w => w + 7)} />
                    </span>
                </div>
                {away && pd && (
                    <button type="button" className={`${s.chip} ${s.iaway}`} onClick={() => setWeek(pd.from - dayOfWeek(pd.from))}>
                        <Calendar size={13} aria-hidden />
                        Questa settimana non c'è: vai {elides(pd.from) ? "all'" : "al "}
                        {mShort(pd.from)}
                    </button>
                )}
                <div className={s.dcal}>
                    <div className={`${s.fcal} ${s.pcal}`}>
                        <div className={s.fhead}>
                            <div />
                            <div />
                            <div className={s.fhours}>{hoursFor(pvAx, 2)}</div>
                        </div>
                        {pvSedi.map(x => (
                            <div key={x.id}>
                                {multi && (
                                    <div className={s.gsh}>
                                        <span className={s.gst}>
                                            <Store size={15} aria-hidden />
                                            {x.name}
                                        </span>
                                    </div>
                                )}
                                {rows(x, [0, 1, 2, 3, 4, 5, 6], dayLabel, { only: draft.kind, list: pvList, ax: pvAx, pv: draft.mode === "edit" ? "in modifica" : "nuovo" })}
                            </div>
                        ))}
                    </div>
                </div>
                <p className={s.dnote}>
                    Solo la corsia {KIND_LABEL[draft.kind]}, una linea per regola. Col bordo tratteggiato quello che stai {draft.mode === "edit" ? "modificando" : "aggiungendo"}: non è ancora salvato.
                    {multi && pvEntry && !pvReach.length && pvSedi[0] ? ` Nessuna delle sedi scelte nel calendario: si vede ${pvSedi[0].name}.` : ""}
                </p>
            </aside>
        );
        return (
            <div className={`${s.root} ${s.gwrap} ${s.closed}`} onPointerMove={onPointerMove} onPointerLeave={hide}>
                <div className={`${s.gmain} ${s.isecw}`}>
                    <CalendarioSection
                        D={draft}
                        upd={upd}
                        L={L}
                        pickList={section.pickList}
                        catalogs={section.catalogs}
                        styles={section.styles}
                        featured={section.featured}
                        sedi={sedi}
                        groups={section.groups}
                        colorOf={colorOf}
                        kindColor={KIND_COLOR}
                        durs={durs}
                        counts={counts}
                        kept={kept}
                        toast={noteNode}
                        preview={preview}
                        effect={draft ? effect() : []}
                        band={axis}
                        busy={busy}
                        onKind={k => setDraft(blankDraft(k, section.defaultWhere, pairFor(k)))}
                        onRoot={() => setDraft(null)}
                        onResume={() => {
                            if (kept) setDraft({ ...kept, tried: false });
                            keep(null);
                        }}
                        onExit={() => closeSec(false)}
                        onSave={then => void saveSec(then)}
                        onDrop={() => void dropSec()}
                        onKeep={to => {
                            if (draft) keep({ ...draft, tried: false });
                            closeSec(false);
                            section.onGoNew(to);
                        }}
                        onGoNew={to => {
                            closeSec(false);
                            section.onGoNew(to);
                        }}
                    />
                </div>
                {tipNode}
            </div>
        );
    }

    return (
        <div className={`${s.root} ${s.gwrap} ${panel ? "" : s.closed} ${pickView ? s.ion : ""}`} onPointerMove={onPointerMove} onPointerLeave={hide}>
            {panel && (
                <aside className={s.gside} aria-label="Calendario del mese">
                    <div className={s.gch}>
                        <b>Calendario</b>
                        <IconButton size="sm" icon={<PanelLeftClose size={16} />} aria-label="Chiudi la colonna del calendario" aria-expanded onClick={() => setPanel(false)} />
                    </div>
                    {miniMonth()}
                    {multi && (
                        <div className={s.gsl}>
                            <h4>Sedi</h4>
                            {sedi.map(x => {
                                const on = picked.includes(x.id);
                                return (
                                    <button key={x.id} type="button" className={s.gsc} role="checkbox" aria-checked={on} onClick={() => togglePicked(x.id)}>
                                        <span className={s.box}>{on && <Check size={12} aria-hidden />}</span>
                                        {x.name}
                                    </button>
                                );
                            })}
                            <p>{view === "day" ? "In Giorno le sedi scelte stanno una sotto l'altra." : "In Settimana le settimane delle sedi scelte stanno una sotto l'altra."}</p>
                        </div>
                    )}
                </aside>
            )}
            <div className={s.gmain}>
                <div className={s.dbar}>
                    <div className={s.l}>
                        {!panel && <IconButton icon={<PanelLeft size={16} />} aria-label="Apri la colonna del calendario" aria-expanded={false} onClick={() => setPanel(true)} />}
                        <Button variant="secondary" size="sm" onClick={goToday}>
                            Oggi
                        </Button>
                        <IconButton icon={<ChevronLeft size={16} />} aria-label={`${unit} precedente`} onClick={() => step(-1)} />
                        <IconButton icon={<ChevronRight size={16} />} aria-label={`${unit} successiv${view === "day" ? "o" : "a"}`} onClick={() => step(1)} />
                        <span className={s.gdate} ref={popRef}>
                            <button type="button" className={s.glab} aria-expanded={pop} onClick={() => setPop(p => !p)}>
                                {label}
                                <ChevronDown size={14} aria-hidden />
                            </button>
                            {pop && <div className={s.gpop}>{miniMonth()}</div>}
                        </span>
                    </div>
                    <div className={s.r}>
                        <SegmentedControl
                            size="sm"
                            value={view}
                            onChange={v => setView(v)}
                            options={[
                                { value: "day", label: "Giorno", icon: <Square size={14} aria-hidden /> },
                                { value: "week", label: "Settimana", icon: <Columns3 size={14} aria-hidden /> }
                            ]}
                        />
                        {actions}
                        {section?.canAdd && (
                            <Button variant="primary" size="sm" leftIcon={<Plus size={16} />} onClick={openAdd}>
                                Aggiungi
                            </Button>
                        )}
                    </div>
                </div>
                {!panel && multi && (
                    <ChipGroupMultiple
                        ariaLabel="Sedi"
                        label="Sedi"
                        options={sedi.map(x => ({ value: x.id, label: x.name }))}
                        value={picked}
                        onChange={v => v.length && setPicked(sedi.filter(x => v.includes(x.id)).map(x => x.id))}
                    />
                )}
                {noteNode}
                <div className={s.flegend}>
                    <span>
                        <i className={`${s.lg} ${s.on}`} />
                        in onda
                    </span>
                    <span>
                        <i className={`${s.lg} ${s.off}`} />
                        c'è, ma lo copre un altro
                    </span>
                    <span>
                        <i className={`${s.lg} ${s.hid}`} />
                        sotto c'è qualcosa che non si vede
                    </span>
                </div>
                <div className={s.dcal}>
                    <div className={`${s.fcal} ${pickView ? s.slim : ""}`}>
                        <div className={s.fhead}>
                            <div />
                            <div />
                            <div className={s.fhours} ref={hours.ref}>
                                {hoursHead}
                            </div>
                        </div>
                        {body}
                    </div>
                </div>
                {!rules.length && <p className={s.dnote}>Non c'è ancora niente in calendario.</p>}
                <p className={s.dnote}>Ogni {FSLOT} minuti: apri una corsia per vedere una linea per regola.</p>
            </div>
            {pickView}
            {tipNode}
        </div>
    );
}
