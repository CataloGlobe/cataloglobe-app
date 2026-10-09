import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    Bookmark,
    Check,
    ChevronRight,
    EyeOff,
    Folder,
    Layers,
    Megaphone,
    Palette,
    Plus,
    Tag,
    Trash2,
    TriangleAlert,
    Utensils,
    X
} from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import {
    DB_LATER,
    DB_TODAY,
    autoName,
    draftLabel,
    invalid,
    isDish,
    missing,
    normRanges,
    pairName,
    priceKey,
    priceKeys,
    sentence,
    snap,
    sortPicks,
    whatLines,
    whenKey,
    whereText,
    isoDay,
    listIt,
    type Draft,
    type DraftLookups,
    type PickProduct,
    type PickThing
} from "./calendarDraft";
import { CAL_KINDS, FSLOT, KIND_LABEL, dayNum, durLabel, eur, hhmm, type Axis, type CalKind, type CalWhen } from "./calendarModel";
import s from "./CalendarioView.module.scss";

export type SectionSede = { id: string; name: string };
export type SectionGroup = { id: string; name: string; activityIds: string[] };

const ADD_T: Record<CalKind, string> = {
    menu: "Nuovo menù in calendario",
    style: "Nuovo stile in calendario",
    price: "Nuovi prezzi",
    visibility: "Piatti da nascondere",
    featured: "Nuovo In evidenza in calendario"
};
const KDESC: Record<CalKind, string> = {
    menu: "Un menù classico o un multi menù, nei giorni e nelle ore che scegli: prende il posto degli altri.",
    style: "L'aspetto della pagina per un periodo: Natale, l'estate.",
    price: "Uno sconto barrato o un prezzo nuovo, per il tempo che scegli.",
    visibility: "Piatti che spariscono dal menù o restano spenti, non ordinabili.",
    featured: "Un blocco in cima al menù: una novità, un'offerta, un avviso."
};
const KICON: Record<CalKind, ReactNode> = {
    menu: <Utensils size={17} />,
    style: <Palette size={17} />,
    price: <Tag size={17} />,
    visibility: <EyeOff size={17} />,
    featured: <Megaphone size={17} />
};
const NEW_THING: Partial<Record<CalKind, [string, string]>> = {
    menu: ["Crea un menù nuovo", "Menù"],
    style: ["Crea uno stile nuovo", "Stili"],
    featured: ["Crea un In evidenza nuovo", "In evidenza"]
};
const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const sectionSteps = (multi: boolean) => (multi ? ["Cosa", "Quando", "Dove", "Riepilogo"] : ["Cosa", "Quando", "Riepilogo"]);

export type Leave = { why: "exit" | "root" | "del" | "new"; to?: CalKind };

export type CalendarioSectionProps = {
    /** null: si sceglie ancora cosa aggiungere. */
    D: Draft | null;
    upd: (fn: (d: Draft) => void) => void;
    L: DraftLookups;
    pickList: readonly PickProduct[];
    catalogs: readonly PickThing[];
    styles: readonly PickThing[];
    featured: readonly PickThing[];
    sedi: readonly SectionSede[];
    groups: readonly SectionGroup[];
    colorOf: (k: CalKind, name: string) => string;
    kindColor: Record<CalKind, string>;
    /** Le durate che ci sono già, prima quelle dello stesso tipo. */
    durs: (k: CalKind) => CalWhen[];
    counts: Record<CalKind, number>;
    kept: Draft | null;
    toast: ReactNode;
    preview: ReactNode;
    effect: string[];
    band: Axis;
    busy: boolean;
    onKind: (k: CalKind) => void;
    onRoot: () => void;
    onResume: () => void;
    onExit: () => void;
    onSave: (then?: CalKind) => void;
    onDrop: () => void;
    onKeep: (to: CalKind) => void;
    onGoNew: (to: CalKind) => void;
};

