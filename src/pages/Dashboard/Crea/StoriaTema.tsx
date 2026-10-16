// La storia sta con la cosa che racconta (D191): un prodotto, o il locale.
// Niente sedi e niente orari: al loro posto «Di cosa parla» e «In onda?».
import { useId, useState } from "react";
import { CirclePause, Radio, Search, Store, TriangleAlert, Utensils } from "lucide-react";
import { whereText, type DraftLookups, type PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { durLabel, q, type CalWhen, type CalWhere } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { aboutPlace, euro, type Tunnel } from "./creaModel";
import { Opt, Pick, Sh } from "./CreaUi";
import { OndaOff, type U } from "./CreaSteps";
import s from "./Crea.module.scss";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Un menù in onda che contiene il prodotto: la storia si vede lì, nelle sue sedi e ore. */
export type OnAir = { menu: string; where: CalWhere; when: CalWhen };

export function StoriaTema({ t, u, L, pick, menusOf, menusReady, sedi, business }: { t: Tunnel; u: U; L: DraftLookups; pick: readonly PickProduct[]; menusOf: ReadonlyMap<string, string[]>; menusReady: boolean; sedi: readonly { id: string; name: string }[]; business: string }) {
    const [find, setFind] = useState("");
    const fid = useId();
    const f = norm(find.trim());
    const rows = pick.filter(p => !f || norm(p.name).includes(f));
    const where = business || "il tuo locale";
    return (
        <>
            <Sh title="Di cosa parla">La storia sta con la cosa che racconta: chi apre quella cosa, la trova lì.</Sh>
            <div className={s.opts} data-bad="about">
                <Opt on={t.about === "prod"} icon={<Utensils size={16} />} title="Un prodotto" text="Un piatto, un vino, un dolce: la storia compare in fondo alla sua scheda." onClick={() => u(x => void (x.about = "prod"))} />
                <Opt on={t.about === "loc"} icon={<Store size={16} />} title="Il locale" text={L.multi ? "Una sede: la storia compare nella sua pagina, sotto il menù." : `La storia compare nella pagina di ${where}, sotto il menù.`} onClick={() => u(x => void (x.about = "loc"))} />
            </div>
            {t.about === "prod" && (
                <div className={s.blk}>
                    <h4>Quale prodotto?</h4>
                    <div className={s.srch}>
                        <Search size={15} aria-hidden />
                        <input className={s.in} id={fid} value={find} placeholder={`Cerca tra i ${pick.length} prodotti`} aria-label="Cerca un prodotto" autoComplete="off" onChange={e => setFind(e.target.value)} />
                    </div>
                    <div className={cx(s.list, s.lmax)} role="radiogroup" aria-label="Prodotti" data-bad="prodlist">
                        {rows.map(p => {
                            const on = t.linked === p.id, ms = (menusOf.get(p.id) ?? []).map(id => L.catalogs.get(id)).filter((x): x is string => !!x);
                            return (
                                <button key={p.id} type="button" className={s.lpick} role="radio" aria-checked={on} onClick={() => u(x => void (x.linked = p.id))}>
                                    <span className={cx(s.box, s.radio, on && s.on)} />
                                    <span className={s.lpn}>{p.name}</span>
                                    <span className={s.sub}>
                                        {/* finché i menù non sono arrivati, niente «In nessun menù» */}
                                        {[ms.length ? ms.join(", ") : menusReady ? "In nessun menù" : null, p.listPrice != null ? euro(p.listPrice) : null].filter(Boolean).join(" · ")}
                                    </span>
                                </button>
                            );
                        })}
                        {!rows.length && <p className={cx(s.hint, s.lnone)}>Nessun prodotto con {q(find)}.</p>}
                    </div>
                    <p className={s.hint}>
                        {rows.length} di {pick.length}. Accanto al nome, i menù in cui c'è.
                    </p>
                </div>
            )}
            {t.about === "loc" &&
                (L.multi ? (
                    <div className={s.blk}>
                        <h4>Quale sede?</h4>
                        <div className={s.list} role="radiogroup" aria-label="Sedi" data-bad="sedelist">
                            {sedi.map(x => {
                                const on = t.sede === x.id;
                                return (
                                    <button key={x.id} type="button" className={s.lpick} role="radio" aria-checked={on} onClick={() => u(d => void (d.sede = x.id))}>
                                        <span className={cx(s.box, s.radio, on && s.on)} />
                                        <span className={s.lpn}>{business ? `${business} · ${x.name}` : x.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className={s.hint}>Una sede per storia. Per raccontare tutto il locale in ogni sede c'è il cappello, in cima all'elenco «Storie».</p>
                    </div>
                ) : (
                    <p className={s.hint}>Hai una sede sola: la storia va nella pagina di {where}.</p>
                ))}
        </>
    );
}

export function StoriaOnda({ t, u, L, onAir }: { t: Tunnel; u: U; L: DraftLookups; onAir: readonly OnAir[] }) {
    const prod = t.about === "prod", place = aboutPlace(t, L);
    const name = q((prod && L.products.get(t.linked)?.name) || "…");
    return (
        <>
            <Sh title="In onda?">{`Niente sedi e niente orari: la storia si vede ${place}, ${prod ? "dove e quando il prodotto è nel menù" : "sempre"}.`}</Sh>
            <div className={s.ask} data-bad="ask">
                <p>{`Vuoi che i clienti la vedano${t.edit ? "" : " appena salvi"}?`}</p>
                <div className={cx(s.ondaPick, t.onda ? s.made : s.fresh)}>
                    <Pick
                        on={t.onda === "on"}
                        lead
                        icon={<Radio size={18} />}
                        title="Sì, la metto in onda"
                        text={prod ? `Compare nella scheda di ${name}, in ogni sede e a ogni ora in cui il prodotto è nel menù.` : `Compare nella pagina ${L.multi && t.sede ? "di " + q(L.sedi.get(t.sede) ?? "Sede") : "del locale"}, sempre.`}
                        onClick={() => u(x => void (x.onda = "on"))}
                    />
                    <Pick on={t.onda === "off"} icon={<CirclePause size={18} />} title="No, per ora la tengo pronta" text="La salvi completa e controllata, ma nessun cliente la vede." onClick={() => u(x => void (x.onda = "off"))} />
                </div>
                {t.onda && <p className={s.swap}>Per cambiare idea, tocca l'altro.</p>}
            </div>
            {t.onda === "off" && <OndaOff t={t} />}
            {t.onda === "on" &&
                prod &&
                (onAir.length ? (
                    <div className={s.blk}>
                        <h4>Dove e quando si vede, oggi</h4>
                        <ul className={s.ieff}>
                            {onAir.map((x, i) => (
                                <li key={i}>{`${x.menu} · ${L.multi ? whereText(x.where, L) + " · " : ""}${durLabel(x.when)}`}</li>
                            ))}
                        </ul>
                        <p className={s.hint}>Lo dicono i menù di {name}: se cambiano, la storia li segue da sola.</p>
                    </div>
                ) : (
                    <div className={s.callout}>
                        <TriangleAlert size={16} aria-hidden />
                        <span>{name} oggi non è in nessun menù in onda: la storia è in onda ma nessuno la vede, finché il prodotto non entra in un menù.</span>
                    </div>
                ))}
        </>
    );
}
