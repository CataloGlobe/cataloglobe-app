import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, Layers, PanelLeft, PanelLeftClose, Plus, Square, Store, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Select } from "@/components/ui/Select/Select";
import type { LayoutRule } from "@/services/supabase/layoutScheduling";
import { NEW_MODEL } from "./calendarFlags";
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
    offLines, thingIdOf, voceOf,
    fLane,
    fLines,
    hhmm,
    okDate,
    q,
    romeToday,
    shortName,
    specFor,
    tie,
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
import { type PannelloGruppo, type SedeScelta } from "@/components/ui/SediPannello/SediPannello";
import { useTenantId } from "@/context/useTenantId";
import { useConfrontoQui, useSediVista } from "@/hooks/useSediVista";
import { confrontoGiorno, maggioranza, programma, type Diversi, type Pezzo, type Programma } from "./calendarConfronto";
import {
    blankDraft,
    cloneDraft,
    draftEntries,
    mainWhen,
    draftPairEntry,
    pairCovers,
    draftFromEntry,
    draftLabel,
    hoursText,
    isDish,
    listIt,
    mShort,
    elides,
    missing,
    whenKey,
    NO_IMPATTO,
    quandoScontro,
    type Draft,
    type Impatto,
    type Scontro,
    type SedeEff,
    type DraftLookups,
    type PickProduct,
    type PickThing,
    readAside,
    writeAside
} from "./calendarDraft";
import s from "./CalendarioView.module.scss";
import { LOOK_D } from "@/styles/lookD";
import { Lead } from "@/pages/Dashboard/Vetrina/VetrinaHead";
import { calLead, inOndaOra } from "./calendarLead";
import { CalendarioAgenda, type AgendaItem } from "./CalendarioAgenda";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PartialSaveError } from "./calendarSave";
import { lastBaseMenu } from "./baseRule";

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

// D213: nella D lo stile prende il suo colore principale; se è chiaro si scurisce (×0,62),
// così la corsia si legge anche su un colore pastello.
function deepen(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const c = [0, 8, 16].map(sh => (parseInt(m[1], 16) >> (16 - sh)) & 255);
    if ((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 < 0.45) return "#" + m[1];
    return "#" + c.map(v => Math.round(v * 0.62).toString(16).padStart(2, "0")).join("");
}

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
    /** «Spegni» e «Metti in onda»: la regola resta, spenta o accesa. */
    onEnable?: (rule: LayoutRule, on: boolean) => Promise<void>;
    /** La sezione Aggiungi / Modifica completa: senza, «Modifica completa» va al dettaglio della regola. */
    /**
     * Nella D, «Aggiungi» delle Regole apre qui «Cosa vuoi mettere in calendario?» con la
     * briciola «Regole › Aggiungi»: uscendo si torna alle Regole con questa.
     */
    addFromRules?: () => void;
    /** Solo l'anteprima della settimana con questa bozza dentro (i tunnel di creazione): niente calendario intorno. */
    anteprima?: {
        draft: Draft;
        pickList?: readonly PickProduct[];
        /** Le righe «Cosa cambia nel calendario», a ogni cambio. */
        onEffect?: (imp: Impatto) => void;
        /** Con più sedi: quella che si guarda, e come cambiarla. */
        sede?: string | null;
        onSede?: (id: string) => void;
    };
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
        /** `done`: le parti già salvate di questa bozza, da non rifare se si riprova. */
        onSave: (draft: Draft, lookups: DraftLookups, done: Set<string>) => Promise<void>;
        onDrop: (draft: Draft) => Promise<void>;
        /** Porta alla pagina dove si crea un menù, uno stile, un In evidenza. */
        onGoNew: (kind: CalKind) => void;
        /** Il dove e il quando di menù, stile e in evidenza si scelgono nel tunnel: chi può, per tipo. */
        canTunnel?: (kind: CalKind) => boolean;
        onTunnel?: (kind: CalKind, id: string, add: boolean) => void;
    };
};

type RowOpts = { only?: CalKind; list?: readonly CalEntry[]; ax?: Axis; pv?: string };