/* ---------- la sezione intera: Cosa · Quando · Dove · Riepilogo ---------- */
export function CalendarioSection(p: CalendarioSectionProps) {
    const { D, upd, L } = p;
    const [leave, setLeave] = useState<Leave | null>(null);
    const [qy, setQy] = useState("");
    const hdr = useRef<HTMLDivElement>(null);
    const [hdrH, setHdrH] = useState(0);
    useEffect(() => {
        const el = hdr.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setHdrH(el.offsetHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => setQy(""), [D?.kind, D?.mode]);

    const edit = D?.mode === "edit";
    const dirty = !!D && D.orig !== snap(D);
    const exit = () => (dirty ? setLeave({ why: "exit" }) : p.onExit());

    const crumbs = (
        <div className={s.itop}>
            <nav className={s.icrumb} aria-label="Percorso">
                <Button size="sm" variant="ghost" onClick={exit}>
                    Calendario
                </Button>
                <ChevronRight size={14} aria-hidden />
                {D ? (
                    <>
                        {edit ? (
                            <span className={s.icr}>Modifica</span>
                        ) : (
                            <Button size="sm" variant="ghost" onClick={() => (dirty ? setLeave({ why: "root" }) : p.onRoot())}>
                                Aggiungi
                            </Button>
                        )}
                        <ChevronRight size={14} aria-hidden />
                        <b>
                            {KIND_LABEL[D.kind]}
                            {edit ? " · " + draftLabel(D, L) : ""}
                        </b>
                    </>
                ) : (
                    <b>Aggiungi</b>
                )}
            </nav>
            <Button size="sm" variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={exit}>
                Torna al calendario
            </Button>
        </div>
    );

    const steps = sectionSteps(L.multi);
    const title = !D ? "Cosa vuoi mettere in calendario?" : edit ? "Modifica · " + draftLabel(D, L) : ADD_T[D.kind];
    const head = (
        <div className={s.ihead}>
            <h2>{title}</h2>
            {D && (
                <p className={s.muted}>
                    {edit ? "Le modifiche si vedono nell'anteprima e vanno in onda quando salvi." : (steps.length === 4 ? "Quattro" : "Tre") + " passi; nell'anteprima vedi già dove va in onda."}
                </p>
            )}
        </div>
    );

    if (!D)
        return (
            <div className={s.isec}>
                <div className={s.ihdr} ref={hdr}>
                    {p.toast}
                    {crumbs}
                    {head}
                </div>
                {p.kept && (
                    <div className={`${s.hnote} ${s.ikept}`}>
                        <Bookmark size={15} aria-hidden />
                        <span>Hai lasciato a metà «{ADD_T[p.kept.kind]}».</span>
                        <Button size="sm" variant="secondary" onClick={p.onResume}>
                            Riprendi
                        </Button>
                    </div>
                )}
                <div className={s.ikinds}>
                    {CAL_KINDS.map(k => (
                        <button key={k} type="button" className={s.ikind} style={{ "--c": p.kindColor[k] } as CSSProperties} onClick={() => p.onKind(k)}>
                            <span className={s.iki}>{KICON[k]}</span>
                            <b>{KIND_LABEL[k]}</b>
                            <span className={s.muted}>{KDESC[k]}</span>
                            <span className={s.badge}>
                                {p.counts[k]} {isDish(k) ? "piatti " : ""}in calendario
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        );

    const miss = missing(D, L), bad = invalid(D), last = D.step === steps.length - 1, blocked = miss || bad;
    const body = [cosa, quando, ...(L.multi ? [dove] : []), riep][D.step]();
    const next = () =>
        upd(d => {
            if (d.step === 0 && miss) {
                d.tried = true;
                return;
            }
            d.step = Math.min(steps.length - 1, d.step + 1);
            d.seen = Math.max(d.seen, d.step);
        });
    const save = () => {
        if (miss) {
            upd(d => {
                d.step = 0;
                d.tried = true;
            });
            return;
        }
        if (!bad) p.onSave();
    };

    return (
        <div className={s.isec} style={{ "--ihdr": hdrH + "px" } as CSSProperties}>
            <div className={s.ihdr} ref={hdr}>
                {p.toast}
                {crumbs}
                {head}
                <div className={s.istrow}>
                    <ol className={s.isteps}>
                        {steps.map((n, i) => {
                            const can = edit || i <= D.seen, done = !edit && i < D.step;
                            return (
                                <li key={n}>
                                    <button
                                        type="button"
                                        aria-current={i === D.step ? "step" : undefined}
                                        aria-label={`${i + 1} ${n}${done ? ", fatto" : ""}`}
                                        className={done ? s.done : ""}
                                        disabled={!can}
                                        onClick={() => upd(d => void (d.step = i))}
                                    >
                                        <span className={s.idot}>{done ? <Check size={13} aria-hidden /> : i + 1}</span>
                                        {n}
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    <span className={`${s.hfa} ${s.iacts2}`}>
                        {last && blocked && <span className={s.muted}>{miss || bad}</span>}
                        <Button size="sm" variant="ghost" onClick={exit}>
                            Annulla
                        </Button>
                        {D.step > 0 && (
                            <Button size="sm" variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => upd(d => void (d.step = Math.max(0, d.step - 1)))}>
                                Indietro
                            </Button>
                        )}
                        {!last && (
                            <Button size="sm" variant={edit ? "secondary" : "primary"} rightIcon={<ArrowRight size={16} />} onClick={next}>
                                Avanti
                            </Button>
                        )}
                        {(edit || last) && (
                            <Button size="sm" variant="primary" loading={p.busy} disabled={!!blocked} onClick={save}>
                                {edit ? "Salva modifiche" : "Aggiungi al calendario"}
                            </Button>
                        )}
                    </span>
                </div>
            </div>
            <div className={s.igrid}>
                <div className={s.iform}>
                    {body}
                    {edit && (
                        <div className={s.idel}>
                            <Button size="sm" variant="ghost" className={s.dangerT} leftIcon={<Trash2 size={16} />} onClick={() => setLeave({ why: "del" })}>
                                Togli dal calendario
                            </Button>
                        </div>
                    )}
                </div>
                {p.preview}
            </div>
            {leave && dialog(leave)}
        </div>
    );

    /* ---------- Cosa ---------- */
    function cosa() {
        const d = D!;
        const warn = d.tried && miss ? <Warn>{miss}.</Warn> : null;
        if (isDish(d.kind)) {
            const qq = qy.toLowerCase().trim();
            const cats = new Map<string, PickProduct[]>();
            for (const x of p.pickList) {
                if (qq && !x.name.toLowerCase().includes(qq)) continue;
                const c = x.category ?? "Senza categoria";
                if (!cats.has(c)) cats.set(c, []);
                cats.get(c)!.push(x);
            }
            const n = d.picks.length, ex = d.picks[0] ? L.products.get(d.picks[0]) : undefined;
            const pick = (x: PickProduct) =>
                upd(dd => {
                    const i = dd.picks.indexOf(x.id);
                    if (i >= 0) {
                        dd.picks.splice(i, 1);
                        return;
                    }
                    dd.picks.push(x.id);
                    dd.picks = sortPicks(dd.picks, L);
                    if (dd.kind === "price" && !x.formats.length && dd.prices[x.id] == null && x.listPrice != null)
                        dd.prices[x.id] = Math.round(x.listPrice * 0.8 * 2) / 2;
                });
            const priceIn = (k: string, label: string) => (
                <span className={s.hfld}>
                    <input
                        type="number"
                        step="0.5"
                        min="0"
                        className={`${s.hin} ${s.sm}`}
                        value={d.prices[k] ?? ""}
                        aria-label={label}
                        onChange={ev => {
                            const v = ev.target.value === "" ? null : Number(ev.target.value);
                            upd(dd => void (dd.prices[k] = v != null && Number.isFinite(v) ? v : null));
                        }}
                    />{" "}
                    €
                </span>
            );
            const exPrice = ex ? d.prices[priceKeys(ex, ex.id)[0]] : null;
            const badStrike = d.kind === "price" && d.strike && d.picks.some(id => {
                const x = L.products.get(id);
                return x && x.listPrice != null && d.prices[id] != null && d.prices[id]! >= x.listPrice;
            });
            return (
                <>
                    <div className={s.ifl}>
                        <h4>{d.kind === "price" ? "Quali piatti e a quanto" : "Quali piatti"}</h4>
                        <input className={`${s.hin} ${s.wide}`} type="search" placeholder="Cerca un piatto" value={qy} aria-label="Cerca un piatto" onChange={ev => setQy(ev.target.value)} />
                        <div className={s.hlist}>
                            {[...cats.entries()].map(([c, xs]) => (
                                <div key={c}>
                                    <div className={s.hcat}>{c}</div>
                                    {xs.map(x => {
                                        const on = d.picks.includes(x.id);
                                        return (
                                            <div key={x.id}>
                                                <div className={`${s.hrow} ${on ? s.sel : ""}`}>
                                                    <button type="button" className={s.hcb} role="checkbox" aria-checked={on} aria-label={x.name} onClick={() => pick(x)}>
                                                        <span className={s.box}>{on && <Check size={11} aria-hidden />}</span>
                                                    </button>
                                                    <span className={s.hnm}>
                                                        <span>{x.name}</span>
                                                        <span className={s.hsub}>{x.formats.length ? x.formats.map(f => f.name).join(" · ") : x.listPrice != null ? "listino " + eur(x.listPrice) : "senza prezzo"}</span>
                                                    </span>
                                                    <span className={s.heff}>{on && d.kind === "price" && !x.formats.length && priceIn(x.id, "Prezzo nuovo di " + x.name)}</span>
                                                </div>
                                                {on && d.kind === "price" && x.formats.map(f => (
                                                    <div key={f.id} className={`${s.hrow} ${s.sel} ${s.hfmt}`}>
                                                        <span />
                                                        <span className={s.hnm}>
                                                            <span className={s.hsub}>{f.name}</span>
                                                        </span>
                                                        <span className={s.heff}>{priceIn(priceKey(x.id, f.id), `Prezzo nuovo di ${x.name}, ${f.name}`)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                            {!cats.size && <p className={s.muted} style={{ padding: 10 }}>Nessun piatto.</p>}
                        </div>
                        <span className={s.muted}>{n ? n + (n === 1 ? " piatto scelto" : " piatti scelti") : "Nessun piatto scelto"}</span>
                    </div>
                    {d.kind === "price" ? (
                        <div className={s.ifl}>
                            <h4>Come si vede</h4>
                            <SegmentedControl
                                size="sm"
                                value={d.strike ? "1" : "0"}
                                onChange={v => upd(dd => void (dd.strike = v === "1"))}
                                options={[
                                    { value: "1", label: "Sconto" },
                                    { value: "0", label: "Prezzo nuovo" }
                                ]}
                            />
                            {ex && exPrice != null ? (
                                <div className={s.hprev}>
                                    <span className={s.muted}>{ex.name}, il cliente vede</span>
                                    {d.strike && ex.listPrice != null && <s>{eur(ex.listPrice)}</s>}
                                    <b>{eur(exPrice)}</b>
                                </div>
                            ) : (
                                <p className={s.muted}>{d.strike ? "Il vecchio prezzo barrato e accanto il nuovo." : "Solo il prezzo nuovo, senza barra."}</p>
                            )}
                            {badStrike && <Warn>Un prezzo non è più basso del listino: barrato sembrerebbe uno sconto che non c'è. Meglio «Prezzo nuovo».</Warn>}
                        </div>
                    ) : (
                        <div className={s.ifl}>
                            <h4>Come</h4>
                            <SegmentedControl
                                size="sm"
                                value={d.hide}
                                onChange={v => upd(dd => void (dd.hide = v))}
                                options={[
                                    { value: "hide", label: "Non si vede" },
                                    { value: "disable", label: "Non ordinabile" }
                                ]}
                            />
                            <p className={s.muted}>{d.hide === "hide" ? "Il piatto sparisce dal menù." : "Il piatto resta nel menù, spento: si vede ma non si ordina."}</p>
                        </div>
                    )}
                    {warn}
                </>
            );
        }
        const list = d.kind === "menu" ? p.catalogs : d.kind === "style" ? p.styles : p.featured;
        const nw = NEW_THING[d.kind]!;
        const newLink = (
            <>
                <Button size="sm" variant="ghost" className={s.ilink} leftIcon={<Plus size={16} />} rightIcon={<ArrowUpRight size={14} />} onClick={() => setLeave({ why: "new", to: d.kind })}>
                    {nw[0]}
                </Button>
                <p className={s.muted}>
                    {d.kind === "menu" ? "Si crea nella pagina Menù, dove scegli se è classico o multi: si esce dal Calendario." : `Si crea nella sua pagina, ${nw[1]}: si esce dal Calendario.`}
                </p>
            </>
        );
        const pair =
            d.kind === "menu" || d.kind === "style" ? (
                <div className={s.ifl}>
                    <h4>{d.kind === "menu" ? "Con lo stile" : "Con il menù"}</h4>
                    <select
                        className={`${s.hin} ${s.wide}`}
                        aria-label={d.kind === "menu" ? "Lo stile che va col menù" : "Il menù che va con lo stile"}
                        value={d.pair ?? ""}
                        onChange={ev => upd(dd => void (dd.pair = ev.target.value || null))}
                    >
                        {!d.pair && <option value="">Scegli</option>}
                        {(d.kind === "menu" ? p.styles : p.catalogs).map(x => (
                            <option key={x.id} value={x.id}>
                                {x.name}
                            </option>
                        ))}
                    </select>
                    <p className={s.muted}>
                        Oggi menù e stile stanno nella stessa regola: {d.kind === "menu" ? "lo stile" : "il menù"} va in onda insieme, nelle stesse ore. Separati {DB_LATER}.
                    </p>
                </div>
            ) : null;
        if (d.kind === "menu")
            return (
                <>
                    <div className={s.ifl}>
                        <h4>Quale menù</h4>
                        <div className={s.imenus} role="radiogroup" aria-label="Scegli un menù">
                            {list.map(x => (
                                <button
                                    key={x.id}
                                    type="button"
                                    className={s.imr}
                                    role="radio"
                                    aria-checked={d.thing === x.id}
                                    style={{ "--c": p.colorOf("menu", x.name) } as CSSProperties}
                                    onClick={() => upd(dd => void (dd.thing = x.id))}
                                >
                                    <span className={s.sq} />
                                    <span className={s.imn}>
                                        <b>{x.name}</b>
                                    </span>
                                    <span className={s.badge}>Menù classico</span>
                                </button>
                            ))}
                        </div>
                        <p className={s.muted}>
                            Nelle sue ore i clienti vedono solo il menù che scegli. Per farne vedere più di uno insieme, scegli un multi menù: il cliente trova un riquadro per menù.
                        </p>
                        <p className={`${s.muted} ${s.ilater}`}>
                            <Layers size={13} aria-hidden /> Il multi menù {DB_LATER}.
                        </p>
                        {newLink}
                    </div>
                    {pair}
                    {warn}
                </>
            );
        return (
            <>
                <div className={s.ifl}>
                    <h4>{d.kind === "style" ? "Quale stile" : "Quale In evidenza"}</h4>
                    <div className={s.ichoices} role="radiogroup" aria-label="Scegli">
                        {list.map(x => (
                            <button
                                key={x.id}
                                type="button"
                                className={s.ich}
                                role="radio"
                                aria-checked={d.thing === x.id}
                                style={{ "--c": p.colorOf(d.kind, x.name) } as CSSProperties}
                                onClick={() => upd(dd => void (dd.thing = x.id))}
                            >
                                <span className={s.sq} />
                                {x.name}
                            </button>
                        ))}
                    </div>
                    {newLink}
                </div>
                {pair}
                {warn}
            </>
        );
    }

    /* ---------- Quando ---------- */
    function quando() {
        const d = D!, w = d.when, cur = whenKey(w), days = w.days ?? [0, 1, 2, 3, 4, 5, 6];
        const dk = !w.days ? "all" : w.days.join("") === "01234" ? "w5" : w.days.join("") === "56" ? "we" : "";
        const today = todayNum();
        const setDays = (ds: number[] | undefined) =>
            upd(dd => {
                if (!ds || ds.length === 7) delete dd.when.days;
                else dd.when.days = ds;
            });
        const durs = p.durs(d.kind);
        return (
            <>
                {durs.length > 0 && (
                    <div className={s.ifl}>
                        <h4>Usa una durata che c'è già</h4>
                        <div className={s.chips}>
                            {durs.map(ww => (
                                <button key={whenKey(ww)} type="button" className={s.chip} aria-pressed={whenKey(ww) === cur} onClick={() => upd(dd => void (dd.when = structuredClone(ww)))}>
                                    {durLabel(ww)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className={s.ifl}>
                    <h4>Periodo</h4>
                    <SegmentedControl
                        size="sm"
                        value={w.period ? "periodo" : "sempre"}
                        onChange={v =>
                            upd(dd => {
                                if (v === "periodo") dd.when.period ??= { from: today, to: today + 30 };
                                else delete dd.when.period;
                            })
                        }
                        options={[
                            { value: "sempre", label: "Sempre" },
                            { value: "periodo", label: "Dal… al…" }
                        ]}
                    />
                    {w.period ? (
                        <div className={s.hrowf}>
                            <label className={s.hfld}>
                                Dal{" "}
                                <input type="date" className={s.hin} value={isoDay(w.period.from)} onChange={ev => setDate("from", ev.target.value)} />
                            </label>
                            <label className={s.hfld}>
                                al <input type="date" className={s.hin} value={isoDay(w.period.to)} onChange={ev => setDate("to", ev.target.value)} />
                            </label>
                        </div>
                    ) : (
                        <p className={s.muted}>Senza una data di fine.</p>
                    )}
                    {bad && bad.startsWith("La fine") && <Warn>{bad}.</Warn>}
                </div>
                <div className={s.ifl}>
                    <h4>Giorni</h4>
                    <div className={s.chips}>
                        {(
                            [
                                ["all", "Tutti", undefined],
                                ["w5", "Lun–Ven", [0, 1, 2, 3, 4]],
                                ["we", "Sab e Dom", [5, 6]]
                            ] as const
                        ).map(([v, l, ds]) => (
                            <button key={v} type="button" className={s.chip} aria-pressed={dk === v} onClick={() => setDays(ds ? [...ds] : undefined)}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <div className={s.chips} role="group" aria-label="Giorni">
                        {DAYS.map((n, i) => (
                            <button
                                key={n}
                                type="button"
                                className={s.chip}
                                aria-pressed={days.includes(i)}
                                onClick={() => {
                                    const ds = [...days], j = ds.indexOf(i);
                                    if (j < 0) ds.push(i);
                                    else if (ds.length > 1) ds.splice(j, 1);
                                    setDays(ds.sort((a, b) => a - b));
                                }}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={s.ifl}>
                    <h4>Orario</h4>
                    <SegmentedControl
                        size="sm"
                        value={w.ranges ? "0" : "1"}
                        onChange={v =>
                            upd(dd => {
                                if (v === "1") delete dd.when.ranges;
                                else dd.when.ranges = [[12 * 60, 15 * 60]];
                            })
                        }
                        options={[
                            { value: "1", label: "Tutto il giorno" },
                            { value: "0", label: "Fasce orarie" }
                        ]}
                    />
                    {w.ranges?.map((r, j) => (
                        <div key={j} className={`${s.hrowf} ${s.irange}`}>
                            <label className={s.hfld}>
                                Dalle <TimeSel v={r[0]} max={1440 - FSLOT} onChange={m => upd(dd => void (dd.when.ranges![j][0] = m))} />
                            </label>
                            <label className={s.hfld}>
                                alle <TimeSel v={r[1]} min={FSLOT} max={1440} onChange={m => upd(dd => void (dd.when.ranges![j][1] = m))} />
                            </label>
                            {w.ranges!.length > 1 && (
                                <IconButton size="sm" icon={<X size={14} />} aria-label={`Togli la fascia ${hhmm(r[0])}–${hhmm(r[1])}`} onClick={() => upd(dd => void dd.when.ranges!.splice(j, 1))} />
                            )}
                        </div>
                    ))}
                    {w.ranges && w.ranges.length < 4 && (
                        <span className={s.ilaterrow}>
                            <Button size="sm" variant="ghost" className={s.ilink} leftIcon={<Plus size={16} />} disabled={!DB_TODAY.multiRange} onClick={addRange}>
                                Aggiungi una fascia
                            </Button>
                            {!DB_TODAY.multiRange && <span className={s.muted}>Più fasce {DB_LATER}.</span>}
                        </span>
                    )}
                    <Band w={w} axis={p.band} upd={upd} />
                    {w.ranges && (
                        <p className={s.muted}>
                            Trascina le barre per spostare le fasce, a 15 minuti per volta.{" "}
                            {DB_TODAY.overnight ? "Anche dopo mezzanotte: fino alle 02:00 è la stessa serata." : `Dopo mezzanotte ${DB_LATER}.`}
                        </p>
                    )}
                    {bad && bad.startsWith("Una fascia") && <Warn>{bad}.</Warn>}
                </div>
            </>
        );
        function setDate(edge: "from" | "to", v: string) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
            if (!m) return;
            const n = dayNum(+m[1], +m[2] - 1, +m[3]);
            upd(dd => {
                if (dd.when.period) dd.when.period[edge] = n;
            });
        }
        function addRange() {
            upd(dd => {
                const rs = dd.when.ranges!, e = Math.max(...rs.map(r => r[1]));
                rs.push(e <= 18 * 60 ? [19 * 60, 22 * 60] : [Math.min(e + 60, 1440 - 60), Math.min(e + 180, 1440)]);
                normRanges(rs);
            });
        }
    }

    /* ---------- Dove ---------- */
    function dove() {
        const d = D!, w = d.where;
        const set = w.all
            ? p.sedi.map(x => x.id)
            : w.groupIds.length
              ? [...new Set(w.groupIds.flatMap(g => p.groups.find(x => x.id === g)?.activityIds ?? []))]
              : w.activityIds;
        return (
            <div className={s.ifl}>
                <h4>Dove</h4>
                <div className={s.chips}>
                    <button type="button" className={s.chip} aria-pressed={w.all} onClick={() => upd(dd => void (dd.where = { all: true, activityIds: [], groupIds: [] }))}>
                        Tutte le sedi
                    </button>
                    {p.groups.map(g => (
                        <button
                            key={g.id}
                            type="button"
                            className={s.chip}
                            aria-pressed={!w.all && w.groupIds.length === 1 && w.groupIds[0] === g.id && !w.activityIds.length}
                            onClick={() => upd(dd => void (dd.where = { all: false, activityIds: [], groupIds: [g.id] }))}
                        >
                            <Folder size={13} aria-hidden />
                            {g.name}
                        </button>
                    ))}
                </div>
                <div className={s.isedi}>
                    {p.sedi.map(x => {
                        const on = set.includes(x.id);
                        return (
                            <button
                                key={x.id}
                                type="button"
                                className={s.gsc}
                                role="checkbox"
                                aria-checked={on}
                                onClick={() =>
                                    upd(dd => {
                                        const next = on ? set.filter(y => y !== x.id) : [...set, x.id];
                                        dd.where = next.length === p.sedi.length ? { all: true, activityIds: [], groupIds: [] } : { all: false, activityIds: p.sedi.map(y => y.id).filter(y => next.includes(y)), groupIds: [] };
                                    })
                                }
                            >
                                <span className={s.box}>{on && <Check size={11} aria-hidden />}</span>
                                {x.name}
                            </button>
                        );
                    })}
                </div>
                <p className={s.muted}>{whereText(w, L)}. Quello che vale per una sede vince su quello che vale per tutte.</p>
                {bad === "Scegli almeno una sede" && <Warn>{bad}.</Warn>}
            </div>
        );
    }

    /* ---------- Riepilogo ---------- */
    function riep() {
        const d = D!;
        const rows: [string, string, number][] = [
            ["Cosa", listIt(whatLines(d, L)) || "—", 0],
            ["Quando", durLabel(d.when), 1],
            ...(L.multi ? ([["Dove", whereText(d.where, L), 2]] as [string, string, number][]) : [])
        ];
        const pn = pairName(d, L);
        return (
            <>
                <div className={s.ifl}>
                    <h4>In una frase</h4>
                    <p className={s.isent}>{sentence(d, L)}</p>
                    {miss && <Warn>{miss}: torna a Cosa.</Warn>}
                    {!miss && bad && <Warn>{bad}.</Warn>}
                    <dl className={s.isum}>
                        {rows.map(([t, v, i]) => (
                            <div key={t}>
                                <dt>{t}</dt>
                                <dd>{v}</dd>
                                <Button size="sm" variant="ghost" aria-label={`Cambia ${t}`} onClick={() => upd(dd => void (dd.step = i))}>
                                    Cambia
                                </Button>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className={s.ifl}>
                    <h4>Nome della regola</h4>
                    <input
                        className={`${s.hin} ${s.wide}`}
                        value={d.name ?? autoName(d, L)}
                        aria-label="Nome della regola"
                        onChange={ev => {
                            const v = ev.target.value;
                            upd(dd => void (dd.name = v.trim() && v !== autoName(dd, L) ? v : null));
                        }}
                    />
                    <p className={s.muted}>
                        {d.name ? "Il nome che hai scritto tu." : "Lo mettiamo noi dalle tue scelte e cambia con loro; se lo riscrivi, resta il tuo."} Si legge nell'Elenco.
                    </p>
                </div>
                <div className={s.ifl}>
                    <h4>Cosa cambia nel calendario</h4>
                    <ul className={s.ieff}>
                        {p.effect.map((x, i) => (
                            <li key={i}>{x}</li>
                        ))}
                        {pn && !miss && (
                            <li>
                                Insieme va in onda {d.kind === "menu" ? "lo stile" : "il menù"} «{pn}», che oggi sta nella stessa regola.
                            </li>
                        )}
                    </ul>
                </div>
                {d.before && (
                    <div className={s.ifl}>
                        <h4>Prima era</h4>
                        <p className={s.muted}>{d.before}</p>
                    </div>
                )}
            </>
        );
    }

    /* ---------- prima di uscire: salva, esci senza salvare, o resta ---------- */
    function dialog(l: Leave) {
        const d = D!, ok = !miss && !bad, nos = "Quello che hai scelto non è ancora salvato.";
        let t: string, txt: string, btns: ReactNode;
        const stay = (
            <Button size="sm" variant="secondary" onClick={() => setLeave(null)}>
                {l.why === "del" ? "Annulla" : "Resta qui"}
            </Button>
        );
        const discard = (danger: boolean) => (
            <Button
                size="sm"
                variant={danger ? "danger" : "secondary"}
                onClick={() => {
                    setLeave(null);
                    if (l.why === "root") p.onRoot();
                    else if (l.why === "new") p.onGoNew(l.to!);
                    else p.onExit();
                }}
            >
                Esci senza salvare
            </Button>
        );
        if (l.why === "del") {
            t = "Togliere dal calendario?";
            txt = isDish(d.kind) ? "Questi piatti tornano come da listino." : `«${draftLabel(d, L)}» non andrà più in onda.`;
            btns = (
                <>
                    {stay}
                    <Button size="sm" variant="danger" loading={p.busy} onClick={() => { setLeave(null); p.onDrop(); }}>
                        Togli
                    </Button>
                </>
            );
        } else if (l.why === "new") {
            t = `Vai a ${NEW_THING[l.to!]![1]} per crearne uno nuovo?`;
            txt = "Esci dal Calendario. " + nos;
            btns = (
                <>
                    {stay}
                    {discard(false)}
                    {ok ? (
                        <Button size="sm" variant="primary" loading={p.busy} onClick={() => { setLeave(null); p.onSave(l.to); }}>
                            Salva e vai
                        </Button>
                    ) : (
                        <Button size="sm" variant="primary" onClick={() => { setLeave(null); p.onKeep(l.to!); }}>
                            Tieni da parte e vai
                        </Button>
                    )}
                </>
            );
        } else {
            t = "Uscire senza salvare?";
            txt = nos + " Se esci, lo perdi.";
            btns = (
                <>
                    {stay}
                    {discard(!ok)}
                    {ok && (
                        <Button size="sm" variant="primary" loading={p.busy} onClick={() => { setLeave(null); p.onSave(); }}>
                            {edit ? "Salva modifiche" : "Aggiungi"} ed esci
                        </Button>
                    )}
                </>
            );
        }
        return (
            <div className={s.iscrim} onKeyDown={ev => ev.key === "Escape" && setLeave(null)}>
                <div className={s.idlg} role="alertdialog" aria-modal="true" aria-labelledby="cal-idlgt" aria-describedby="cal-idlgp">
                    <h3 id="cal-idlgt">{t}</h3>
                    <p id="cal-idlgp">{txt}</p>
                    {l.why === "new" && !ok && <p className={s.muted}>«Tieni da parte» la conserva: la riprendi da «Aggiungi» quando torni.</p>}
                    <div className={s.idf}>{btns}</div>
                </div>
            </div>
        );
    }
}

const todayNum = () => {
    const r = new Date();
    return dayNum(r.getFullYear(), r.getMonth(), r.getDate());
};

function Warn({ children }: { children: ReactNode }) {
    return (
        <p className={s.hwarn}>
            <TriangleAlert size={15} aria-hidden />
            <span>{children}</span>
        </p>
    );
}

function TimeSel({ v, onChange, min = 0, max }: { v: number; onChange: (m: number) => void; min?: number; max: number }) {
    const opts: number[] = [];
    for (let m = min; m <= max; m += FSLOT) opts.push(m);
    if (!opts.includes(v)) opts.push(v);
    opts.sort((a, b) => a - b);
    return (
        <select className={s.hin} value={v} onChange={ev => onChange(Number(ev.target.value))}>
            {opts.map(m => (
                <option key={m} value={m}>
                    {m === 1440 ? "24:00" : hhmm(m)}
                </option>
            ))}
        </select>
    );
}

/* le fasce si trascinano sulla barra, a quarti d'ora */
function Band({ w, axis, upd }: { w: CalWhen; axis: Axis; upd: (fn: (d: Draft) => void) => void }) {
    const A0 = Math.min(axis.from, ...(w.ranges ?? []).map(r => Math.floor(r[0] / 60) * 60));
    const A1 = DB_TODAY.overnight ? axis.to : 1440;
    const X = (m: number) => ((Math.max(A0, Math.min(A1, m)) - A0) / (A1 - A0)) * 100;
    const rs = w.ranges ?? [[A0, A1] as [number, number]];
    const drag = !!w.ranges;
    const bd = useRef<{ j: number; mode: "l" | "r" | "m"; x0: number; w: number; orig: [number, number] } | null>(null);
    const ticks: number[] = [];
    for (let m = A0; m <= A1; m += 120) ticks.push(m);
    const down = (j: number, mode: "l" | "r" | "m") => (ev: RPointerEvent<HTMLElement>) => {
        ev.preventDefault();
        ev.stopPropagation();
        const track = (ev.currentTarget.closest("[data-band]") as HTMLElement).getBoundingClientRect();
        bd.current = { j, mode, x0: ev.clientX, w: track.width, orig: [rs[j][0], rs[j][1]] };
        document.body.classList.add(s.ibdrag);
        const move = (e: PointerEvent) => {
            const b = bd.current;
            if (!b) return;
            const dm = Math.round(((e.clientX - b.x0) / b.w) * ((A1 - A0) / FSLOT)) * FSLOT, [a, z] = b.orig;
            upd(dd => {
                const r = dd.when.ranges?.[b.j];
                if (!r) return;
                if (b.mode === "m") {
                    const dl = Math.max(A0 - a, Math.min(A1 - z, dm));
                    r[0] = a + dl;
                    r[1] = z + dl;
                } else if (b.mode === "l") r[0] = Math.max(A0, Math.min(z - FSLOT, a + dm));
                else r[1] = Math.min(A1, Math.max(a + FSLOT, z + dm));
            });
        };
        const up = () => {
            bd.current = null;
            document.body.classList.remove(s.ibdrag);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            upd(dd => dd.when.ranges && normRanges(dd.when.ranges));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };
    return (
        <div className={`${s.iband} ${drag ? s.drag : ""}`} aria-hidden="true">
            <div className={s.ibt} data-band>
                {rs.map(([a, b], j) =>
                    drag ? (
                        <i key={j} data-tip={`${hhmm(a)}–${b === 1440 ? "24:00" : hhmm(b)}\n~Trascina per spostarla, dai bordi per allungarla o accorciarla. A passi di 15 minuti.`} style={{ left: X(a) + "%", width: X(b) - X(a) + "%" }} onPointerDown={down(j, "m")}>
                            <b className={`${s.ibh} ${s.l}`} onPointerDown={down(j, "l")} />
                            <b className={`${s.ibh} ${s.r}`} onPointerDown={down(j, "r")} />
                        </i>
                    ) : (
                        <i key={j} style={{ left: X(a) + "%", width: X(b) - X(a) + "%" }} />
                    )
                )}
            </div>
            <div className={s.ibl}>
                {ticks.map(m => (
                    <span key={m} style={{ left: X(m) + "%" }}>
                        {(m / 60) % 24}
                    </span>
                ))}
            </div>
        </div>
    );
}
