// «È uguale per tutte le sedi?»: sotto la scelta «insieme / al posto», le sedi
// dove la bozza si incrocia, una riga per sede; aperta, menù per menù (o stile
// per stile). Aprendo una sede la settimana a destra passa a lei.
import { useState, type CSSProperties } from "react";
import { ArrowRight, Check, ChevronDown, CircleCheck, Eye, Search } from "lucide-react";
import { Button } from "@components/ui/Button/Button";
import { DB_WAIT, listIt, type Impatto, type Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { thingName, type Tunnel } from "./creaModel";
import { hAltri, hCopreText, hDiff, hDiverse, hEsito, hSet, hSolo, hVal, nTutteSedi, type HAltro, type HVal } from "./creaSedePer";
import s from "./Crea.module.scss";

const q = (x: string) => "«" + x + "»";
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type U = (fn: (x: Tunnel) => void) => void;
type Sede = { id: string; name: string };

export function Esito({ t, sede, altri }: { t: Tunnel; sede: string; altri: readonly HAltro[] }) {
    const e = hEsito(t, sede, altri), me = thingName(t);
    const ln = (k: string, v: string) => (
        <span className={s.rl}>
            <span className={s.rk}>{k}</span>
            <span className={s.rv}>{v}</span>
        </span>
    );
    // i menù che stanno da soli: il tuo, al posto di chi; e dove si vede solo l'altro (punto 4)
    if (hSolo(t))
        return (
            <span className={s.res2}>
                {ln("Il cliente vede", me)}
                {e.pos.length > 0 && ln("Al posto di", listIt(e.pos))}
                {altri.filter(a => e.solo.includes(a.con)).map(a => (
                    <span key={a.con} className={s.rl}>
                        <span className={s.rk}>{cap(a.quando)}</span>
                        <span className={s.rv}>solo {a.con}</span>
                    </span>
                ))}
            </span>
        );
    return t.kind === "stile" ? (
        <span className={s.res2}>
            {ln("Lo stile", me)}
            {e.pos.length > 0 && ln("Prende il posto di", listIt(e.pos))}
            {e.ins.length > 0 && ln("Lascia", listIt(e.ins) + " nelle sue ore")}
        </span>
    ) : (
        <span className={s.res2}>
            {ln("Il cliente vede", e.solo.length ? listIt(e.solo) : [me, ...e.ins].join(" + "))}
            {e.solo.length > 0 && ln("Il tuo", "qui, in quelle ore, non si vede")}
            {e.pos.length > 0 && ln("Al posto di", listIt(e.pos))}
        </span>
    );
}

export function Voci({ t, u, sede, altri, colori }: { t: Tunnel; u: U; sede: Sede; altri: readonly HAltro[]; colori?: Impatto["colori"] }) {
    const solo = hSolo(t);
    const opts = (a: HAltro): [HVal, string][] => (solo ? [["pos", thingName(t)], ["ins", cap(a.con)]] : t.kind === "stile" ? [["pos", "Prende il posto"], ["ins", "Lascia l'altro"]] : [["ins", "Insieme"], ["pos", "Al posto"]]);
    return (
        <ul className={s.hms}>
            {altri.map(a => {
                const v = hVal(t, sede.id, a.con), why = hCopreText(t, a, v);
                return (
                    <li key={a.con} className={s.hmn} style={colori?.[a.con] ? ({ "--c": colori[a.con] } as CSSProperties) : undefined}>
                        <span className={s.dot} aria-hidden="true" />
                        <span className={s.hmt}>
                            <b>{a.con}</b>
                            <span>{cap(a.quando) + (solo ? ", sta da solo" : "")}</span>
                        </span>
                        <span className={s.hmc}>
                            {solo && <span className={s.hml}>{cap(a.quando)} si vede</span>}
                            <span className={s.hseg} role="group" aria-label={`${sede.name}, ${a.con}`}>
                                {opts(a).map(([k, l]) => (
                                    <button key={k} type="button" aria-pressed={v === k} onClick={() => u(x => hSet(x, sede.id, a.con, k))}>
                                        {l}
                                    </button>
                                ))}
                            </span>
                        </span>
                        {why && <span className={s.hint}>{why}</span>}
                    </li>
                );
            })}
        </ul>
    );
}

// i giorni della sede aperta in breve: si vedono solo quando la settimana a destra non c'è (sotto i 1100px)
function Giorni({ sede, eff }: { sede: Sede; eff?: Impatto }) {
    const g = eff?.sedi?.find(x => x.id === sede.id)?.giorni;
    if (!g?.length) return null;
    return (
        <ul className={s.hdays} aria-label={`I giorni di ${sede.name}`}>
            {g.map(x => (
                <li key={x.days + x.txt}>
                    <b>{x.days}</b> {x.txt}
                </li>
            ))}
        </ul>
    );
}

export function SedePer({ t, u, scontri, sedi, onSede, eff }: { t: Tunnel; u: U; scontri: readonly Scontro[]; sedi: readonly Sede[]; onSede?: (id: string) => void; eff?: Impatto }) {
    const [open, setOpen] = useState<string | null>(null);
    const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
    const [qv, setQv] = useState("");
    const stile = t.kind === "stile", w = (n: number) => (stile ? (n === 1 ? "stile" : "stili") : "menù");
    const altri = hAltri(scontri);
    const withX = sedi.filter(x => altri.has(x.id)), noX = sedi.filter(x => !altri.has(x.id));
    const hint = <p className={s.hint}>{sedi.length > 1 ? "Aprendo una sede, la settimana a destra passa a lei." : ""}</p>;
    if (t.insieme == null) return <p className={s.hint}>Scegli una risposta: sotto compaiono {sedi.length > 1 ? "le sedi dove si incrocia" : `gli altri ${w(2)} con cui si incrocia`}.</p>;
    // con incroci in una sede sola non c'è niente da tenere uguale: si sceglie lì
    if (withX.length < 2) {
        const x = withX[0];
        if (!x) return null;
        return (
            <div className={s.ifl}>
                <h4>
                    A {x.name}, {stile ? "stile per stile" : "menù per menù"}
                </h4>
                <Voci t={t} u={u} sede={x} altri={altri.get(x.id) ?? []} colori={eff?.colori} />
                <Esito t={t} sede={x.id} altri={altri.get(x.id) ?? []} />
            </div>
        );
    }
    const show = (id: string) => {
        setOpen(id);
        setSeen(p => new Set(p).add(id));
        onSede?.(id);
    };
    const same = (v: "si" | "no") => {
        u(x => {
            x.hSame = v;
            if (v === "si") x.hm = {};
        });
        if (v === "no" && !open && withX[0]) show(withX[0].id);
    };
    // le sedi dove si incrocia: tutte, oppure per nome (oltre quattro, quante)
    const all = withX.length === sedi.length, few = withX.length <= 4;
    const tutte = all ? nTutteSedi(withX.length) : few ? listIt(withX.map(x => x.name)) : `le ${withX.length} sedi con incroci`;
    const inTutte = all ? "In " + tutte : few ? "A " + tutte : `Nelle ${withX.length} sedi con incroci`;
    const cop = withX.filter(x => altri.get(x.id)?.some(a => a.copre)), copCon = [...new Set(cop.flatMap(x => (altri.get(x.id) ?? []).filter(a => a.copre).map(a => q(a.con))))];
    const copNote = !cop.length ? "" : t.insieme ? (stile ? "" : ` Tranne a ${listIt(cop.map(x => x.name))}: lì resta ${listIt(copCon)}, che sta al posto degli altri.`) : ` A ${listIt(cop.map(x => x.name))} oggi vince ${listIt(copCon)}: lì ${DB_WAIT}.`;
    // i menù che stanno da soli: la regola per tutti, nella frase di «Sì, uguale» (punto 4)
    const soli = hSolo(t) ? [...new Set(withX.flatMap(x => (altri.get(x.id) ?? []).map(a => a.con)))] : [];
    const soloRule = !soli.length ? "" : t.insieme ? ` I menù che stanno da soli (${listIt(soli)}) restano da soli nei loro giorni.` : ` Prende il posto anche dei menù che stanno da soli (${listIt(soli)}).`;
    const d = t.insieme, nd = hDiverse(t, altri), ns = withX.filter(x => seen.has(x.id)).length, nxt = withX.find(x => !seen.has(x.id));
    const list = withX.filter(x => !qv || norm(x.name).includes(norm(qv)));
    return (
        <div className={s.ifl}>
            <h4>È uguale per {tutte}?</h4>
            <div className={s.hseg} role="group" aria-label={`È uguale per ${tutte}?`}>
                <button type="button" aria-pressed={t.hSame === "si"} onClick={() => same("si")}>
                    Sì, uguale
                </button>
                <button type="button" aria-pressed={t.hSame === "no"} onClick={() => same("no")}>
                    No, cambia
                </button>
            </div>
            {t.hSame === "si" && (
                <p className={s.hsum}>
                    <Eye size={15} aria-hidden />
                    <span>
                        {inTutte} {q(thingName(t))} {stile ? (d ? "lascia gli altri stili nelle loro ore." : "prende il posto degli altri stili.") : d ? "si vede insieme agli altri menù." : "si vede da solo, al posto degli altri menù."}
                        {soli.length ? (d ? "" : copNote) + soloRule : copNote}
                    </span>
                </p>
            )}
            {t.hSame === "no" && (
                <>
                    <div className={s.hprog}>
                        <p className={s.hpt}>
                            <b>
                                {ns} di {withX.length} sedi viste
                            </b>
                            {nd > 0 && <span> · {nd === 1 ? "1 diversa" : `${nd} diverse`}</span>}
                        </p>
                        <progress className={s.hpbar} aria-label="Sedi viste" max={withX.length} value={ns} />
                        {nxt ? (
                            <Button size="sm" variant="secondary" onClick={() => show(nxt.id)}>
                                Prossima sede: {nxt.name}
                                <ArrowRight size={14} aria-hidden />
                            </Button>
                        ) : (
                            <p className={s.hdone}>
                                <CircleCheck size={14} aria-hidden />
                                Le hai viste tutte.
                            </p>
                        )}
                    </div>
                    {withX.length > 5 && (
                        <label className={s.hsrch}>
                            <Search size={14} aria-hidden />
                            <input type="search" placeholder="Cerca sede" aria-label="Cerca sede" value={qv} onChange={e => setQv(e.target.value)} />
                        </label>
                    )}
                    <ul className={s.hsl}>
                        {list.length === 0 && <li className={s.hint}>Nessuna sede con {q(qv)}.</li>}
                        {list.map(x => {
                            const l = altri.get(x.id) ?? [], on = open === x.id, diff = hDiff(t, x.id, l);
                            return (
                                <li key={x.id} className={s.hs} data-diff={diff || undefined}>
                                    <button type="button" className={s.hh} aria-expanded={on} onClick={() => (on ? setOpen(null) : show(x.id))}>
                                        <span className={s.hn}>
                                            {seen.has(x.id) && <Check size={14} aria-label="vista" />}
                                            <b>{x.name}</b>
                                            {diff && <span className={s.dtag}>diversa</span>}
                                            <span className={s.hc}>
                                                {l.length} {w(l.length)}
                                            </span>
                                        </span>
                                        <Esito t={t} sede={x.id} altri={l} />
                                        <ChevronDown size={16} aria-hidden />
                                    </button>
                                    {on && <Voci t={t} u={u} sede={x} altri={l} colori={eff?.colori} />}
                                    {on && <Giorni sede={x} eff={eff} />}
                                </li>
                            );
                        })}
                    </ul>
                    {noX.length > 0 && (
                        <p className={s.hint}>
                            {noX.length === 1 ? `${noX[0].name} non ha altri ${w(2)}: niente da scegliere.` : `${noX.length} sedi senza incroci (${listIt(noX.map(x => x.name))}): niente da scegliere.`}
                        </p>
                    )}
                    {hint}
                </>
            )}
        </div>
    );
}
