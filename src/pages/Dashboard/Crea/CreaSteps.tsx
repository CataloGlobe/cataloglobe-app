// I corpi dei passi dei tunnel, uno a uno dall'artifact (`bodyOf`). Il Quando
// e il Dove sono quelli del Calendario (`QuandoPasso`, `DoveQuandoPasso`); i blocchi
// della storia sono l'editor a blocchi di oggi.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Check, CirclePause, Copy, Info, Infinity as InfinityIcon, Link2, Lock, MapPinned, Megaphone, Palette, Plus, Radio, ScanText, ScrollText, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import type { StoryBlock } from "@/services/supabase/stories";
import { MAX_STORY_IMAGES } from "@/services/supabase/stories";
import type { V2Style } from "@/services/supabase/styles";
import { getCatalogStatsMap, type CatalogStats } from "@/services/supabase/catalogs";
import { StoryBlockEditor } from "@/pages/Dashboard/Stories/components/StoryBlockEditor";
import { BLOCK_TYPE_META, BLOCK_TYPE_ORDER } from "@/pages/Dashboard/Stories/components/blocks/blockTypeMeta";
import { createBlock } from "@/pages/Dashboard/Stories/components/createBlock";
import type { StoryProductOptions } from "@/pages/Dashboard/Stories/components/StoryProductPicker";
import { DoveQuandoPasso, OreSedi, QuandoPasso, ScontriAvviso, SediPasso, type PassoGruppo, type PassoSede } from "@/pages/Dashboard/Programming/calendar/CalendarioPassi";
import { DB_LATER, invalid, sediOf, type Draft, type DraftLookups, type Impatto, type PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Axis, CalWhen } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import cal from "@/pages/Dashboard/Programming/calendar/CalendarioView.module.scss";
import { KIND, ONDA, STORIA_WHEN, blocker, bundleTotal, changed, cloneWhen, effWhen, euro, firstBlock, goesLive, keepReady, offLater, ondaChange, priceText, sentence, skipped, stepLabel, stepSummary, steps, strays, type Ctx, type StepId, type Tunnel } from "./creaModel";
import { hidFeatured } from "./stileLook";
import s from "./Crea.module.scss";
import { Box, Chip, Field, Opt, Pick, Sh, Toggle, Warnish } from "./CreaUi";
import { ImagePick } from "./ImagePick";

export type U = (fn: (t: Tunnel) => void) => void;
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const q = (x: string) => "«" + x + "»";

export function Inherited({ children }: { children: ReactNode }) {
    return (
        <div className={s.inh}>
            <Link2 size={15} aria-hidden />
            <span>{children}</span>
        </div>
    );
}


