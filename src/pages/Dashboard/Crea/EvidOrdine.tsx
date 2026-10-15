// Il passo «L'ordine» di un contenuto in evidenza (D187): parte per primo; con
// più sedi si chiede se l'ordine è uguale dappertutto, e se no si apre la sede
// da cambiare. Le righe si trascinano, o si spostano con le frecce.
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpToLine, GripVertical } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { listIt, type DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import cs from "@/pages/Dashboard/Programming/calendar/CalendarioView.module.scss";
import { thingName, type Tunnel } from "./creaModel";
import { ME, ordFirst, ordMove, posTxt, type Others } from "./evidOrd";
import type { U } from "./CreaSteps";
import { Opt, Sh } from "./CreaUi";
import { Destra } from "./Destra";
import s from "./Crea.module.scss";
import e from "./Evid.module.scss";

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Le righe di una sede: questa in evidenza, le altre intorno. */
export function OrdineRighe({ t, u, id, others }: { t: Tunnel; u: U; id: string; others: Others }) {
    const [drag, setDrag] = useState<number | null>(null);
    const arr = t.ord[id] ?? [];
    const name = (x: string) => (x === ME ? thingName(t) : others[id]?.find(o => o.id === x)?.name ?? "Contenuto");
    const move = (i: number, j: number) => u(x => ordMove(x, id, i, j));
    return (
        <>
            <ol className={e.olist} aria-label="L'ordine">
                {arr.map((x, i) => (
                    <li
                        key={x}
                        draggable
                        className={x === ME ? e.me : undefined}
                        data-over={drag !== null && drag !== i ? true : undefined}
                        onDragStart={() => setDrag(i)}
                        onDragEnd={() => setDrag(null)}
                        onDragOver={ev => ev.preventDefault()}
                        onDrop={ev => {
                            ev.preventDefault();
                            if (drag !== null) move(drag, i);
                            setDrag(null);
                        }}
                    >
                        <GripVertical size={15} aria-hidden />
                        <b>{name(x)}</b>
                        {x === ME && <span className={e.mine}>{t.edit ? "in modifica" : "il tuo"}</span>}
                        <span className={e.sp} />
                        <button type="button" className={e.xbtn} aria-label={`Sposta su: ${name(x)}`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                            <ArrowUp size={15} aria-hidden />
                        </button>
                        <button type="button" className={e.xbtn} aria-label={`Sposta giù: ${name(x)}`} disabled={i === arr.length - 1} onClick={() => move(i, i + 1)}>
                            <ArrowDown size={15} aria-hidden />
                        </button>
                    </li>
                ))}
            </ol>
            <p className={s.hint}>Trascina le righe, o usa le frecce.</p>
        </>
    );
}

export function EvidOrdine({ t, u, L, others, alone }: { t: Tunnel; u: U; L: DraftLookups; others: Others; alone: readonly string[] }) {
    const ids = Object.keys(t.ord), many = ids.length > 1;
    const sname = (id: string) => L.sedi.get(id) ?? "sede";
    return (
        <>
            <Sh title="L'ordine">
                In cima al menù i contenuti in evidenza stanno uno sotto l'altro.{t.edit ? " Ogni sede tiene il suo ordine." : " Il nuovo parte per primo: è la risposta già data."}
            </Sh>
            {!t.edit && (
                <div className={s.opts}>
                    <Opt on={t.ordSame} icon={<ArrowUpToLine size={18} />} title={`Mostralo per primo in ${many ? "tutte le sedi" : "cima"}`} text="Sopra gli altri contenuti in evidenza: è il più nuovo." onClick={() => u(ordFirst)} />
                </div>
            )}
            {many && (
                <div className={cs.ifl}>
                    <h4>L'ordine è uguale in tutte le sedi?</h4>
                    <SegmentedControl
                        size="sm"
                        value={t.ordSame ? "si" : "no"}
                        onChange={v => u(x => (v === "si" ? ordFirst(x) : void (x.ordSame = false)))}
                        options={[
                            { value: "si", label: t.edit ? "Sì, per primo in tutte" : "Sì" },
                            { value: "no", label: "No, cambia" }
                        ]}
                    />
                </div>
            )}
            {(!t.ordSame || !many) && (
                <div className={cs.ifl}>
                    <h4>{many ? "L'ordine di ogni sede" : "L'ordine"}</h4>
                    <p className={cs.muted}>{t.ordOpen ? (
                        <>
                            L'ordine di {sname(t.ordOpen)}: cambia solo lì. <Destra wide="A destra" narrow="In «Anteprima»" /> il telefono di quella sede.
                        </>
                    ) : (
                        "Apri la sede da cambiare."
                    )}</p>
                    <div className={cs.dqrows}>
                        {ids.map(id => {
                            const open = t.ordOpen === id;
                            return (
                                <div key={id} className={cs.dqrow} data-open={open || undefined}>
                                    <button type="button" className={cs.dqhd} aria-expanded={open} onClick={() => u(x => void (x.ordOpen = open ? null : id))}>
                                        <b>{sname(id)}</b>
                                        <span>
                                            {cap(posTxt(t.ord[id]))} · {t.ord[id].length} contenuti
                                        </span>
                                        <em>{open ? "Chiudi" : "Cambia"}</em>
                                    </button>
                                    {open && (
                                        <div className={cs.dqin}>
                                            <OrdineRighe t={t} u={u} id={id} others={others} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {alone.length > 0 && L.multi && <p className={s.hint}>A {listIt(alone.map(sname))} è l'unico in evidenza: non c'è un ordine da scegliere.</p>}
            <p className={s.hint}>Più contenuti stanno insieme nelle stesse ore: nessuno toglie il posto a un altro. Dopo, l'ordine si cambia anche dall'elenco «In evidenza».</p>
        </>
    );
}