type Pick = { kind: CalKind; thing: string; date: DayNum; sede: string; from: number; /** La voce spenta toccata. */ off?: string };
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
// i giorni della settimana (0 = la prima): «Tutti i giorni», «Lun–Ven, Dom»
const dayRuns = (ds: number[]) => {
    if (ds.length === 7) return "Tutti i giorni";
    const runs: [number, number][] = [];
    for (const d of ds) {
        const l = runs[runs.length - 1];
        if (l && l[1] === d - 1) l[1] = d;
        else runs.push([d, d]);
    }
    return runs.map(([a, b]) => (a === b ? DAYS[a] : DAYS[a] + "–" + DAYS[b])).join(", ");
};

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
            // nella D, nel riquadro stretto dei tunnel, le ore ogni 4 (v55)
            setStep(px >= 30 ? 1 : px >= 17 ? 2 : px >= 12 || !LOOK_D ? 3 : 4);
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
    onEnable,
    section,
    addFromRules,
    anteprima
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
    // D, al telefono: Agenda (d'apertura) o la Settimana stretta (copia `CAL.ph`)
    const phone = useMediaQuery("(max-width: 640px)") && LOOK_D;
    const [ph, setPh] = useState<"agenda" | "week">("agenda");
    const agendaOn = phone && ph === "agenda" && !anteprima;
    const [pop, setPop] = useState(false);
    const [monOff, setMonOff] = useState(0);
    const multi = sedi.length > 1;
    const [open, setOpen] = useState<OpenLane>(() => (sedi[0] ? { kind: "menu", day: dayOfWeek(today), sede: sedi[0].id } : null));
    // la linea toccata apre il pannello piccolo; la colonna del mese si chiude e torna alla chiusura
    const [pick, setPick] = useState<Pick | null>(null);
    const [panelBefore, setPanelBefore] = useState(true);
    const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
    // la sezione Aggiungi / Modifica completa prende il posto del calendario
    const [sec, setSec] = useState<{ back: boolean; rules?: boolean } | null>(null);
    const [ownDraft, setDraft] = useState<Draft | null>(null);
    const draft = anteprima ? anteprima.draft : ownDraft;
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

    // i gruppi del pannello delle sedi: quelli con almeno una sede che si guarda; quello con tutte
    // (il gruppo di sistema) è già «Tutte le sedi»
    const seatGroups = useMemo<PannelloGruppo[]>(
        () =>
            [...groupNames]
                .map(([id, name]) => ({ id, name, sedeIds: sedi.filter(x => groupIdsByActivity[x.id]?.includes(id)).map(x => x.id) }))
                .filter(g => g.sedeIds.length > 0 && (sedi.length < 2 || g.sedeIds.length < sedi.length)),
        [groupNames, groupIdsByActivity, sedi]
    );
    // cosa si guarda (D150 E, D152): una sede, tutte o un gruppo, e con chi si confronta; lo stato è comune
    // alle pagine (in alto a destra con la navigazione), senza scelta si guarda la prima sede
    const tenantId = useTenantId();
    const vista = useSediVista(tenantId);
    // «Sede» e «Confronta con» stanno in alto a destra (D152): la pagina passa lì
    // i suoi gruppi e la nota «diversa · N g», che legge sempre l'ultimo calcolo.
    const tagRef = useRef<(id: string) => ReactNode>(() => null);
    const confrontoTag = useCallback((id: string) => tagRef.current(id), []);
    useConfrontoQui(multi, { gruppi: seatGroups, tag: confrontoTag });
    const scope = useMemo<SedeScelta>(() => {
        const v = vista.sede;
        if (multi && v?.kind === "all") return v;
        if (multi && v?.kind === "gruppo" && seatGroups.some(g => g.id === v.id)) return v;
        if (v?.kind === "sede" && sedi.some(x => x.id === v.id)) return v;
        return { kind: "sede", id: sedi[0]?.id ?? "" };
    }, [vista.sede, multi, seatGroups, sedi]);
    const focus = scope.kind === "sede" ? (sedi.find(x => x.id === scope.id) ?? null) : null;
    const scopeSedi = useMemo(() => {
        if (scope.kind === "all") return sedi;
        if (scope.kind === "gruppo") {
            const ids = seatGroups.find(g => g.id === scope.id)?.sedeIds ?? [];
            return sedi.filter(x => ids.includes(x.id));
        }
        return [];
    }, [scope, sedi, seatGroups]);
    const cmp = focus && multi ? sedi.filter(x => x.id !== focus.id && vista.confronta.has(x.id)) : [];
    // le sedi che si vedono: quella guardata e quelle a confronto, o tutte quelle scelte
    const shown = focus ? [focus, ...cmp] : scopeSedi;
    const entries = useMemo(() => entriesFromRules(rules, names), [rules, names]);
    // spente: «pronto, non in onda». Solo nel calendario vero, non nell'anteprima dei tunnel
    const spente = useMemo(() => (anteprima ? [] : entriesFromRules(rules, names, true)), [rules, names, anteprima]);
    const axis = useMemo(() => axisFor(entries), [entries]);
    const seatOf = useCallback((id: string): CalSeat => ({ activityId: id, groupIds: groupIdsByActivity[id] ?? [] }), [groupIdsByActivity]);
    // D: la frase in cima, chi vedono i clienti adesso (copia `cNowLine`)
    const leadD = useMemo(() => {
        if (!LOOK_D || anteprima || !sedi.length) return null;
        const day = (d: DayNum): readonly Pezzo[] => {
            if (focus || !multi) return programma(entries, seatOf((focus ?? sedi[0]).id), d, axis).pezzi;
            return maggioranza(scopeSedi.map(x => [x.id, programma(entries, seatOf(x.id), d, axis)] as const))?.base.pezzi ?? [];
        };
        const dove = !multi ? "" : focus ? `a ${focus.name}` : ", nella maggior parte delle sedi,";
        return calLead(inOndaOra(day(today), day(today - 1), nowMin), dove);
    }, [anteprima, sedi, focus, multi, entries, seatOf, axis, scopeSedi, today, nowMin]);

    const shade = useMemo(() => {
        const m = new Map<string, string>();
        for (const k of ["menu", "style"] as const) {
            const things = [...new Set(entries.filter(e => e.kind === k).map(e => e.thing))].sort((a, b) => a.localeCompare(b, "it"));
            things.forEach((t, i) => {
                const own = LOOK_D && k === "style" ? names.styleColors?.get(t) : undefined;
                m.set(k + ":" + t, own ? deepen(own) : SHADES[k]![i % SHADES[k]!.length]);
            });
        }
        return m;
    }, [entries, names]);
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
    // il giorno toccato nel mini mese: in Settimana resta segnato finché si cambia settimana (v40, v43)
    const [mmPick, setMmPick] = useState<DayNum | null>(null);
    const step = (dir: number) => {
        setMmPick(null);
        if (view === "day") {
            const d = selDay + dir;
            setWeek(d - dayOfWeek(d));
            setDDay(dayOfWeek(d));
        } else setWeek(w => w + 7 * dir);
        setMonOff(0);
    };
    // in Settimana si scende (o si sale) fino al giorno: all'apertura su oggi, poi «Oggi» e il calendarietto
    const [goTo, setGoTo] = useState<{ d: DayNum; flash: boolean; n: number }>(() => ({ d: today, flash: false, n: 0 }));
    const jump = (d: DayNum) => setGoTo(g => ({ d, flash: true, n: g.n + 1 }));
    const calRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const cal = calRef.current, wrap = wrapRef.current;
        const row = cal?.querySelector<HTMLElement>(`[data-day="${goTo.d}"]`);
        if (!cal || !wrap || !row) return;
        const smooth = goTo.n > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // si scorre solo se il giorno non si vede tutto, e il meno possibile: la testata resta finché si può
        const v = viewBox(cal, wrap), b = row.getBoundingClientRect();
        const dy = b.top < v.top ? b.top - v.top - 4 : b.bottom > v.bottom ? Math.min(b.bottom - v.bottom + 8, b.top - v.top - 4) : 0;
        if (Math.abs(dy) > 2) v.scroller.scrollBy({ top: dy, behavior: smooth ? "smooth" : "auto" });
        if (!goTo.flash) return;
        row.classList.add(s.flash);
        const t = window.setTimeout(() => row.classList.remove(s.flash), 900);
        return () => {
            window.clearTimeout(t);
            row.classList.remove(s.flash);
        };
        // si salta quando cambia il salto: la settimana nuova è già disegnata
    }, [goTo]);
    // oggi fuori dallo schermo: il bottone «Oggi» in fondo (o in cima) al calendario
    const [todayOut, setTodayOut] = useState<{ up: boolean; top: number } | null>(null);
    useEffect(() => {
        const cal = calRef.current, wrap = wrapRef.current;
        if (!cal || !wrap) return;
        let raf = 0;
        const check = () => {
            raf = 0;
            const rows = [...cal.querySelectorAll<HTMLElement>(`[data-day="${today}"]`)];
            if (!rows.length) return setTodayOut(null);
            const v = viewBox(cal, wrap);
            if (rows.some(r => {
                const b = r.getBoundingClientRect();
                return Math.min(b.bottom, v.bottom) - Math.max(b.top, v.top) > 24;
            }))
                return setTodayOut(null);
            const up = rows[0].getBoundingClientRect().bottom <= v.top + 24;
            const y = Math.round((up ? v.top + 8 : v.bottom - 44) - wrap.getBoundingClientRect().top);
            setTodayOut(o => (o && o.up === up && o.top === y ? o : { up, top: y }));
        };
        const later = () => void (raf ||= requestAnimationFrame(check));
        check();
        window.addEventListener("scroll", later, { capture: true, passive: true });
        window.addEventListener("resize", later);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("scroll", later, { capture: true });
            window.removeEventListener("resize", later);
        };
    });
    const goToday = () => {
        setMmPick(null);
        setWeek(monday);
        setDDay(dayOfWeek(today));
        setMonOff(0);
        jump(today);
    };
    const goDay = (d: DayNum) => {
        setMmPick(d);
        setWeek(d - dayOfWeek(d));
        setDDay(dayOfWeek(d));
        setMonOff(0);
        setPop(false);
        jump(d);
    };

    // le date speciali: una regola con un inizio e una fine tocca quel giorno in una sede scelta
    // (una regola che parte e non finisce non è un'occasione: cambia il calendario da lì in poi)
    const specials = (d: DayNum) => [
        ...new Set(
            entries
                .filter(e => e.when.period && Number.isFinite(e.when.period.from) && Number.isFinite(e.when.period.to) && okDate(e.when, d) && shown.some(x => specFor(e, seatOf(x.id)) !== null))
                .map(e => e.thing)
        )
    ];

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
                .map(l => ({ ...l, segs: fLane(l.ctx, ax), off: o.only || o.list ? [] : offLines(spente, l.k, seat, date, ax) }))
                .filter(l => o.only || view === "day" || l.segs.length || l.off.length);
            // l'ora di adesso: dopo mezzanotte sta in coda alla serata di ieri
            const nowX = isToday && nowMin >= ax.from ? X(nowMin) : date === today - 1 && nowMin + 1440 < ax.to ? X(nowMin + 1440) : null;
            return (
                <div key={sede.id + ":" + i} className={`${s.fday} ${isToday ? s.today : ""} ${LOOK_D && view === "week" && date === mmPick && !isToday ? s.picked : ""}`} data-day={date}>
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
                                        <div key={ln.thing} className={`${s.fname} ${ln.preview ? s.pv : ""}`} title={ln.thing} style={{ "--c": colorOf(l.k, ln.thing) } as CSSProperties}>
                                            <span>{l.k === "menu" ? shortName(ln.thing) : ln.thing}</span>
                                            {ln.preview && o.pv && <em className={s.pv}>{o.pv}</em>}
                                        </div>
                                    ))}
                                    {isOpen &&
                                        l.off.map(x => (
                                            <div key={x.entry.id} className={`${s.fname} ${s.spenta}`} style={{ "--c": colorOf(l.k, x.entry.thing) } as CSSProperties}>
                                                <span>{l.k === "menu" ? shortName(x.entry.thing) : x.entry.thing}</span>
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
                                                        aria-pressed={!!pick && !pick.off && pick.kind === l.k && pick.thing === ln.thing && pick.date === date && pick.sede === sede.id && pick.from === g.from}
                                                        onClick={() => openPick({ kind: l.k, thing: ln.thing, date, sede: sede.id, from: g.from })}
                                                        style={{ "--c": colorOf(l.k, ln.thing), left: X(g.from) + "%", width: X(g.to) - X(g.from) + "%" } as CSSProperties}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ))}
                                    {l.off.map(x => (
                                        <div key={x.entry.id} className={s.fline}>
                                            {x.segs.map(g => {
                                                const tip = `${x.entry.thing} · ${fH(g)}\nPronto, non in onda.`;
                                                return (
                                                    <button
                                                        key={g.from}
                                                        type="button"
                                                        className={`${s.fls} ${s.off} ${s.spenta}`}
                                                        data-tip={tip}
                                                        aria-label={aria(tip)}
                                                        aria-pressed={!!pick && pick.off === x.entry.id && pick.date === date && pick.sede === sede.id && pick.from === g.from}
                                                        onClick={() => openPick({ kind: l.k, thing: x.entry.thing, date, sede: sede.id, from: g.from, off: x.entry.id })}
                                                        style={{ "--c": colorOf(l.k, x.entry.thing), left: X(g.from) + "%", width: X(g.to) - X(g.from) + "%" } as CSSProperties}
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

            // sotto c'è qualcosa che non si vede: l'ovale con gli strati e quanti sono
            function under(g: LaneSeg) {
                if (!g.hidden.length) return null;
                return (
                    <span className={s.under} aria-hidden="true">
                        <Layers size={10} strokeWidth={2.2} />
                        {g.hidden.length}
                    </span>
                );
            }

            function seg(k: CalKind, g: LaneSeg) {
                const tip = segTip(k, g, seat);
                const pos = { left: `calc(${X(g.from)}% + 1px)`, width: `calc(${X(g.to) - X(g.from)}% - 2px)` };
                const openIt = () => setOpen({ kind: k, day: i, sede: sede.id });
                if (k === "featured") {
                    const pc = Math.min(56, 12 + g.onda.length * 5);
                    return (
                        <button key={g.from} type="button" className={`${s.fseg} ${s.ev2} ${g.hidden.length ? s.hid : ""}`} data-tip={tip} aria-label={aria(tip)} onClick={openIt}
                            style={{ "--c": KIND_COLOR.featured, ...pos, background: `color-mix(in srgb, var(--c) ${pc}%, var(--surface))` } as CSSProperties}>
                            {/* un numero da solo non diceva cosa (difetto 13): il nome, o quanti e quali */}
                            <span className={s.ft}>{g.onda.length === 1 ? g.onda[0] : `${g.onda.length} insieme: ${g.onda.join(", ")}`}</span>
                            {under(g)}
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
                        <span className={s.ft}>{g.onda.map(n => (k === "menu" ? shortName(n) : n)).join(" + ")}</span>
                        {under(g)}
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

    /* ---------- più sedi (D150 E): una sede, sotto il giorno solo chi è diverso ---------- */
    const progs = useMemo(() => {
        const m = new Map<string, Programma[]>();
        if (multi) for (const x of sedi) m.set(x.id, [0, 1, 2, 3, 4, 5, 6].map(i => programma(entries, seatOf(x.id), week + i, axis)));
        return m;
    }, [multi, sedi, entries, week, axis, seatOf]);
    const progOf = (id: string, i: number) => progs.get(id)?.[i] ?? { pezzi: [], key: "" };
    const nameOf = (id: string) => sedi.find(x => x.id === id)?.name ?? "una sede";
    const fewNames = (ids: readonly string[]) => (ids.length <= 3 ? ids.map(nameOf).join(", ") : `${nameOf(ids[0])}, ${nameOf(ids[1])} e altre ${ids.length - 2}`);
    // in quanti giorni della settimana una sede fa diverso dalla sede guardata
    const daysDiff = (id: string) => (focus ? [0, 1, 2, 3, 4, 5, 6].filter(i => progOf(id, i).key !== progOf(focus.id, i).key).length : 0);
    useEffect(() => {
        tagRef.current = id => {
            const k = daysDiff(id);
            return k ? <span className={s.dtag}>diversa · {k} g</span> : null;
        };
    });
    const [openDays, setOpenDays] = useState<ReadonlySet<DayNum>>(() => new Set());
    const [allDiff, setAllDiff] = useState(false);
    // toccando una sede diversa si guarda lei: quella di prima entra nel confronto (con tutte o un gruppo, le altre del gruppo)
    const goSede = (id: string) =>
        focus ? vista.setSede({ kind: "sede", id }) : vista.setSede({ kind: "sede", id }, { confronta: scopeSedi.map(x => x.id) });
    const LIMIT = 3;
    const diffRows = (i: number, diffs: readonly Diversi[], base: Programma) => {
        const date = week + i, open = openDays.has(date);
        const out: ReactNode[] = (open ? diffs : diffs.slice(0, LIMIT)).map(g => {
            const kinds = CAL_KINDS.filter(k => base.pezzi.some(x => x.k === k) || g.prog.pezzi.some(x => x.k === k));
            const X = (m: number) => ((m - axis.from) / (axis.to - axis.from)) * 100;
            const at = (a: number, b: number) => ({ left: X(a) + "%", width: X(b) - X(a) + "%" });
            const inBase = new Set(base.pezzi.map(x => `${x.k}|${x.label}|${x.from}|${x.to}`));
            const inOther = new Set(g.prog.pezzi.map(x => `${x.k}|${x.label}|${x.from}|${x.to}`));
            const who = g.ids.length <= 2 ? g.ids.map(nameOf).join(", ") : `${nameOf(g.ids[0])} e altre ${g.ids.length - 1}`;
            return (
                <div key={"d:" + date + ":" + g.ids[0]} className={`${s.fday} ${s.fdiff}`}>
                    <div className={s.fdw}>
                        <button type="button" className={s.fdn} title={g.ids.map(nameOf).join(", ")} onClick={() => goSede(g.ids[0])}>
                            {who}
                        </button>
                        <span className={s.fdc} title={g.what}>
                            {g.what}
                        </span>
                    </div>
                    <div className={s.ftl} style={{ backgroundSize: `calc(100% / ${(axis.to - axis.from) / 60}) 100%` }}>
                        {kinds.map(k => (
                            <div key={k} className={s.dlane}>
                                {base.pezzi
                                    .filter(x => x.k === k && !inOther.has(`${x.k}|${x.label}|${x.from}|${x.to}`))
                                    .map(x => (
                                        <span key={"g" + x.from} className={`${s.dseg} ${s.ghost}`} title={`Qui non c'è ${x.label}`} style={at(x.from, x.to)} />
                                    ))}
                                {g.prog.pezzi
                                    .filter(x => x.k === k)
                                    .map(x => {
                                        const same = inBase.has(`${x.k}|${x.label}|${x.from}|${x.to}`);
                                        return (
                                            <span
                                                key={x.from}
                                                className={`${s.dseg} ${same ? s.faded : s.mark}`}
                                                title={`${KIND_LABEL[k]} · ${x.label} · ${fH(x)}`}
                                                style={{ "--c": colorOf(k, x.first), ...at(x.from, x.to) } as CSSProperties}
                                            />
                                        );
                                    })}
                            </div>
                        ))}
                    </div>
                </div>
            );
        });
        if (diffs.length > LIMIT) {
            const rest = diffs.slice(LIMIT), n = rest.reduce((t, g) => t + g.ids.length, 0);
            out.push(
                <div key={"m:" + date} className={s.fmore}>
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() =>
                            setOpenDays(o => {
                                const x = new Set(o);
                                if (x.has(date)) x.delete(date);
                                else x.add(date);
                                return x;
                            })
                        }
                    >
                        {open ? "Mostra meno" : `+ ${rest.length} ${rest.length === 1 ? "altra differenza" : "altre differenze"} (${n} ${n === 1 ? "sede" : "sedi"}) · Mostra`}
                    </button>
                </div>
            );
        }
        return out;
    };
    const days = view === "day" ? [dDay] : [0, 1, 2, 3, 4, 5, 6];
    let body: ReactNode;
    if (focus)
        body = days.flatMap(i => {
            const base = progOf(focus.id, i);
            const r = cmp.length ? confrontoGiorno(base, cmp.map(x => [x.id, progOf(x.id, i)] as const)) : null;
            const label = (ii: number, d: DayNum) => (
                <>
                    {view === "day" ? <b className={s.gsn}>{focus.name}</b> : dayLabel(ii, d)}
                    {r && (
                        <span className={s.same} title={`Uguali a ${focus.name} questo giorno: ${r.same} di ${cmp.length}`}>
                            = {r.same === cmp.length ? "tutte" : r.same}
                        </span>
                    )}
                </>
            );
            return [...rows(focus, [i], label), ...(r ? diffRows(i, r.diffs, base) : [])];
        });
    else
        body = days.flatMap(i => {
            const m = maggioranza(scopeSedi.map(x => [x.id, progOf(x.id, i)] as const));
            const rep = m && sedi.find(x => x.id === m.baseIds[0]);
            if (!m || !rep) return [];
            const label = (ii: number, d: DayNum) => (
                <>
                    {view === "week" && dayLabel(ii, d)}
                    <span className={s.same} title={`Quello che fa la maggior parte delle sedi: ${fewNames(m.baseIds)}`}>
                        {m.baseIds.length === scopeSedi.length ? `tutte e ${m.baseIds.length}` : `${m.baseIds.length} sedi`}
                    </span>
                </>
            );
            return [...rows(rep, [i], label), ...diffRows(i, m.diffs, m.base)];
        });

    // il riepilogo sopra il calendario: chi è uguale tutta la settimana, chi è diverso e quanti giorni
    const summary = (() => {
        if (!multi) return null;
        let same: string[], diff: [string, number][], head: ReactNode;
        if (focus) {
            if (!cmp.length) return null;
            diff = cmp.map(x => [x.id, daysDiff(x.id)] as [string, number]).filter(([, k]) => k > 0);
            same = cmp.filter(x => !diff.some(([id]) => id === x.id)).map(x => x.id);
            head = same.length ? (
                <span>
                    Uguali a {focus.name} tutta la settimana: <b>{same.length}</b> <span title={same.map(nameOf).join(", ")}>({fewNames(same)})</span>
                </span>
            ) : (
                <span>Nessuna sede uguale a {focus.name} tutta la settimana</span>
            );
        } else {
            const ms = [0, 1, 2, 3, 4, 5, 6].map(i => maggioranza(scopeSedi.map(x => [x.id, progOf(x.id, i)] as const)));
            const off = (id: string) => ms.filter(m => m && !m.baseIds.includes(id)).length;
            diff = scopeSedi.map(x => [x.id, off(x.id)] as [string, number]).filter(([, k]) => k > 0);
            same = scopeSedi.filter(x => !diff.some(([id]) => id === x.id)).map(x => x.id);
            head = (
                <span>
                    Fanno come la maggior parte tutta la settimana: <b>{same.length}</b> di {scopeSedi.length}{" "}
                    {same.length > 0 && <span title={same.map(nameOf).join(", ")}>({fewNames(same)})</span>}
                </span>
            );
        }
        diff.sort((a, b) => b[1] - a[1]);
        const vis = allDiff ? diff : diff.slice(0, 4);
        return (
            <div className={s.csum}>
                <div className={s.cline}>{head}</div>
                {diff.length > 0 && (
                    <div className={s.cline}>
                        <span>
                            Diverse: <b>{diff.length}</b>
                        </span>
                        {vis.map(([id, k]) => (
                            <button key={id} type="button" className={s.cchip} title={`Guarda ${nameOf(id)}`} onClick={() => goSede(id)}>
                                {nameOf(id)} · {k} {k === 1 ? "giorno" : "giorni"}
                            </button>
                        ))}
                        {diff.length > 4 && (
                            <button type="button" className={s.cchip} onClick={() => setAllDiff(a => !a)}>
                                {allDiff ? "meno" : `+${diff.length - 4} altre`}
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    })();

    const hoursFor = (ax: Axis, st: number) => {
        const out: ReactNode[] = [];
        for (let m = Math.ceil(ax.from / 60) * 60 + 60; m < ax.to; m += 60) {
            const h = (m - ax.from) / 60;
            const hidden = st === 1 ? false : st === 2 ? h % 2 !== 0 : st === 4 ? h % 4 !== 0 : (h - 1) % 3 !== 0;
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
                        <IconButton size="sm" icon={LOOK_D ? <ChevronLeft size={14} /> : <ChevronUp size={14} />} aria-label="Mese precedente" onClick={() => setMonOff(o => o - 1)} />
                        <IconButton size="sm" icon={LOOK_D ? <ChevronRight size={14} /> : <ChevronDown size={14} />} aria-label="Mese successivo" onClick={() => setMonOff(o => o + 1)} />
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
                            const d = w + i, dp = dayParts(d), sp = specials(d), isSel = view === "day" ? d === selDay : LOOK_D && d === mmPick;
                            const cls = [s.mmd, dp.month !== fp.month ? s.out : "", d === today ? s.isToday : "", isSel ? s.sel : "", sp.length ? s.dot : ""].join(" ");
                            const said = sp.length ? `Date speciali: ${sp.map(q).join(", ")}` : "";
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className={cls}
                                    data-tip={said ? `${dayLong(d)}\n${said}.` : undefined}
                                    aria-label={dayLong(d) + (said ? ". " + said : "")}
                                    aria-current={isSel ? "date" : undefined}
                                    onClick={() => goDay(d)}
                                >
                                    {dp.day}
                                </button>
                            );
                        })}
                    </div>
                ))}
                <p className={s.mmk}>
                    <i />
                    date speciali
                </p>
            </div>
        );
    };


    /* ---------- la sezione Aggiungi / Modifica completa ---------- */
    const L = useMemo<DraftLookups>(
        () => ({
            products: new Map((section?.pickList ?? anteprima?.pickList ?? []).map(x => [x.id, x])),
            catalogs: names.catalogs,
            styles: names.styles,
            featured: names.featured,
            sedi: new Map(sedi.map(x => [x.id, x.name])),
            groups: groupNames,
            multi
        }),
        [section?.pickList, anteprima?.pickList, names, sedi, groupNames, multi]
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
    // menù, stile e in evidenza con una voce sola: il dove e il quando si cambiano nel tunnel, come creando
    const tunnelFor = (e: CalEntry) => {
        const id = isDish(e.kind) ? null : thingIdOf(e);
        return id && section?.onTunnel && section.canTunnel?.(e.kind) && voceOf(entries, spente, e.kind, id)?.count === 1 ? id : null;
    };
    const openFull = (e: CalEntry, only?: string) => {
        const id = only ? null : tunnelFor(e);
        if (id) return section!.onTunnel!(e.kind, id, false);
        setSec({ back: true });
        setDraft(draftFromEntry(e, L, only ?? null));
        setNote(null);
    };
    // le parti della bozza già salvate (ore diverse per sede): «Riprova» non le rifà
    const savedParts = useRef(new Set<string>());
    const savingSec = useRef(false);
    const closeSec = (saved: boolean, toRules = true) => {
        savedParts.current = new Set();
        const back = sec?.back;
        const rules = sec?.rules;
        setSec(null);
        setDraft(null);
        if (saved || !back) closePick();
        if (rules && toRules) addFromRules?.();
    };
    // arrivando dalle Regole si apre subito «Aggiungi»
    const fromRules = !!addFromRules;
    useEffect(() => {
        if (!fromRules) return;
        setSec({ back: false, rules: true });
        setDraft(null);
        setNote(null);
    }, [fromRules]);
    // «Tieni da parte» sopravvive all'uscita verso Menù, Stili, In evidenza
    useEffect(() => setKept(tenantId ? readAside(tenantId) : null), [tenantId]);
    const keep = (d: Draft | null) => {
        setKept(d);
        if (tenantId) writeAside(d, tenantId);
    };
    const saveSec = async (then?: CalKind) => {
        if (!section || !draft) return;
        if (savingSec.current) return;
        savingSec.current = true;
        setBusy(true);
        try {
            await section.onSave(draft, L, savedParts.current);
            const pd = mainWhen(draft).period;
            if (pd && (pd.from > week + 6 || pd.to < week)) {
                setWeek(pd.from - dayOfWeek(pd.from));
                setDDay(dayOfWeek(pd.from));
            }
            setNote({ text: (draft.mode === "edit" ? "Salvato: " : "Aggiunto al calendario: ") + draftLabel(draft, L) + "." });
            // dalle Regole si torna lì solo con un salvataggio pulito e senza un passo dopo
            closeSec(true, !then);
            if (then) section.onGoNew(then);
        } catch (err) {
            if (err instanceof PartialSaveError) {
                // la voce è in due regole: si chiude e si guarda il calendario riletto, senza «Riprova»
                setNote({ text: "Salvato solo in parte: " + draftLabel(draft, L) + " ora è in due regole. Controlla il calendario e togli quella che non serve.", error: true });
                closeSec(true, false);
            } else setNote({ text: "Non siamo riusciti a salvare. Riprova.", error: true });
        } finally {
            savingSec.current = false;
            setBusy(false);
        }
    };
    const dropSec = async () => {
        if (!section || !draft) return;
        setBusy(true);
        try {
            await section.onDrop(draft);
            setNote({ text: "Tolto dal calendario: " + draftLabel(draft, L) + "." });
            closeSec(true, false);
        } catch {
            setNote({ text: "Non siamo riusciti a toglierlo. Riprova.", error: true });
        } finally {
            setBusy(false);
        }
    };

    // l'anteprima: il calendario con la bozza dentro
    const pvEntries = useMemo(() => (draft ? draftEntries(draft, L, nowDate.getTime()) : []), [draft, L, nowDate]);
    const reaches = (id: string) => pvEntries.some(e => specFor(e, seatOf(id)) !== null);
    // menù e stile nella stessa regola (finché non si separano): il compagno va in onda con la bozza, a ogni suo orario
    const pairKinds = (k: CalKind) => !NEW_MODEL.splitLayout && (k === "menu" || k === "style");
    const pvPair = useMemo(() => (draft && !NEW_MODEL.splitLayout ? draftPairEntry(draft, L, nowDate.getTime()) : null), [draft, L, nowDate]);
    const pvPairs = useMemo<CalEntry[]>(
        () => (pvPair ? pvEntries.map((e, i) => ({ ...e, id: pvPair.id + (i ? ":" + i : ""), kind: pvPair.kind, thing: pvPair.thing, add: false })) : []),
        [pvEntries, pvPair]
    );
    const pvList = useMemo(() => {
        if (!draft) return null;
        let list: CalEntry[] = entries;
        const r = draft.rule;
        if (r && draft.kind === "featured" && draft.only) list = list.filter(e => e.id !== `${r.id}:featured:${draft.only}`);
        // menù e stile stanno nella stessa regola: in modifica escono tutti e due
        else if (r && !draft.only)
            list = list.filter(e => !(e.ruleId === r.id && (e.kind === draft.kind || (pairKinds(draft.kind) && pairKinds(e.kind)))));
        return [...list, ...pvEntries, ...pvPairs];
    }, [draft, entries, pvEntries, pvPairs]);
    const pvAx = useMemo(() => (pvList ? axisFor(pvList) : axis), [pvList, axis]);
    // con «Mettili insieme» l'anteprima lo aggiunge; chi tocca si guarda come se prendesse il posto
    const judged = useMemo(() => (pvList && draft?.insieme ? pvList.map(e => (e.preview && e.kind === "menu" ? { ...e, add: false } : e)) : pvList), [pvList, draft?.insieme]);
    // i menù che stanno da soli (punto 4): dove si vede l'altro, in quella sede vince lui (resta l'ordine fra gli altri)
    const solo = NEW_MODEL.soloMenu && draft?.kind === "menu" && !!draft.lui;
    const luiFor = useCallback(
        (list: CalEntry[], id: string) => {
            if (!solo) return list;
            const lui = (thing: string) => (draft?.insieme ? !draft.tuo?.includes(id + "|" + thing) : !!draft?.lui?.includes(id + "|" + thing));
            return list.map(e => (!e.preview && e.kind === "menu" && lui(e.thing) ? { ...e, tscore: e.tscore + 1e6, created: e.created + 1e15, solo: true as const } : e));
        },
        [solo, draft?.insieme, draft?.lui, draft?.tuo]
    );
    // nei tunnel non c'è la «Sede» in alto a destra: valgono tutte le sedi della bozza
    const pvBase = anteprima ? sedi : shown;
    const pvReach = pvEntries.length ? pvBase.filter(x => reaches(x.id)) : pvBase;
    // nei tunnel con più sedi se ne guarda una alla volta, scelta dalle frecce; il conto vale per tutte
    const pvAll = pvReach.length ? pvReach : pvEntries.length ? sedi.filter(x => reaches(x.id)).slice(0, 1) : pvBase.slice(0, 1);
    const pvOne = anteprima && multi && pvAll.length > 1 ? pvAll.find(x => x.id === anteprima.sede) ?? pvAll[0] : null;
    const pvSedi = pvOne ? [pvOne] : pvAll.slice(0, 4);

    // cosa cambia nel calendario, nella settimana che si vede; e dove si accavalla con un altro (D135)
    const effect = (): Impatto => {
        if (!draft || !pvList || !judged) return NO_IMPATTO;
        if (missing(draft, L)) return { lines: ["Scegli prima cosa mettere: poi qui vedi dove va in onda."], scontri: [] };
        const wk = week === monday ? "Questa settimana" : "Nella settimana del " + mShort(week);
        const groupsOf = new Map<string, string[]>();
        const sc = new Map<string, Scontro>();
        const effSedi: SedeEff[] = [];
        for (const x of pvAll.length ? pvAll : shown) {
            const seat = seatOf(x.id), cov = new Set<string>(), by = new Set<string>();
            // chi tocca la bozza → i tratti (giorno, da, a), uniti dove si toccano
            const tocchi = new Map<string, { vince: boolean; pari: boolean; copre: boolean; tratti: [number, number, number][] }>();
            const tocca = (con: string, vince: boolean, pari: boolean, d: number, a: number, b: number, copre = false) => {
                const k = con + "|" + vince + "|" + copre;
                const t = tocchi.get(k) ?? { vince, pari: true, copre, tratti: [] };
                t.pari &&= pari;
                const last = t.tratti[t.tratti.length - 1];
                if (last && last[0] === d && last[2] === a) last[2] = b;
                else t.tratti.push([d, a, b]);
                tocchi.set(k, t);
            };
            let mins = 0, off = 0, days = 0, incroci = 0;
            // i giorni della sede in breve: dove si incrocia, chi si vede (al telefono, sotto la sede aperta)
            const gg = new Map<string, number[]>();
            for (let i = 0; i < 7; i++) {
                let on = 0, touched = false;
                const d = dayOfWeek(week + i), ls = fLines(dayCtx(luiFor(judged, x.id), draft.kind, seat, week + i), pvAx);
                // chi incrocia chi lo dicono le regole di oggi, senza le scelte dei menù che stanno da soli
                const ls0 = solo ? fLines(dayCtx(judged, draft.kind, seat, week + i), pvAx) : ls;
                for (const l of ls0.filter(l => l.preview))
                    for (const g of l.segs) {
                        if (g.state === "on") {
                            if (g.covers.length) touched = true;
                            g.covers.forEach(c => {
                                const lo = g.reps.find(e => e.thing === c);
                                if (g.win && lo) tocca(c, true, tie(g.win, lo, seat), d, g.from, g.to);
                            });
                        } else {
                            if (g.by) touched = true;
                            // resta l'altro solo perché c'era prima: lo dice l'avviso
                            if (g.win && g.self && tie(g.win, g.self, seat)) tocca(g.by, false, true, d, g.from, g.to);
                            // lo copre un'altra regola che oggi vince (più vicina alla sede, orari più stretti): è un incrocio anche questo, e si sceglie (D196)
                            else if (g.by && (draft.kind === "menu" || draft.kind === "style")) tocca(g.by, false, false, d, g.from, g.to, true);
                        }
                    }
                const seen = new Set<string>();
                for (const l of ls.filter(l => l.preview))
                    for (const g of l.segs) {
                        if (g.covers.length || g.by) {
                            const vis = [...ls].sort((a, b) => +b.preview - +a.preview).filter(o => o.segs.some(z => z.state === "on" && z.from < g.to && z.to > g.from));
                            const k = fH(g) + ": " + vis.map(o => o.thing).join(" + ");
                            if (vis.length && !seen.has(k)) {
                                seen.add(k);
                                gg.set(k, [...(gg.get(k) ?? []), i]);
                            }
                        }
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
                if (touched) incroci++;
            }
            const giorni = [...gg].map(([txt, ds]) => ({ days: dayRuns(ds), txt }));
            effSedi.push({ id: x.id, name: x.name, mins, days, cov: [...cov], by: [...by], incroci, ...(giorni.length ? { giorni } : {}) });
            const out: string[] = [], pd = mainWhen(draft).period;
            if (!mins && !off)
                out.push(`${wk} non c'è${pd && pd.from > week + 6 ? ": comincia " + (elides(pd.from) ? "l'" : "il ") + mShort(pd.from) : pd && pd.to < week ? ": è già finito" : ""}.`);
            else if (!mins) out.push(`${wk} non va mai in onda: ${by.size > 1 ? "lo coprono" : "lo copre"} ${listIt([...by].map(q))}.`);
            else {
                out.push(`${wk} è in onda ${days} ${days === 1 ? "giorno" : "giorni"}, ${hoursText(mins)} in tutto.`);
                if (cov.size)
                    out.push(
                        draft.insieme
                            ? `Quando si sovrappongono c'è insieme a ${listIt([...cov].map(q))}: il cliente sceglie.`
                            : `Prende il posto di ${listIt([...cov].map(q))} quando si sovrappongono.`
                    );
                if (by.size) out.push(`Per ${hoursText(off)} non si vede: ${by.size > 1 ? "lo coprono" : "lo copre"} ${listIt([...by].map(q))}.`);
            }
            // lo stile porta con sé il suo menù (e viceversa), che nella sua corsia può coprire altro
            if (pvPair && (mins || off)) {
                const pc = pairCovers(pvList, pvPair, seat, week, pvAx);
                out.push(
                    `Porta con sé ${pvPair.kind === "menu" ? "il menù" : "lo stile"} ${q(pvPair.thing)}` +
                        (pc.length ? `, che prende il posto di ${listIt(pc.map(q))} quando si sovrappongono.` : ".")
                );
            }
            const k = out.join("\n");
            groupsOf.set(k, [...(groupsOf.get(k) ?? []), x.name]);
            for (const [key, t] of tocchi) {
                const quando = quandoScontro(t.tratti), con = key.split("|").slice(0, -2).join("|");
                const sk = [con, t.vince, t.pari, t.copre, quando].join("|"), prev = sc.get(sk);
                if (prev) {
                    prev.sedi.push(x.name);
                    prev.ids?.push(x.id);
                } else sc.set(sk, { sedi: [x.name], ids: [x.id], con, quando, vince: t.vince, pari: t.pari, ...(t.copre ? { copre: true as const } : {}) });
            }
        }
        // in modifica, la voce com'era salvata, con gli stessi conti: «Prima: …» in «Controlla»
        let prima: SedeEff[] | undefined;
        const r0 = draft.rule;
        if (draft.mode === "edit" && r0 && (!draft.only || draft.kind === "featured")) {
            const mine = (e: CalEntry) => e.kind === draft.kind && (draft.only ? e.id === `${r0.id}:featured:${draft.only}` : e.ruleId === r0.id);
            // come `judged`: chi stava insieme si guarda come se prendesse il posto, la risposta la dice il tunnel
            const list = entries.map(e => (mine(e) ? { ...e, preview: true, ...(e.kind === "menu" ? { add: false } : {}) } : e));
            const ax = axisFor(list);
            prima = (pvAll.length ? pvAll : shown).map(x => {
                const seat = seatOf(x.id), cov = new Set<string>(), by = new Set<string>();
                let mins = 0, days = 0;
                for (let i = 0; i < 7; i++) {
                    let on = 0;
                    for (const l of fLines(dayCtx(list, draft.kind, seat, week + i), ax).filter(l => l.preview))
                        for (const g of l.segs)
                            if (g.state === "on") {
                                on += g.to - g.from;
                                g.covers.forEach(c => cov.add(c));
                            } else if (g.by) by.add(g.by);
                    if (on) {
                        mins += on;
                        days++;
                    }
                }
                return { id: x.id, name: x.name, mins, days, cov: [...cov], by: [...by], incroci: 0 };
            });
        }
        // le sedi con lo stesso risultato stanno insieme
        const lines = [...groupsOf.entries()].flatMap(([k, ss]) => {
            const r = k.split("\n");
            if (multi) r[0] = "A " + listIt(ss) + ": " + r[0].charAt(0).toLowerCase() + r[0].slice(1);
            return r;
        });
        const tk = draft.kind + ":", colori = Object.fromEntries([...shade].filter(([k]) => k.startsWith(tk)).map(([k, v]) => [k.slice(tk.length), v]));
        return { lines, scontri: [...sc.values()], sedi: effSedi, colori, ...(prima ? { prima } : {}), ...(pvPair?.kind === "style" ? { pair: pvPair.thing } : {}) };
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
        const off = pick.off ? spente.find(e => e.id === pick.off) : undefined;
        const ln = off ? undefined : fLines(ctx, axis).find(l => l.thing === pick.thing);
        const g = ln?.segs.find(x => x.from <= pick.from && pick.from < x.to);
        const entry = pick.off ? off : (g?.self ?? entries.find(e => e.kind === pick.kind && e.thing === pick.thing && specFor(e, seat) !== null));
        if (entry) {
            const pool = off ? spente : entries;
            const paired = entry.kind === "menu" ? "style" : entry.kind === "style" ? "menu" : null;
            const pairedName = paired ? (pool.find(x => x.ruleId === entry.ruleId && x.kind === paired)?.thing ?? null) : null;
            // «Spegni» vale per Menù, Stile e In evidenza, una voce per regola; con più contenuti nella regola resta «Togli»
            const canOff = !!onEnable && !isDish(entry.kind) && pool.filter(x => x.ruleId === entry.ruleId && x.kind === entry.kind).length === 1;
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
                    lastBase={lastBaseMenu(rules, entry.ruleId)}
                    writable={!!onDrop && (isWritable ? isWritable(entry.rule) : false)}
                    onEnable={
                        canOff
                            ? async on => {
                                  try {
                                      await onEnable(entry.rule, on);
                                      setNote({ text: on ? `In onda: ${entry.thing}.` : `Spento: ${entry.thing}. Resta pronto, non in onda.` });
                                      closePick();
                                  } catch {
                                      setNote({ text: on ? "Non siamo riusciti a metterlo in onda. Riprova." : "Non siamo riusciti a spegnerlo. Riprova.", error: true });
                                  }
                              }
                            : undefined
                    }
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

    const pd = draft ? mainWhen(draft).period : undefined;
    const away = !!pd && (pd.from > week + 6 || pd.to < week);
    const effNow = anteprima && draft ? effect() : null;
    // «insieme» dove oggi vince un altro: lì il tuo non si vede, e l'anteprima lo disegna coperto (D196)
    const coperta = (id: string) => !!draft?.insieme && !!effNow?.sedi?.some(x => x.id === id && !x.cov.length && x.by.length > 0);
    const pvStep = (by: number) => pvAll[(pvAll.indexOf(pvOne ?? pvAll[0]) + by + pvAll.length) % pvAll.length];
    const pvDays = (id: string) => effNow?.sedi?.find(x => x.id === id)?.incroci ?? 0;
    const giorni = (n: number) => n + (n === 1 ? " giorno" : " giorni");
    const preview = draft && pvList && (
        <aside className={s.iprev} aria-label="Anteprima">
            <div className={s.iph}>
                <b>Anteprima · {KIND_LABEL[draft.kind]}</b>
                <span className={s.iwk}>
                    <IconButton size="sm" icon={<ChevronLeft size={14} />} aria-label="Settimana precedente" onClick={() => { setWeek(w => w - 7); setMmPick(null); }} />
                    <span>{weekLong(week)}</span>
                    <IconButton size="sm" icon={<ChevronRight size={14} />} aria-label="Settimana successiva" onClick={() => { setWeek(w => w + 7); setMmPick(null); }} />
                </span>
            </div>
            {away && pd && (
                <button type="button" className={`${s.chip} ${s.iaway}`} onClick={() => setWeek(pd.from - dayOfWeek(pd.from))}>
                    <Calendar size={13} aria-hidden />
                    Questa settimana non c'è: vai {elides(pd.from) ? "all'" : "al "}
                    {mShort(pd.from)}
                </button>
            )}
            {pvOne && (
                <div className={s.wsel}>
                    <IconButton size="sm" icon={<ChevronLeft size={14} />} aria-label={`Sede precedente: ${pvStep(-1).name}`} onClick={() => anteprima?.onSede?.(pvStep(-1).id)} />
                    {/* nella D il nome della sede tra le frecce, senza tendina (v55) */}
                    {LOOK_D ? (
                        <output className={s.wsname} aria-label="Sede da guardare" aria-live="polite">
                            {pvOne.name}
                        </output>
                    ) : (
                        <Select
                            aria-label="Sede da guardare"
                            containerClassName={s.wsl}
                            value={pvOne.id}
                            onChange={e => anteprima?.onSede?.(e.target.value)}
                            options={pvAll.map(x => ({ value: x.id, label: x.name + (pvDays(x.id) ? " · " + giorni(pvDays(x.id)) : "") }))}
                        />
                    )}
                    <IconButton size="sm" icon={<ChevronRight size={14} />} aria-label={`Sede successiva: ${pvStep(1).name}`} onClick={() => anteprima?.onSede?.(pvStep(1).id)} />
                    <span className={s.wsn}>
                        {pvAll.indexOf(pvOne) + 1} di {pvAll.length}
                        {pvDays(pvOne.id) > 0 && (draft.kind === "menu" || draft.kind === "style") && (
                            <>
                                {" · "}
                                <b>{giorni(pvDays(pvOne.id))}</b> con altri {draft.kind === "style" ? "stili" : "menù"}
                            </>
                        )}
                    </span>
                </div>
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
                            {rows(x, [0, 1, 2, 3, 4, 5, 6], dayLabel, { only: draft.kind, list: solo ? luiFor(judged!, x.id) : coperta(x.id) ? judged! : pvList, ax: pvAx, pv: draft.mode === "edit" ? "in modifica" : "nuovo" })}
                        </div>
                    ))}
                </div>
            </div>
            <p className={s.dnote}>
                Solo la corsia {KIND_LABEL[draft.kind]}, una linea per regola. Col bordo tratteggiato quello che stai {draft.mode === "edit" ? "modificando" : "aggiungendo"}: non è ancora salvato.
                {multi && pvEntries.length > 0 && !pvReach.length && pvSedi[0] ? ` Nessuna delle sedi scelte nel calendario: si vede ${pvSedi[0].name}.` : ""}
            </p>
        </aside>
    );
    // i tunnel: solo l'anteprima, con le righe di cosa cambia
    const effKey = effNow ? JSON.stringify(effNow) : "";
    const onEffect = useRef(anteprima?.onEffect);
    onEffect.current = anteprima?.onEffect;
    useEffect(() => {
        if (anteprima) onEffect.current?.(effKey ? (JSON.parse(effKey) as Impatto) : NO_IMPATTO);
    }, [effKey, !!anteprima]); // eslint-disable-line react-hooks/exhaustive-deps
    if (anteprima)
        return (
            <div className={s.root} onPointerMove={onPointerMove} onPointerLeave={hide}>
                {preview}
                {tipNode}
            </div>
        );

    if (sec && section) {
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
                        effect={draft ? effect() : NO_IMPATTO}
                        band={axis}
                        busy={busy}
                        onKind={k => setDraft(blankDraft(k, section.defaultWhere, pairFor(k)))}
                        onRoot={() => setDraft(null)}
                        onResume={() => {
                            if (kept) setDraft({ ...kept, tried: false });
                            keep(null);
                        }}
                        onExit={() => closeSec(false)}
                        from={sec?.rules ? "rules" : undefined}
                        onSave={then => void saveSec(then)}
                        onDrop={() => void dropSec()}
                        onKeep={to => {
                            if (draft) keep({ ...draft, tried: false });
                            closeSec(false, false);
                            section.onGoNew(to);
                        }}
                        onGoNew={to => {
                            closeSec(false, false);
                            section.onGoNew(to);
                        }}
                        voce={(k, id) => voceOf(entries, spente, k, id)}
                        tunnel={k => !!section.onTunnel && !!section.canTunnel?.(k)}
                        onTunnel={(k, id, add) => section.onTunnel?.(k, id, add)}
                        onVoce={e => openFull(e)}
                    />
                </div>
                {tipNode}
            </div>
        );
    }

    const gcls = `${s.gwrap} ${panel ? "" : s.closed} ${pickView ? s.ion : ""}`;
    // l'agenda del telefono: il programma del giorno scelto, nella sede guardata o nella maggior parte
    const agenda = (() => {
        if (!agendaOn || !sedi.length) return null;
        const sedeId = focus?.id ?? (!multi ? sedi[0].id : null);
        const pezziOf = (day: DayNum) =>
            sedeId
                ? programma(entries, seatOf(sedeId), day, axis).pezzi
                : (maggioranza(scopeSedi.map(x => [x.id, programma(entries, seatOf(x.id), day, axis)] as const))?.base.pezzi ?? []);
        // Dopo mezzanotte la fascia della sera prima (Cena 19–02 alle 01:00) è ancora in onda:
        // nell'agenda di oggi c'è anche lei, in cima, come dice la frase (`inOndaOra`).
        const tail = selDay === today ? pezziOf(selDay - 1).filter(x => x.from <= nowMin + 1440 && nowMin + 1440 < x.to) : [];
        const row = (x: (typeof tail)[number], day: DayNum, now: boolean): AgendaItem => {
            const onPick = () => {
                if (!sedeId) return;
                const ln = fLines(dayCtx(entries, x.k, seatOf(sedeId), day), axis).find(l => l.thing === x.first);
                const g = ln?.segs.find(sg => sg.from <= x.from && x.from < sg.to);
                if (g) openPick({ kind: x.k, thing: x.first, date: day, sede: sedeId, from: g.from });
            };
            return {
                key: `${day}|${x.k}|${x.label}|${x.from}`,
                k: x.k,
                label: x.k === "menu" ? x.label.split(" + ").map(shortName).join(" + ") : x.label,
                hours: `${hhmm(x.from)}–${hhmm(x.to)}`,
                color: x.k === "featured" ? KIND_COLOR.featured : colorOf(x.k, x.first),
                now,
                onPick: sedeId ? onPick : undefined
            };
        };
        const items: AgendaItem[] = [
            ...tail.map(x => row(x, selDay - 1, true)),
            ...pezziOf(selDay).map(x => row(x, selDay, selDay === today && x.from <= nowMin && nowMin < x.to))
        ];
        const where = !multi ? "" : focus ? ` · ${focus.name}` : " · Tutte le sedi";
        return (
            <CalendarioAgenda
                days={[0, 1, 2, 3, 4, 5, 6].map(i => ({ date: week + i, name: DAYS[i], num: dayParts(week + i).day }))}
                selected={selDay}
                today={today}
                title={`${DAYS_L[dayOfWeek(selDay)]} ${dayParts(selDay).day} ${monthLong(selDay)}${where}`}
                kinds={CAL_KINDS}
                items={items}
                onDay={d => setDDay(dayOfWeek(d))}
            />
        );
    })();
    const bar = (
        <div className={s.dbar}>
            <div className={s.l}>
                {LOOK_D ? (
                    <IconButton
                        icon={panel ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
                        aria-label={panel ? "Chiudi la colonna del calendario" : "Apri la colonna del calendario"}
                        aria-expanded={panel}
                        className={s.sideT}
                        onClick={() => setPanel(p => !p)}
                    />
                ) : (
                    !panel && <IconButton icon={<PanelLeft size={16} />} aria-label="Apri la colonna del calendario" aria-expanded={false} onClick={() => setPanel(true)} />
                )}
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
                {phone && !anteprima ? (
                    <SegmentedControl
                        size="sm"
                        label="Come vedere il calendario"
                        value={ph}
                        onChange={v => {
                            setPh(v);
                            if (v === "week") setView("week");
                        }}
                        options={[
                            { value: "agenda", label: "Agenda" },
                            { value: "week", label: "Settimana" }
                        ]}
                    />
                ) : (
                    <SegmentedControl
                        size="sm"
                        value={view}
                        onChange={v => setView(v)}
                        options={[
                            { value: "day", label: "Giorno", icon: <Square size={14} aria-hidden /> },
                            { value: "week", label: "Settimana", icon: <Columns3 size={14} aria-hidden /> }
                        ]}
                    />
                )}
                {actions}
                {section?.canAdd && (
                    <Button variant="primary" size="sm" leftIcon={<Plus size={16} />} onClick={openAdd}>
                        Aggiungi
                    </Button>
                )}
            </div>
        </div>
    );
    const side = panel && (
        <aside className={s.gside} aria-label="Calendario del mese">
            {!LOOK_D && (
                <div className={s.gch}>
                    <b>Calendario</b>
                    <IconButton size="sm" icon={<PanelLeftClose size={16} />} aria-label="Chiudi la colonna del calendario" aria-expanded onClick={() => setPanel(false)} />
                </div>
            )}
            {miniMonth()}
        </aside>
    );
    const main = (
        <div className={`${s.gmain} ${agenda ? s.agOn : ""}`}>
            {!LOOK_D && bar}
            {!LOOK_D && noteNode}
            {!LOOK_D && summary}
            {agenda}
            <div className={s.flegend}>
                <span>
                    <i className={`${s.lg} ${s.on}`} />
                    in onda
                </span>
                <span>
                    <i className={`${s.lg} ${s.off}`} />
                    c'è, ma lo copre un altro
                </span>
                {spente.length > 0 && (
                    <span>
                        <i className={`${s.lg} ${s.off} ${s.spenta}`} />
                        pronto, non in onda
                    </span>
                )}
                <span>
                    <i className={`${s.lg} ${s.hid}`}>
                        <span className={s.under}>
                            <Layers size={10} strokeWidth={2.2} aria-hidden />1
                        </span>
                    </i>
                    sotto c'è qualcosa che non si vede
                </span>
            </div>
            <div className={s.dwrap} ref={wrapRef}>
            <div className={s.dcal} ref={calRef}>
                <div className={`${s.fcal} ${pickView || phone ? s.slim : ""} ${phone ? s.narrow : ""}`}>
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
            {todayOut && (
                <button type="button" className={s.todayGo} style={{ top: todayOut.top }} onClick={() => jump(today)}>
                    Oggi · {DAYS[dayOfWeek(today)].toLowerCase()} {dayParts(today).day}
                    {todayOut.up ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
                </button>
            )}
            </div>
            {!rules.length && <p className={s.dnote}>Non c'è ancora niente in calendario.</p>}
            <p className={s.dnote}>Ogni {FSLOT} minuti: apri una corsia per vedere una linea per regola.</p>
        </div>
    );
    // D (copia `pCal`): la frase, la barra e il riepilogo sopra; sotto il mese e la griglia, due card
    if (LOOK_D)
        return (
            <div className={`${s.root} ${s.dpage}`} onPointerMove={onPointerMove} onPointerLeave={hide}>
                {leadD && <Lead parts={leadD} family="menu" />}
                {bar}
                {noteNode}
                {summary}
                <div className={gcls}>
                    {side}
                    {main}
                    {pickView}
                </div>
                {tipNode}
            </div>
        );
    return (
        <div className={`${s.root} ${gcls}`} onPointerMove={onPointerMove} onPointerLeave={hide}>
            {side}
            {main}
            {pickView}
            {tipNode}
        </div>
    );
}

/* ---------- la parte del calendario che si vede davvero ---------- */
// Chi scorre: il calendario stesso (finestre basse) o la pagina. Sopra possono stare
// testate ferme (sticky o fixed) della pagina: quello che c'è sotto non si vede.
function scrollerOf(el: HTMLElement): HTMLElement {
    for (let e: HTMLElement | null = el; e && e !== document.body; e = e.parentElement) {
        const o = getComputedStyle(e).overflowY;
        if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1) return e;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
function pinned(el: Element | null, inside: Element): boolean {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (inside.contains(e)) return false;
        const p = getComputedStyle(e).position;
        if (p === "sticky" || p === "fixed") return true;
    }
    return false;
}
function viewBox(cal: HTMLElement, wrap: HTMLElement) {
    const scroller = scrollerOf(cal), c = cal.getBoundingClientRect();
    let top: number;
    if (scroller === cal) top = c.top + (cal.querySelector<HTMLElement>(`.${s.fhead}`)?.offsetHeight ?? 0);
    else {
        const x = c.left + 24;
        let y = Math.max(0, scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top);
        while (y < window.innerHeight / 2 && pinned(document.elementFromPoint(x, y), wrap)) y += 4;
        top = Math.max(c.top, y);
    }
    return { scroller, top, bottom: Math.min(c.bottom, window.innerHeight) };
}