/* ---------- modificare: il passo 0 (D140) ---------- */
export function Modifica({ t, u, c, L, styleName }: { t: Tunnel; u: U; c: Ctx; L: DraftLookups; styleName: (id: string) => string }) {
    const e = t.edit!;
    const parts = steps(t, c).filter(x => x !== "modifica" && x !== "controlla");
    const toggle = (x: StepId) =>
        u(y => {
            const p = y.edit!.picked, i = p.indexOf(x);
            if (i >= 0) p.splice(i, 1);
            else p.push(x);
        });
    const inCal = t.kind !== "storia" && c.owner && e.rules > 1;
    // il «Dove e quando» dice prima se è in onda (D189)
    const was = (x: StepId) => {
        const sum = stepSummary({ ...e.orig, edit: e }, x, L, styleName);
        if (x !== "dove" && x !== "quando") return sum;
        return e.orig.onda === "on" ? "In onda · " + sum : "Non in onda";
    };
    return (
        <>
            <Sh title="Cosa vuoi modificare?">Scegli una cosa o più: «Avanti» ti porta solo lì. Il resto resta com'è.</Sh>
            <div className={s.whats}>
                {parts.map(x => {
                    const on = e.picked.includes(x);
                    return (
                        <button key={x} type="button" className={s.what} role="checkbox" aria-checked={on} onClick={() => toggle(x)}>
                            <Box on={on} />
                            <span>
                                <b>{stepLabel(t, x)}</b>
                                <span>{was(x) || "—"}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {inCal && (
                <p className={s.hint}>{`È nel Calendario ${e.rules} volte: il dove e il quando si cambiano da lì, una voce alla volta.`}</p>
            )}
        </>
    );
}

/* ---------- il menù ---------- */
/** Un menù da cui copiare: se è in onda lo dice il Calendario. */
export type CopyMenu = { id: string; name: string; live: boolean };

export function MenuParti({ t, u, menus, tenantId, onCopy }: { t: Tunnel; u: U; menus: readonly CopyMenu[]; tenantId: string; onCopy: (m: CopyMenu) => void }) {
    const id = useId();
    const copying = !t.edit && t.source === "copia";
    // quante categorie e quanti piatti ha ogni menù: si leggono solo se si copia
    const [stats, setStats] = useState<Record<string, CatalogStats> | null>(null);
    const ids = menus.map(m => m.id).join();
    useEffect(() => {
        if (!copying || stats || !ids) return;
        let off = false;
        getCatalogStatsMap(tenantId, ids.split(","))
            .then(x => !off && setStats(x))
            .catch(error => console.error("[Crea] i numeri dei menù non si sono letti:", error));
        return () => {
            off = true;
        };
    }, [copying, stats, ids, tenantId]);
    const sub = (m: CopyMenu) => {
        const n = stats?.[m.id];
        return [...(n ? [`${n.categoryCount} ${n.categoryCount === 1 ? "categoria" : "categorie"}`, `${n.productCount} ${n.productCount === 1 ? "piatto" : "piatti"}`] : []), m.live ? "in onda" : "pronto, non in onda"].join(" · ");
    };
    return (
        <>
            <Sh title={t.edit ? "Il nome" : "Da dove parti"}>Il nome lo legge anche il cliente, in cima al menù.</Sh>
            <Field label="Nome del menù" id={id}>
                <input className={s.in} id={id} value={t.name} placeholder="Menù pranzo" autoComplete="off" onChange={e => u(x => void (x.name = e.target.value))} />
            </Field>
            <div className={s.opts} hidden={!!t.edit}>
                <Opt on={t.source === "zero"} icon={<Plus size={16} />} title="Da zero" text="Prendi i piatti che hai o scrivine di nuovi." onClick={() => u(x => void ((x.source = "zero"), (x.copyFrom = null)))} />
                <Opt on={t.source === "foto"} icon={<ScanText size={16} />} title="Da una foto o un PDF" text="Nel passo dopo la carichi: la leggiamo noi e ti diciamo subito cosa abbiamo trovato." onClick={() => u(x => void ((x.source = "foto"), (x.copyFrom = null)))} />
                {menus.length > 0 && <Opt on={t.source === "copia"} icon={<Copy size={16} />} title="Copia da un altro menù" text="Parti dalle sue categorie e dai suoi piatti: poi li cambi." onClick={() => u(x => void (x.source = "copia"))} />}
            </div>
            {copying && (
                <div className={s.blk}>
                    <h4>Quale menù copi?</h4>
                    <div className={s.list} role="radiogroup" aria-label="Menù da copiare">
                        {menus.map(m => {
                            const on = t.copyFrom === m.id;
                            return (
                                <button key={m.id} type="button" className={s.lpick} role="radio" aria-checked={on} onClick={() => onCopy(m)}>
                                    <span className={cx(s.box, s.radio, on && s.on)} />
                                    <span className={s.lpn}>{m.name}</span>
                                    <span className={s.sub}>{sub(m)}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className={s.hint}>Ci sono tutti, anche quelli non in onda.</p>
                </div>
            )}
        </>
    );
}

/* ---------- lo stile e la storia: a cosa serve ---------- */
export function Serve({ t, example, business }: { t: Tunnel; example: string | null; business: string }) {
    return t.kind === "stile" ? (
        <>
            <Sh title="Dagli i tuoi colori">
                Colori, caratteri e forma delle schede dei piatti: la pagina pubblica sembra il tuo locale, non un modulo. Uno stile vale per tutta la pagina, qualunque menù sia in onda.
            </Sh>
            <p className={s.hint}>{example ? `L'esempio è nel telefono a destra: lo stile ${q(example)} su ${business || "il tuo locale"}.` : "Nel telefono a destra vedi la tua pagina com'è oggi."}</p>
        </>
    ) : (
        <>
            <Sh title="Racconta una storia">Chi sei, da dove vengono gli ingredienti, il piatto del mese. Compare sotto il menù, con testo e foto, e si legge toccandola.</Sh>
            <p className={s.hint}>Nel telefono a destra vedi dove compare: sotto il menù, nelle storie.</p>
        </>
    );
}

/* ---------- lo stile ---------- */
export function StileNome({ t, u, styles, onBase }: { t: Tunnel; u: U; styles: readonly V2Style[]; onBase: (id: string | null) => void }) {
    const id = useId();
    return (
        <>
            <Sh title="Il nome">Lo vedi solo tu, nell'elenco degli stili e nel Calendario.</Sh>
            <Field label="Nome dello stile" id={id}>
                <input className={s.in} id={id} value={t.name} placeholder="Natale" autoComplete="off" onChange={e => u(x => void (x.name = e.target.value))} />
            </Field>
            <div className={s.opts} hidden={!!t.edit}>
                <Opt on={t.base === "zero"} icon={<Plus size={16} />} title="Da zero" text="Parti dai colori di CataloGlobe." onClick={() => onBase(null)} />
                <Opt on={t.base === "copy"} icon={<Copy size={16} />} title="Parti da uno stile che hai" text="Ne fai una copia e la cambi." onClick={() => onBase(t.baseStyleId ?? styles[0]?.id ?? null)} disabled={!styles.length} />
            </div>
            {t.base === "copy" && !t.edit && (
                <div className={s.chips}>
                    {styles.map(st => (
                        <Chip key={st.id} on={t.baseStyleId === st.id} onClick={() => onBase(st.id)}>
                            {st.name}
                        </Chip>
                    ))}
                </div>
            )}
        </>
    );
}

/* ---------- in evidenza ---------- */
export function EvidPiatti({ t, u, pick, L }: { t: Tunnel; u: U; pick: readonly PickProduct[]; L: DraftLookups }) {
    const promo = t.evType === "promo";
    const bid = useId();
    const ids = t.from?.productIds;
    const only = useMemo(() => (ids && ids.length ? new Set(ids) : null), [ids]);
    const cats = useMemo(() => {
        const m = new Map<string, PickProduct[]>();
        for (const p of pick) {
            if (only && !only.has(p.id)) continue;
            const c = p.category?.trim() || "Senza sezione";
            m.set(c, [...(m.get(c) ?? []), p]);
        }
        return [...m];
    }, [pick, only]);
    const tot = bundleTotal(t, L);
    return (
        <>
            <div className={s.chips}>
                <Chip on={promo} onClick={() => u(x => void (x.evType = "promo"))}>
                    Ognuno col suo prezzo
                </Chip>
                <Chip on={!promo} onClick={() => u(x => void (x.evType = "bundle"))}>
                    Tutti insieme a un prezzo unico
                </Chip>
            </div>
            <p className={s.hint}>{promo ? "Accanto a ogni piatto puoi scrivere una nota: «-20% a pranzo», «solo il giovedì»." : "Il cliente vede i piatti e un prezzo solo."} Si prendono dai prodotti che hai.</p>
            {t.from && only && <Inherited>I piatti del menù {q(t.from.name)}, a portata di mano.</Inherited>}
            <div className={s.list} style={{ maxHeight: 330, overflow: "auto" }}>
                {cats.map(([c, ps]) => (
                    <div key={c}>
                        <div className={s.lcat}>{c}</div>
                        {ps.map(p => {
                            const on = t.dishes.includes(p.id);
                            return (
                                <div className={cx(s.lrow, on && s.sel)} key={p.id}>
                                    <button
                                        type="button"
                                        className={s.cb}
                                        role="checkbox"
                                        aria-checked={on}
                                        aria-label={p.name}
                                        onClick={() =>
                                            u(x => {
                                                const i = x.dishes.indexOf(p.id);
                                                if (i >= 0) x.dishes.splice(i, 1);
                                                else x.dishes.push(p.id);
                                            })
                                        }
                                    >
                                        <Box on={on} />
                                    </button>
                                    <span className={s.nm}>
                                        <span>{p.name}</span>
                                        <span className={s.sub}>{priceText(p.listPrice)}</span>
                                    </span>
                                    {on && promo ? (
                                        <input
                                            className={cx(s.in, s.sm)}
                                            style={{ width: 170 }}
                                            value={t.notes[p.id] ?? ""}
                                            placeholder="Nota, facoltativa"
                                            autoComplete="off"
                                            aria-label={`Nota per ${p.name}`}
                                            onChange={e => u(x => void (x.notes[p.id] = e.target.value))}
                                        />
                                    ) : (
                                        <span />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
                {!cats.length && <p className={s.hint}>Non ci sono ancora prodotti: aggiungili da Prodotti.</p>}
            </div>
            {!promo && (
                <>
                    <div className={cx(s.f, s.blk)}>
                        <label htmlFor={bid}>Prezzo unico</label>
                        <span className={s.rng}>
                            <input className={cx(s.in, s.num)} id={bid} value={t.bundle} placeholder="45" inputMode="decimal" onChange={e => u(x => void (x.bundle = e.target.value))} /> €
                        </span>
                    </div>
                    <div className={s.blk}>
                        <Toggle on={t.showOrig} onClick={() => u(x => void (x.showOrig = !x.showOrig))}>
                            Mostra il totale di prima barrato{t.dishes.length ? ` (${euro(tot)})` : ""}
                        </Toggle>
                    </div>
                </>
            )}
        </>
    );
}

/* ---------- la storia ---------- */
export function StoriaRacconto({ t, u, pick, coverUrl }: { t: Tunnel; u: U; pick: readonly PickProduct[]; coverUrl: string | null }) {
    const ids = { k: useId(), t: useId(), l: useId(), c: useId() };
    return (
        <>
            <Sh title="Il racconto">Così si presenta nell'elenco delle storie, sotto il menù.</Sh>
            <Field label="Occhiello" id={ids.k}>
                <input className={s.in} id={ids.k} value={t.kicker} placeholder="La nostra cucina" autoComplete="off" onChange={e => u(x => void (x.kicker = e.target.value))} />
            </Field>
            <Field label="Titolo" id={ids.t}>
                <input className={s.in} id={ids.t} value={t.title} placeholder="Il riso, prima di tutto" autoComplete="off" onChange={e => u(x => void (x.title = e.target.value))} />
            </Field>
            <div className={s.blk}>
                <span className={s.lab}>Copertina</span>
                <ImagePick
                    url={coverUrl}
                    id={ids.c}
                    onPick={f =>
                        u(x => {
                            x.cover = f;
                            if (!f) x.coverUrl = null;
                        })
                    }
                />
            </div>
            <div className={cx(s.f, s.blk)}>
                <label htmlFor={ids.l}>Anche nella scheda di un piatto</label>
                <select className={s.in} id={ids.l} value={t.linked} onChange={e => u(x => void (x.linked = e.target.value))}>
                    <option value="">Nessuno</option>
                    {pick.map(p => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
                <p className={s.hint}>Facoltativo: chi apre quel piatto trova la storia in fondo.</p>
            </div>
        </>
    );
}

export function StoriaBlocchi({
    t,
    u,
    tenantId,
    files,
    onFile,
    productOptions
}: {
    t: Tunnel;
    u: U;
    tenantId: string;
    files: Record<string, File>;
    onFile: (blockId: string, f: File | null) => void;
    productOptions: StoryProductOptions;
}) {
    const [focus, setFocus] = useState<string | null>(null);
    const images = t.blocks.filter(b => b.type === "image").length;
    const add = (type: StoryBlock["type"]) => {
        // arrivati al tetto il bottone «Immagine» è già spento
        if (type === "image" && images >= MAX_STORY_IMAGES) return;
        const b = createBlock(type);
        u(x => void x.blocks.push(b));
        setFocus(b.id);
    };
    return (
        <>
            <Sh title="I blocchi">Il racconto, un pezzo alla volta: è l'editor a blocchi di oggi. Si leggono toccando la storia.</Sh>
            {/* i blocchi, poi sotto un bottone per tipo (l'editor vuoto ha già il suo «Aggiungi»: qui no) */}
            {t.blocks.length > 0 && (
                <StoryBlockEditor
                    value={t.blocks}
                    onChange={next => u(x => void (x.blocks = next))}
                    pendingImages={files}
                    onPendingImageChange={onFile}
                    tenantId={tenantId}
                    productOptions={productOptions}
                    focusBlockId={focus}
                    onFocusHandled={() => setFocus(null)}
                />
            )}
            <div className={s.blk}>
                <span className={s.lab}>Aggiungi un blocco</span>
                <div className={s.chips}>
                    {BLOCK_TYPE_ORDER.map(type => {
                        const { label, icon: Icon } = BLOCK_TYPE_META[type];
                        return (
                            <button key={type} type="button" className={s.chip} disabled={type === "image" && images >= MAX_STORY_IMAGES} onClick={() => add(type)}>
                                <Icon size={14} aria-hidden />
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

/* ---------- Quando e Dove: quelli del Calendario ---------- */
const KIND_TXT: Record<Tunnel["kind"], string> = {
    menu: "Nelle sue ore il cliente vede questo menù; per farne vedere più di uno insieme c'è il multi menù.",
    stile: "Nelle sue ore tutta la pagina prende questo stile, qualunque menù sia in onda.",
    evid: "In evidenza si aggiunge sempre: più contenuti stanno insieme.",
    storia: "Le storie si aggiungono: più storie stanno insieme."
};

type Upd = (fn: (d: Draft) => void) => void;

/** La domanda in cima a «Dove e quando» (D189): in onda o pronto. Creando nessuna è scelta. */
export function OndaAsk({ t, u, small }: { t: Tunnel; u: U; small?: boolean }) {
    const o = ONDA[t.kind], chosen = t.onda !== null;
    return (
        <div className={cx(s.ask, small && s.ondaS)}>
            <p>{`Vuoi che i clienti ${o.lo} vedano${t.edit ? "" : " appena salvi"}?`}</p>
            <div className={cx(s.ondaPick, chosen ? s.made : s.fresh)}>
                <Pick
                    on={t.onda === "on"}
                    lead
                    icon={<Radio size={18} />}
                    title={`Sì, ${o.lo} metto in onda`}
                    text={`Scegli in quali sedi e quando ${o.lo} vedono i clienti.`}
                    onClick={() => u(x => void (x.onda = "on"))}
                />
                <Pick
                    on={t.onda === "off"}
                    icon={<CirclePause size={18} />}
                    title={keepReady(t.kind)}
                    text={`${t.kind === "storia" ? "La salvi completa" : "Lo salvi completo"}, ma nessun cliente ${o.lo} vede.`}
                    disabled={offLater(t)}
                    later={offLater(t) ? "Arriva col database nuovo" : undefined}
                    onClick={() => u(x => void (x.onda = "off"))}
                />
            </div>
            <p className={s.swap}>{chosen ? "Per cambiare idea, tocca l'altro." : "Puoi cambiare idea quando vuoi."}</p>
        </div>
    );
}

/** «Lo tengo pronto»: niente sedi né orari. Spegnendo una cosa in onda, la sua voce resta spenta. */
export function OndaOff({ t }: { t: Tunnel }) {
    const o = ONDA[t.kind];
    if (t.edit?.orig.onda === "on")
        return (
            <div className={s.callout}>
                <TriangleAlert size={16} aria-hidden />
                <span>
                    {`Salvando, ${o.q} esce da tutte le sedi: da quel momento nessun cliente ${o.lo} vede.`}
                    {/* la storia non ha voci nel Calendario */}
                    {t.kind !== "storia" && ` La sua voce nel Calendario resta, spenta, con sedi e orari: ${o.lo} ritrovi uguale quando ${o.lo} rimetti in onda.`}
                </span>
            </div>
        );
    return (
        <div className={cx(s.callout, s.info)}>
            <Info size={16} aria-hidden />
            <span>{`Nessuna sede e nessun orario. ${o.Il} resta in «${KIND[t.kind].page}» come «${o.Pronto}, non in onda». Quando vuoi, ${o.lo} metti in onda da lì con «Metti in onda».`}</span>
        </div>
    );
}

const ondaSub = (t: Tunnel) => `Prima decidi se i clienti ${ONDA[t.kind].lo} vedono. Si cambia quando vuoi.`;

/** Il Quando, con una sede sola; `bare` è solo «Sempre o in certi momenti», dentro «Dove e quando». */
export function Quando({ t, u, draft, updDraft, durs, axis, bare }: { t: Tunnel; u: U; draft: Draft | null; updDraft: Upd; durs: readonly CalWhen[]; axis: Axis; bare?: boolean }) {
    const storia = t.kind === "storia";
    const choice = (
        <>
            <div className={s.opts}>
                <Opt on={t.qmode === "sempre"} icon={<InfinityIcon size={16} />} title="Sempre" text="Da subito, tutti i giorni, a tutte le ore." onClick={() => u(x => void (x.qmode = "sempre"))} />
                <Opt
                    on={t.qmode === "momenti"}
                    icon={<CalendarClock size={16} />}
                    title="Solo in certi momenti"
                    text="Un periodo, alcuni giorni o alcune ore: il pranzo, il weekend, Natale."
                    disabled={storia && !STORIA_WHEN}
                    later={storia && !STORIA_WHEN ? "Per le storie arriva col database nuovo" : undefined}
                    onClick={() =>
                        u(x => {
                            x.qmode = "momenti";
                            if (!x.when.days && !x.when.ranges && !x.when.period) x.when = { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] };
                        })
                    }
                />
            </div>
            {t.qmode === "momenti" &&
                draft &&
                // dentro «Dove e quando» la cornice del Calendario c'è già
                (bare ? (
                    <QuandoPasso draft={draft} upd={updDraft} durs={durs} axis={axis} bad={invalid(draft)} />
                ) : (
                    <div className={cx(cal.root, s.calwrap)}>
                        <QuandoPasso draft={draft} upd={updDraft} durs={durs} axis={axis} bad={invalid(draft)} />
                    </div>
                ))}
        </>
    );
    if (bare) return choice;
    return (
        <>
            <Sh title="Quando">{ondaSub(t)}</Sh>
            <OndaAsk t={t} u={u} />
            {t.onda === "off" && <OndaOff t={t} />}
            {t.onda === "on" && (
                <>
                    {t.from && <Inherited>Già compilato dal menù {q(t.from.name)}: puoi cambiarlo.</Inherited>}
                    {t.aside && <Inherited>Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.</Inherited>}
                    {t.edit?.ruleId && <Inherited>È la sua voce nel Calendario: cambiandola qui, cambia anche lì.</Inherited>}
                    {choice}
                    <p className={s.hint}>{KIND_TXT[t.kind]}</p>
                </>
            )}
        </>
    );
}

/** «tutte e due le sedi», «tutte e tre le sedi», «tutte le 12 sedi». */
const nTutte = (n: number) => (n === 2 ? "tutte e due le sedi" : n === 3 ? "tutte e tre le sedi" : `tutte le ${n} sedi`);

/** Dove, con più sedi: prima se va in onda, poi in quali sedi. Le ore sono nel passo dopo. */
export function Dove({ t, u, draft, updDraft, sedi, groups }: { t: Tunnel; u: U; draft: Draft; updDraft: Upd; sedi: readonly PassoSede[]; groups: readonly PassoGruppo[] }) {
    return (
        <>
            <Sh title="Dove">{`Due scelte: se i clienti ${ONDA[t.kind].lo} vedono e in quali sedi. Si cambia quando vuoi.`}</Sh>
            <OndaAsk t={t} u={u} small />
            {t.onda === "off" && <OndaOff t={t} />}
            {t.onda === "on" && (
                <>
                    {t.from && <Inherited>Già compilato dal menù {q(t.from.name)}: puoi cambiarlo.</Inherited>}
                    {t.aside && <Inherited>Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.</Inherited>}
                    <div className={cx(cal.root, s.calwrap)}>
                        <SediPasso draft={draft} upd={updDraft} sedi={sedi} groups={groups} />
                    </div>
                    <p className={s.hint}>Le ore si scelgono nel passo dopo, «Quando».</p>
                </>
            )}
        </>
    );
}

/** Quando, con più sedi: le ore, uguali per tutte o sede per sede. */
export function QuandoOre({ t, u, draft, updDraft, sedi, groups, durs, axis }: { t: Tunnel; u: U; draft: Draft; updDraft: Upd; sedi: readonly PassoSede[]; groups: readonly PassoGruppo[]; durs: readonly CalWhen[]; axis: Axis }) {
    const n = sediOf(t.where, sedi, groups).length;
    const sel = t.per ? "diverse" : t.qmode;
    return (
        <>
            <Sh title="Quando">
                {t.per ? "Le ore di ogni sede: la settimana a destra segue la sede che scegli sopra." : `Le ore in cui i clienti ${ONDA[t.kind].lo} vedono. A destra la settimana della sede che scegli sopra.`}
            </Sh>
            <div className={s.opts}>
                <Opt
                    on={sel === "sempre"}
                    icon={<InfinityIcon size={16} />}
                    title="Sempre"
                    text={n > 1 ? `In ${nTutte(n)}, tutti i giorni, a tutte le ore.` : "Da subito, tutti i giorni, a tutte le ore."}
                    onClick={() => u(x => void ((x.per = null), (x.qmode = "sempre")))}
                />
                <Opt
                    on={sel === "momenti"}
                    icon={<CalendarClock size={16} />}
                    title="Solo in certi momenti"
                    text={n > 1 ? `Le stesse ore in ${nTutte(n)}.` : "Un periodo, alcuni giorni o alcune ore: il pranzo, il weekend, Natale."}
                    onClick={() =>
                        u(x => {
                            x.per = null;
                            x.qmode = "momenti";
                            if (!x.when.days && !x.when.ranges && !x.when.period) x.when = { days: [0, 1, 2, 3, 4], ranges: [[720, 900]] };
                        })
                    }
                />
                {n > 1 && (
                    <Opt
                        on={sel === "diverse"}
                        icon={<MapPinned size={16} />}
                        title="Dipende dalla sede"
                        text="Ogni sede ha le sue ore."
                        onClick={() =>
                            u(x => {
                                if (x.per) return;
                                // tutte partono dalle ore scelte fin qui
                                x.when = cloneWhen(effWhen(x));
                                x.qmode = "momenti";
                                x.per = Object.fromEntries(sediOf(x.where, sedi, groups).map(id => [id, cloneWhen(x.when)]));
                            })
                        }
                    />
                )}
            </div>
            {sel !== "sempre" && (
                <div className={cx(cal.root, s.calwrap)}>
                    {sel === "momenti" ? <QuandoPasso draft={draft} upd={updDraft} durs={durs} axis={axis} bad={invalid(draft)} /> : <OreSedi draft={draft} upd={updDraft} sedi={sedi} durs={durs} axis={axis} />}
                </div>
            )}
            {t.edit?.ruleId && <Inherited>È la sua voce nel Calendario: cambiandola qui, cambia anche lì.</Inherited>}
        </>
    );
}

/** Dove e quando della storia (D145): il passo del Calendario, col «Sempre» del tunnel dentro. */
export function DoveQuando(p: { t: Tunnel; u: U; draft: Draft; updDraft: Upd; sedi: readonly PassoSede[]; groups: readonly PassoGruppo[]; L: DraftLookups; durs: readonly CalWhen[]; axis: Axis }) {
    const { t, draft } = p;
    const storia = t.kind === "storia";
    const storiaBad = storia ? blocker(t, "dove", { owner: true, multi: true }) : "";
    return (
        <>
            <Sh title="Dove e quando">{ondaSub(t)}</Sh>
            <OndaAsk t={t} u={p.u} />
            {t.onda === "off" && <OndaOff t={t} />}
            {t.onda === "on" && (
                <>
                    {t.from && <Inherited>Già compilato dal menù {q(t.from.name)}: puoi cambiarlo.</Inherited>}
                    {t.aside && <Inherited>Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.</Inherited>}
                    {t.edit?.ruleId && !storia && <Inherited>È la sua voce nel Calendario: cambiandola qui, cambia anche lì.</Inherited>}
                    <div className={cx(cal.root, s.calwrap)}>
                        <DoveQuandoPasso
                            draft={draft}
                            upd={p.updDraft}
                            sedi={p.sedi}
                            groups={p.groups}
                            L={p.L}
                            bad={invalid(draft)}
                            durs={p.durs}
                            axis={p.axis}
                            split={!storia && !t.edit}
                            quando={<Quando bare t={t} u={p.u} draft={draft} updDraft={p.updDraft} durs={p.durs} axis={p.axis} />}
                        />
                    </div>
                    <p className={s.hint}>
                        {storia ? storiaBad ? <Warnish>{storiaBad}.</Warnish> : `Oggi una storia va in tutte le sedi o in una sola; per alcune sedi ${DB_LATER}.` : KIND_TXT[t.kind]}
                    </p>
                </>
            )}
        </>
    );
}

/* ---------- Controlla ---------- */

/** Pronto e controllato (D189): la lista di «Controlla» quando non va in onda. */
export function Checks({ t }: { t: Tunnel }) {
    return (
        <div className={s.blk}>
            <h4>Controlli</h4>
            <ul className={s.checks}>
                {["Il contenuto è completo", "Nessun errore da correggere", `${ONDA[t.kind].Pronto} per andare in onda in qualunque sede`].map(x => (
                    <li key={x}>
                        <Check size={14} aria-hidden />
                        {x}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function Controlla({
    t,
    c,
    L,
    effect,
    styleName,
    seen,
    onGo,
    onInsieme
}: {
    /** Lo stile in modifica: le sedi che vedono subito quello che si salva. */
    seen?: string | null;
    t: Tunnel;
    c: Ctx;
    L: DraftLookups;
    effect: Impatto;
    styleName: (id: string) => string;
    onGo: (i: number) => void;
    onInsieme: (v: boolean) => void;
}) {
    const all = steps(t, c);
    const st = all.filter(x => x !== "controlla" && x !== "serve" && x !== "modifica" && !skipped(t, x, c));
    const fb = firstBlock(t, c);
    if (t.edit) {
        const ch = st.filter(x => changed(t, x));
        const stray = strays(t, c);
        const inCal = ch.some(x => x === "dove" || x === "quando") && t.kind !== "storia";
        // spegnere una cosa in onda (D189): esce da tutte le sedi, la sua voce resta spenta
        const spegni = t.edit.orig.onda === "on" && t.onda === "off";
        const dq = (x: StepId) => (x === "dove" || x === "quando") && t.onda !== t.edit!.orig.onda;
        return (
            <>
                <Sh title="Controlla">{ch.length ? "Si salva solo quello che hai cambiato. Il resto resta com'è." : "Non hai ancora cambiato niente."}</Sh>
                {spegni && (
                    <div className={s.blk}>
                        <h4>In una frase</h4>
                        <p className={s.isent}>{sentence(t, L)}</p>
                    </div>
                )}
                {stray.map(x => (
                    <div className={cx(s.callout, s.info)} key={x}>
                        <TriangleAlert size={16} aria-hidden />
                        <span>
                            Hai cambiato anche «{stepLabel(t, x)}», che non avevi scelto: guardalo prima di salvare.
                        </span>
                        <Button variant="secondary" size="sm" onClick={() => onGo(all.indexOf(x))}>
                            Guarda
                        </Button>
                    </div>
                ))}
                <div className={s.blk}>
                    <h4>Le tue modifiche</h4>
                    <dl className={s.isum}>
                        {st.map(x => {
                            const on = changed(t, x);
                            return (
                                <div key={x} className={on ? undefined : s.same}>
                                    <dt>{stepLabel(t, x)}</dt>
                                    <dd>
                                        {on && dq(x) ? (
                                            <>
                                                {ondaChange(t, x, L)[0]}
                                                <br />
                                                <b>{ondaChange(t, x, L)[1]}</b>
                                            </>
                                        ) : on ? (
                                            stepSummary(t, x, L, styleName)
                                        ) : (
                                            "Come prima"
                                        )}
                                    </dd>
                                    <Button variant="ghost" size="sm" onClick={() => onGo(all.indexOf(x))}>
                                        Cambia
                                    </Button>
                                </div>
                            );
                        })}
                    </dl>
                </div>
                {t.kind === "stile" && changed(t, "aspetto") && <p className={s.hint}>{seen ?? "I clienti vedono l'aspetto nuovo appena salvi, ovunque questo stile è in onda. Quello di prima resta nelle versioni dello stile."}</p>}
                {t.kind === "stile" && changed(t, "aspetto") && hidFeatured(t.look) && <p className={s.hint}>Questo stile nascondeva titolo, descrizione o pulsante dei contenuti in evidenza: salvando tornano visibili. Se un contenuto non deve averli, si tolgono dal contenuto.</p>}
                {inCal && (
                    <div className={s.blk}>
                        <h4>Cosa cambia nel calendario</h4>
                        {spegni ? (
                            <p>{`La sua voce (${all.filter(x => x === "dove" || x === "quando").map(x => stepSummary(t.edit!.orig, x, L, styleName)).join(" · ")}) si spegne e resta lì, pronta per tornare in onda.`}</p>
                        ) : (
                            <ul className={s.ieff}>
                                {effect.lines.map((x, i) => (
                                    <li key={i}>{x}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
                {spegni && !fb && <Checks t={t} />}
                {fb && (
                    <div className={s.callout}>
                        <TriangleAlert size={16} aria-hidden />
                        <span>
                            {fb.why}: torna a «{stepLabel(t, all[fb.i])}».
                        </span>
                    </div>
                )}
            </>
        );
    }
    const live = goesLive(t, c), o = ONDA[t.kind];
    return (
        <>
            <Sh title="Controlla">Se qualcosa non va, «Cambia» ti riporta a quel passo.</Sh>
            <div className={s.blk}>
                <h4>In una frase</h4>
                {/* chi non gestisce il Calendario tiene sempre pronto */}
                <p className={s.isent}>{sentence(live ? t : { ...t, onda: "off" }, L)}</p>
                {live && (t.kind === "menu" || t.kind === "stile") && (
                    <ScontriAvviso kind={t.kind === "menu" ? "menu" : "style"} scontri={effect.scontri} multi={L.multi} insieme={!!t.insieme} onInsieme={onInsieme} />
                )}
            </div>
            {!c.owner && (
                <div className={s.callout}>
                    <Lock size={16} aria-hidden />
                    <span>{`La messa in onda la decide chi gestisce il Calendario. Con «Salva e tieni ${o.pronto}» ${o.q} resta in «${KIND[t.kind].page}» come «${o.Pronto}, non in onda», con tutti i controlli fatti.`}</span>
                </div>
            )}
            <div className={s.blk}>
                <h4>Le tue scelte</h4>
                <dl className={s.isum}>
                    {st.map(x => (
                        <div key={x}>
                            <dt>{stepLabel(t, x)}</dt>
                            <dd>{stepSummary(t, x, L, styleName)}</dd>
                            <Button variant="ghost" size="sm" onClick={() => onGo(all.indexOf(x))}>
                                Cambia
                            </Button>
                        </div>
                    ))}
                </dl>
            </div>
            {c.owner && t.kind !== "storia" && (
                <div className={s.blk}>
                    <h4>Cosa cambia nel calendario</h4>
                    {live ? (
                        <ul className={s.ieff}>
                            {effect.lines.map((x, i) => (
                                <li key={i}>{x}</li>
                            ))}
                        </ul>
                    ) : (
                        <p>Niente: non è in onda in nessuna sede.</p>
                    )}
                </div>
            )}
            {!live && !fb && <Checks t={t} />}
            {fb && (
                <div className={s.callout}>
                    <TriangleAlert size={16} aria-hidden />
                    <span>
                        {fb.why}: torna a «{stepLabel(t, all[fb.i])}».
                    </span>
                </div>
            )}
        </>
    );
}

/* ---------- E adesso? (dopo un menù in onda) ---------- */
export function Adesso({ name, kids, onChain, onFinish }: { name: string; kids: readonly string[]; onChain: (k: "stile" | "evid" | "storia") => void; onFinish: () => void }) {
    const card = (k: "stile" | "evid" | "storia", icon: ReactNode, title: string, text: string) => {
        const done = kids.includes(k);
        return <Opt key={k} done={done} icon={done ? <Check size={16} /> : icon} title={title} text={done ? "Fatto: puoi aggiungerne un altro." : text} onClick={() => onChain(k)} />;
    };
    return (
        <>
            <Sh title="E adesso?">{name} è in onda. Vuoi aggiungere qualcosa?</Sh>
            <div className={s.opts}>
                {card("stile", <Palette size={16} />, "Dagli i tuoi colori", "Uno stile per questo menù.")}
                {card("evid", <Megaphone size={16} />, "Metti qualcosa in evidenza", "Coi piatti di questo menù a portata di mano.")}
                {card("storia", <ScrollText size={16} />, "Racconta una storia", "Testo e foto sotto il menù.")}
                <Opt icon={<Check size={16} />} title="Ho finito" text={`Vai alla pagina del ${KIND.menu.noun}.`} onClick={onFinish} />
            </div>
            <p className={s.hint}>Il tunnel che scegli ha già il quando e il dove di questo menù: puoi cambiarli.</p>
        </>
    );
}

