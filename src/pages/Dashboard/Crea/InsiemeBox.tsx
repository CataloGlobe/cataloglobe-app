// La seconda parte del «Quando»: nelle sue ore c'è già un altro menù o un altro
// stile, e si sceglie cosa vede il cliente.
import { Layers, Replace } from "lucide-react";
import { listIt, type Scontro } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { thingName, type Tunnel } from "./creaModel";
import { SedePer } from "./SedePer";
import { hCopreText } from "./creaSedePer";
import s from "./Crea.module.scss";

const q = (x: string) => "«" + x + "»";

/**
 * «In onda insieme» (menù) o «Con gli altri stili»: nelle sue ore c'è già un altro,
 * e si sceglie se stanno insieme o se il tuo prende il posto; sotto, sede per sede (`SedePer`).
 * `sedi`: le sedi della bozza, per dire quelle senza incroci.
 */
/** In modifica: le sedi con un incrocio nuovo (per nome) e la loro chiave, da segnare quando si risponde. */
export type Nuovi = { names: readonly string[]; key: string };

export function InsiemeBox({ t, u: u0, scontri, multi, sedi, onSede, nuovi }: { t: Tunnel; u: (fn: (x: Tunnel) => void) => void; scontri: readonly Scontro[]; multi: boolean; sedi?: readonly { id: string; name: string }[]; onSede?: (id: string) => void; nuovi?: Nuovi }) {
    // una risposta qualsiasi qui dentro vale come risposta agli incroci nuovi
    const u = (fn: (x: Tunnel) => void) =>
        u0(x => {
            fn(x);
            if (nuovi?.names.length) x.hOk = nuovi.key;
        });
    const stile = t.kind === "stile", none = t.insieme == null, name = q(thingName(t));
    // ogni incrocio conta, anche dove oggi vince l'altro (D196): l'utente sceglie sempre
    const altri = new Set(scontri.map(x => x.con)).size, dove = [...new Set(scontri.flatMap(x => x.sedi))];
    const cosa = altri === 1 ? `c'è già ${stile ? "un altro stile" : "un altro menù"}` : `ci sono già altri ${stile ? "stili" : "menù"}`;
    const pk = (v: boolean, title: string, text: string) => (
        <button type="button" className={s.hpk} aria-pressed={!none && t.insieme === v} onClick={() => u(x => void (x.insieme = v))}>
            <b>{title}</b>
            <span>{text}</span>
        </button>
    );
    return (
        <div className={s.hx} data-insieme>
            <p className={s.lead2}>
                {!none && !t.insieme ? <Replace size={18} aria-hidden /> : <Layers size={18} aria-hidden />}
                <b>
                    In quelle ore {cosa}
                    {multi ? (dove.length === 1 ? ` a ${dove[0]}` : ` in ${dove.length} sedi`) : ""}.
                </b>
            </p>
            {nuovi && nuovi.names.length > 0 && (
                <p className={s.hint} data-nuovi>
                    Incrocio nuovo a {listIt([...nuovi.names])}: {multi ? "guarda la sede e scegli." : "scegli."}{nuovi.names.length < dove.length ? " Per gli altri vale la scelta di prima." : ""}
                </p>
            )}
            <div className={s.qq}>
                <b>{stile ? "Che stile prende la pagina in quelle ore?" : "Come li mostri ai clienti?"}</b>
                <div className={s.hpick} data-bad="insieme" role="group" aria-label={stile ? "Prende il posto o lascia l'altro" : "Insieme o al posto"}>
                    {stile ? (
                        <>
                            {pk(false, "Prende il posto degli altri", `In quelle ore tutta la pagina prende ${name}.`)}
                            {pk(true, "Lascia gli altri", "Il tuo va in onda solo fuori dalle loro ore.")}
                        </>
                    ) : (
                        <>
                            {pk(true, "Mettili insieme", "Il cliente li vede tutti e sceglie quale aprire.")}
                            {pk(false, "Mostralo al posto degli altri", `In quelle ore il cliente vede solo ${name}.`)}
                        </>
                    )}
                </div>
            </div>
            {sedi ? (
                <SedePer t={t} u={u} scontri={scontri} sedi={sedi} onSede={onSede} />
            ) : (
                scontri.map((x, j) => (
                    <p key={j} className={s.hint}>
                        {multi ? `A ${listIt(x.sedi)}, ${x.quando}, c'è già ${q(x.con)}.` : `${x.quando.charAt(0).toUpperCase()}${x.quando.slice(1)} c'è già ${q(x.con)}.`}
                        {x.copre && !none && " " + hCopreText(t, { con: x.con, quando: x.quando, copre: true }, t.insieme ? "ins" : "pos")}
                    </p>
                ))
            )}
        </div>
    );
}
