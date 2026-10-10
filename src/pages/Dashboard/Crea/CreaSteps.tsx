// I corpi dei passi dei tunnel, uno a uno dall'artifact (`bodyOf`). Il Quando
// e il Dove sono quelli del Calendario (`QuandoPasso`, `DoveQuandoPasso`); i blocchi
// della storia sono l'editor a blocchi di oggi.
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarClock, CalendarHeart, Check, Copy, Infinity as InfinityIcon, Layers, Link2, Lock, Megaphone, Package, Palette, Plus, ScanText, ScrollText, Tag, Trash2, TriangleAlert, Upload, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import type { StoryBlock } from "@/services/supabase/stories";
import { MAX_STORY_IMAGES } from "@/services/supabase/stories";
import type { V2Style } from "@/services/supabase/styles";
import { StoryBlockEditor } from "@/pages/Dashboard/Stories/components/StoryBlockEditor";
import { BLOCK_TYPE_META, BLOCK_TYPE_ORDER } from "@/pages/Dashboard/Stories/components/blocks/blockTypeMeta";
import { createBlock } from "@/pages/Dashboard/Stories/components/createBlock";
import type { StoryProductOptions } from "@/pages/Dashboard/Stories/components/StoryProductPicker";
import { DoveQuandoPasso, QuandoPasso, ScontriAvviso, type PassoGruppo, type PassoSede } from "@/pages/Dashboard/Programming/calendar/CalendarioPassi";
import { DB_LATER, invalid, type Draft, type DraftLookups, type Impatto, type PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import type { Axis, CalWhen } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import cal from "@/pages/Dashboard/Programming/calendar/CalendarioView.module.scss";
import { CARDS, COLORS, EV, FONTS, FONT_QUICK, KIND, MAX_IMPORT_FILES, STEP_LABEL, STORIA_WHEN, blocker, bundleTotal, euro, firstBlock, priceText, key, sentence, stepSummary, steps, type CardKey, type Ctx, type EvType, type Tunnel } from "./creaModel";
import s from "./Crea.module.scss";
import { Box, Chip, Field, Opt, Sh, Toggle, Warnish } from "./CreaUi";
import { DishAdder } from "./DishAdder";
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


/* ---------- il menù ---------- */
export function MenuTipo({ t, u }: { t: Tunnel; u: U }) {
    return (
        <>
            <Sh title="Che menù è?">Un menù con le sue sezioni, o una pagina d'ingresso che ne raccoglie più di uno: ristorante, aperitivo, bambini. A destra vedi com'è.</Sh>
            <div className={s.opts}>
                <Opt on={t.menuType === "classico"} icon={<UtensilsCrossed size={16} />} title="Menù classico" text="Sezioni e piatti, come oggi." onClick={() => u(x => void (x.menuType = "classico"))} />
                <Opt on={false} icon={<Layers size={16} />} title="Multi menù" text="Un riquadro per menù: il cliente tocca e ci entra." disabled later={"Arriva col database nuovo"} />
            </div>
            <p className={s.hint}>Gli stessi nomi del Calendario, dove i menù hanno l'etichetta «Menù classico» o «Multi menù».</p>
        </>
    );
}

export const IMPORT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function MenuParti({ t, u, onImport, importing, importError }: { t: Tunnel; u: U; onImport: ((files: File[]) => void) | null; importing: boolean; importError: string | null }) {
    const id = useId();
    const fileRef = useRef<HTMLInputElement>(null);
    const read = t.imported;
    return (
        <>
            <Sh title="Da dove parti">Il nome lo legge anche il cliente, in cima al menù.</Sh>
            <Field label="Nome del menù" id={id}>
                <input className={s.in} id={id} value={t.name} placeholder="Menù pranzo" autoComplete="off" onChange={e => u(x => void (x.name = e.target.value))} />
            </Field>
            <div className={s.opts}>
                <Opt on={t.source === "zero"} icon={<Plus size={16} />} title="Da zero" text="Prendi i piatti che hai o scrivine di nuovi." onClick={() => u(x => void (x.source = "zero"))} />
                <Opt
                    on={t.source === "foto"}
                    icon={<ScanText size={16} />}
                    title="Da una foto o un PDF"
                    text="Lo leggiamo noi, tu controlli nel passo dopo."
                    onClick={() => u(x => void (x.source = "foto"))}
                    disabled={!onImport && !read}
                />
            </div>
            {t.source === "foto" && (
                <>
                    {read ? (
                        <div className={cx(s.callout, s.ok)}>
                            <ScanText size={16} aria-hidden />
                            <span>
                                Letti {read.sections} {read.sections === 1 ? "sezione" : "sezioni"} e {read.dishes} {read.dishes === 1 ? "piatto" : "piatti"}: li controlli nel passo dopo. Il menù nasce solo quando salvi.
                            </span>
                        </div>
                    ) : (
                        <div className={cx(s.callout, s.info)}>
                            <Upload size={16} aria-hidden />
                            <span>Carica la foto del menù di carta o il PDF, anche più pagine (fino a {MAX_IMPORT_FILES}). Nel passo dopo trovi sezioni e piatti già scritti, da controllare.</span>
                        </div>
                    )}
                    {importError && (
                        <div className={s.callout} role="alert">
                            <TriangleAlert size={16} aria-hidden />
                            <span>{importError}</span>
                        </div>
                    )}
                    <div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={IMPORT_ACCEPT}
                            multiple
                            hidden
                            aria-label="Foto o PDF del menù"
                            onChange={e => {
                                const files = Array.from(e.target.files ?? []);
                                e.target.value = "";
                                if (files.length && onImport) onImport(files);
                            }}
                        />
                        <Button variant="secondary" size="sm" leftIcon={<Upload size={14} />} onClick={() => fileRef.current?.click()} disabled={!onImport} loading={importing}>
                            {importing ? "Leggiamo il menù…" : read ? "Leggi un'altra foto" : "Carica foto o PDF"}
                        </Button>
                    </div>
                    {read && <p className={s.hint}>Un'altra foto prende il posto di sezioni e piatti letti adesso.</p>}
                </>
            )}
        </>
    );
}

export function MenuSezioni({ t, u, pick }: { t: Tunnel; u: U; pick: readonly PickProduct[] }) {
    const [sec, setSec] = useState("");
    const taken = useMemo(() => new Set(t.sections.flatMap(x => x.dishes.map(d => d.productId).filter((v): v is string => !!v))), [t.sections]);
    const read = t.imported;
    const toCheck = t.sections.reduce((n, x) => n + x.dishes.filter(d => d.check).length, 0);
    const addSec = () => {
        const n = sec.trim();
        if (!n) return;
        u(x => void x.sections.push({ key: key(), name: n, dishes: [] }));
        setSec("");
    };
    return (
        <>
            <Sh title="Sezioni e piatti">{read ? "Ecco cosa abbiamo letto: controlla, togli e aggiungi come se l'avessi scritto tu." : "Prendi i piatti che hai già o scrivine di nuovi, con il prezzo."}</Sh>
            {read && (
                <div className={cx(s.callout, s.ok)}>
                    <ScanText size={16} aria-hidden />
                    <span>
                        Quelli già nei vostri prodotti li abbiamo collegati; gli altri diventano prodotti nuovi quando salvi.
                        {toCheck > 0 && ` ${toCheck === 1 ? "Uno è segnato" : `${toCheck} sono segnati`} «da controllare»: l'AI non ne era sicura.`}
                    </span>
                </div>
            )}
            {t.sections.map((x, si) => (
                <div className={s.sect} key={x.key}>
                    <h5>
                        {x.name}
                        <span className={s.grow} />
                        <IconButton size="sm" icon={<Trash2 size={14} />} aria-label={`Togli la sezione ${x.name}`} onClick={() => u(y => void y.sections.splice(si, 1))} />
                    </h5>
                    {x.dishes.map((d, di) => (
                        <div className={s.dish} key={d.key}>
                            <span>
                                {d.name}
                                {!d.productId && <span className={s.new}>nuovo</span>}
                                {d.check && <span className={s.check}>da controllare</span>}
                            </span>
                            <span className={s.p}>{priceText(d.price)}</span>
                            <IconButton size="sm" icon={<X size={14} />} aria-label={`Togli ${d.name}`} onClick={() => u(y => void y.sections[si].dishes.splice(di, 1))} />
                        </div>
                    ))}
                    <DishAdder pick={pick} taken={taken} onAdd={d => u(y => void y.sections[si].dishes.push({ key: key(), ...d }))} />
                    <p className={s.hint}>Scrivendo il nome compaiono i prodotti che avete già: preso uno, il prezzo è il suo.</p>
                </div>
            ))}
            <div className={cx(s.addrow, s.addrow2)}>
                <input
                    className={cx(s.in, s.sm)}
                    placeholder="Nome della sezione, per esempio Dolci"
                    autoComplete="off"
                    aria-label="Nome della sezione"
                    value={sec}
                    onChange={e => setSec(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSec())}
                />
                <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={addSec}>
                    Aggiungi una sezione
                </Button>
            </div>
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
            <Sh title="Racconta una storia">Chi siete, da dove vengono gli ingredienti, il piatto del mese. Compare sotto il menù, con testo e foto, e si legge toccandola.</Sh>
            <p className={s.hint}>Nel telefono a destra vedi dove compare: sotto il menù, nelle storie.</p>
        </>
    );
}

/* ---------- lo stile ---------- */
export function StileNome({ t, u, styles, onBase }: { t: Tunnel; u: U; styles: readonly V2Style[]; onBase: (id: string | null) => void }) {
    const id = useId();
    return (
        <>
            <Sh title="Il nome">Lo vedete solo voi, nell'elenco degli stili e nel Calendario.</Sh>
            <Field label="Nome dello stile" id={id}>
                <input className={s.in} id={id} value={t.name} placeholder="Natale" autoComplete="off" onChange={e => u(x => void (x.name = e.target.value))} />
            </Field>
            <div className={s.opts}>
                <Opt on={t.base === "zero"} icon={<Plus size={16} />} title="Da zero" text="Parti dai colori di CataloGlobe." onClick={() => onBase(null)} />
                <Opt on={t.base === "copy"} icon={<Copy size={16} />} title="Parti da uno stile che hai" text="Ne fai una copia e la cambi." onClick={() => onBase(t.baseStyleId ?? styles[0]?.id ?? null)} disabled={!styles.length} />
            </div>
            {t.base === "copy" && (
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

export function StileAspetto({ t, u }: { t: Tunnel; u: U }) {
    return (
        <>
            <Sh title="L'aspetto">Le quattro cose che cambiano di più la pagina. Il resto si rifinisce dopo, nell'editor dello stile.</Sh>
            <div className={s.blk}>
                <h4>Colore principale</h4>
                <div className={s.sw}>
                    {COLORS.map(([c, n]) => (
                        <button key={c} type="button" className={s.swb} style={{ background: c }} aria-pressed={t.color === c} aria-label={n} title={n} onClick={() => u(x => void (x.color = c))} />
                    ))}
                </div>
            </div>
            <div className={s.blk}>
                <h4>Sfondo della pagina</h4>
                <div className={s.chips}>
                    <Chip on={!t.dark} onClick={() => u(x => void (x.dark = false))}>
                        Chiaro
                    </Chip>
                    <Chip on={t.dark} onClick={() => u(x => void (x.dark = true))}>
                        Scuro
                    </Chip>
                </div>
            </div>
            <div className={s.blk}>
                <h4>Carattere</h4>
                <div className={s.chips}>
                    {FONT_QUICK.map(f => (
                        <Chip key={f} on={t.font === f} onClick={() => u(x => void (x.font = f))} style={{ fontFamily: FONTS[f].css }}>
                            {FONTS[f].name}
                        </Chip>
                    ))}
                    {!FONT_QUICK.includes(t.font) && (
                        <Chip on onClick={() => undefined} style={{ fontFamily: FONTS[t.font].css }}>
                            {FONTS[t.font].name}
                        </Chip>
                    )}
                    <span className={s.hint}>e altri sei nell'editor</span>
                </div>
            </div>
            <div className={s.blk}>
                <h4>I piatti</h4>
                <div className={s.chips}>
                    {(Object.keys(CARDS) as CardKey[]).map(k => (
                        <Chip key={k} on={t.card === k} onClick={() => u(x => void (x.card = k))}>
                            {CARDS[k]}
                        </Chip>
                    ))}
                </div>
            </div>
            <p className={s.hint}>Dopo «Metti in onda» si arriva sulla pagina dello stile, con l'editor intero: header, navigazione delle sezioni, in evidenza, prodotti, tipografia, versioni.</p>
        </>
    );
}

/* ---------- in evidenza ---------- */
const EV_ICON: Record<EvType, ReactNode> = { annuncio: <Megaphone size={16} />, evento: <CalendarHeart size={16} />, promo: <Tag size={16} />, bundle: <Package size={16} /> };

export function EvidCosa({ t, u }: { t: Tunnel; u: U }) {
    return (
        <>
            <Sh title="Metti qualcosa in evidenza">Compare in cima al menù o in fondo. Scegli cosa: ognuno ha il suo esempio a destra.</Sh>
            <div className={s.opts}>
                {(Object.keys(EV) as EvType[]).map(k => (
                    <Opt key={k} on={t.evType === k} icon={EV_ICON[k]} title={EV[k].name} text={EV[k].desc} onClick={() => u(x => void (x.evType = k))} />
                ))}
            </div>
        </>
    );
}

export function EvidContenuto({ t, u, owner, imageUrl }: { t: Tunnel; u: U; owner: boolean; imageUrl: string | null }) {
    const ids = { title: useId(), sub: useId(), text: useId(), inner: useId(), cta: useId(), link: useId(), img: useId() };
    const ex = EV[t.evType ?? "evento"].ex;
    return (
        <>
            <Sh title="Il contenuto">Quello che legge il cliente. Il nome interno lo vedete solo voi.</Sh>
            <Field label="Titolo" id={ids.title}>
                <input className={s.in} id={ids.title} value={t.title} placeholder={ex[0]} autoComplete="off" onChange={e => u(x => void (x.title = e.target.value))} />
            </Field>
            <Field label="Sottotitolo" id={ids.sub}>
                <input className={s.in} id={ids.sub} value={t.sub} placeholder="Facoltativo" autoComplete="off" onChange={e => u(x => void (x.sub = e.target.value))} />
            </Field>
            <Field label="Descrizione" id={ids.text}>
                <textarea className={s.in} id={ids.text} value={t.text} placeholder={ex[1]} onChange={e => u(x => void (x.text = e.target.value))} />
            </Field>
            <div className={s.row2}>
                <div className={s.f}>
                    <label htmlFor={ids.inner}>Nome interno</label>
                    <input className={s.in} id={ids.inner} value={t.inner} placeholder="Se vuoto, il titolo" autoComplete="off" onChange={e => u(x => void (x.inner = e.target.value))} />
                </div>
                <div className={s.f}>
                    <span className={s.lab}>Immagine</span>
                    <ImagePick url={imageUrl} id={ids.img} onPick={f => u(x => void (x.image = f))} />
                </div>
            </div>
            <div className={s.blk}>
                <Toggle on={t.cta} onClick={() => u(x => void (x.cta = !x.cta))}>
                    Un bottone sotto il testo
                </Toggle>
                {t.cta && (
                    <div className={s.row2}>
                        <div className={s.f}>
                            <label htmlFor={ids.cta}>Testo del bottone</label>
                            <input className={s.in} id={ids.cta} value={t.ctaText} autoComplete="off" onChange={e => u(x => void (x.ctaText = e.target.value))} />
                        </div>
                        <div className={s.f}>
                            <label htmlFor={ids.link}>Link del bottone</label>
                            <input className={s.in} id={ids.link} value={t.ctaLink} placeholder="https://" inputMode="url" autoComplete="off" onChange={e => u(x => void (x.ctaLink = e.target.value))} />
                        </div>
                    </div>
                )}
            </div>
            {owner && (
                <div className={s.blk}>
                    <h4>Dove sulla pagina</h4>
                    <div className={s.chips}>
                        <Chip on={t.slot === "before"} onClick={() => u(x => void (x.slot = "before"))}>
                            Sopra il menù
                        </Chip>
                        <Chip on={t.slot === "after"} onClick={() => u(x => void (x.slot = "after"))}>
                            Sotto il menù
                        </Chip>
                    </div>
                    <p className={s.hint}>Oggi si sceglie nella regola del Calendario; nel tunnel la chiediamo qui, insieme al contenuto.</p>
                </div>
            )}
        </>
    );
}

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
            <Sh title="Piatti">
                {promo ? "Ogni piatto col suo prezzo, e una nota se serve: «-20% a pranzo», «solo il giovedì»." : "Più piatti insieme, a un prezzo unico."} Si prendono dai prodotti che avete.
            </Sh>
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
                        <label htmlFor={bid}>Prezzo del bundle</label>
                        <span className={s.rng}>
                            <input className={cx(s.in, s.num)} id={bid} value={t.bundle} placeholder="45" inputMode="decimal" onChange={e => u(x => void (x.bundle = e.target.value))} /> €
                        </span>
                    </div>
                    <div className={s.blk}>
                        <Toggle on={t.showOrig} onClick={() => u(x => void (x.showOrig = !x.showOrig))}>
                            Mostra il totale originale barrato{t.dishes.length ? ` (${euro(tot)})` : ""}
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
                <ImagePick url={coverUrl} id={ids.c} onPick={f => u(x => void (x.cover = f))} />
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
            <Sh title="Quando">Quando lo vede il cliente. Si cambia quando vuoi dal Calendario.</Sh>
            {t.from && <Inherited>Già compilato dal menù {q(t.from.name)}: puoi cambiarlo.</Inherited>}
            {t.aside && <Inherited>Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.</Inherited>}
            {choice}
            <p className={s.hint}>{KIND_TXT[t.kind]}</p>
        </>
    );
}

/** Dove e quando, con più sedi (D145): il passo del Calendario, col «Sempre» del tunnel dentro. */
export function DoveQuando(p: { t: Tunnel; u: U; draft: Draft; updDraft: Upd; sedi: readonly PassoSede[]; groups: readonly PassoGruppo[]; L: DraftLookups; durs: readonly CalWhen[]; axis: Axis }) {
    const { t, draft } = p;
    const storia = t.kind === "storia";
    const storiaBad = storia ? blocker(t, "dove", { owner: true, multi: true }) : "";
    return (
        <>
            <Sh title="Dove e quando">In quali sedi e quando lo vede il cliente. Si cambia quando vuoi dal Calendario.</Sh>
            {t.from && <Inherited>Già compilato dal menù {q(t.from.name)}: puoi cambiarlo.</Inherited>}
            {t.aside && <Inherited>Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.</Inherited>}
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
                    split={!storia}
                    quando={<Quando bare t={t} u={p.u} draft={draft} updDraft={p.updDraft} durs={p.durs} axis={p.axis} />}
                />
            </div>
            <p className={s.hint}>
                {storia ? storiaBad ? <Warnish>{storiaBad}.</Warnish> : `Oggi una storia va in tutte le sedi o in una sola; per alcune sedi ${DB_LATER}.` : KIND_TXT[t.kind]}
            </p>
        </>
    );
}

/* ---------- Controlla ---------- */
export function Controlla({
    t,
    c,
    L,
    effect,
    styleName,
    onGo,
    onInsieme
}: {
    t: Tunnel;
    c: Ctx;
    L: DraftLookups;
    effect: Impatto;
    styleName: (id: string) => string;
    onGo: (i: number) => void;
    onInsieme: (v: boolean) => void;
}) {
    const all = steps(t, c);
    const st = all.filter(x => x !== "controlla" && x !== "serve");
    const fb = firstBlock(t, c);
    return (
        <>
            <Sh title="Controlla">Se qualcosa non va, «Cambia» ti riporta a quel passo.</Sh>
            {c.owner ? (
                <div className={s.blk}>
                    <h4>In una frase</h4>
                    <p className={s.isent}>{sentence(t, L)}</p>
                    {(t.kind === "menu" || t.kind === "stile") && (
                        <ScontriAvviso kind={t.kind === "menu" ? "menu" : "style"} scontri={effect.scontri} multi={L.multi} insieme={!!t.insieme} onInsieme={onInsieme} />
                    )}
                </div>
            ) : (
                <div className={cx(s.callout, s.info)}>
                    <Lock size={16} aria-hidden />
                    <span>La messa in onda la decide chi gestisce il Calendario: con «Salva» lo trova {t.kind === "storia" ? "tra le storie in bozza" : "tra le bozze"}, con tutto pronto.</span>
                </div>
            )}
            <div className={s.blk}>
                <h4>Le tue scelte</h4>
                <dl className={s.isum}>
                    {st.map(x => (
                        <div key={x}>
                            <dt>{STEP_LABEL[x]}</dt>
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
                    <ul className={s.ieff}>
                        {effect.lines.map((x, i) => (
                            <li key={i}>{x}</li>
                        ))}
                    </ul>
                </div>
            )}
            {fb && (
                <div className={s.callout}>
                    <TriangleAlert size={16} aria-hidden />
                    <span>
                        {fb.why}: torna a «{STEP_LABEL[all[fb.i]]}».
                    </span>
                </div>
            )}
        </>
    );
}

/* ---------- E adesso? (dopo un menù in onda) ---------- */
export function Adesso({ name, kids, onChain, onFinish, can }: { name: string; kids: readonly string[]; onChain: (k: "stile" | "evid" | "storia") => void; onFinish: () => void; can: Record<"stile" | "evid" | "storia", boolean> }) {
    const card = (k: "stile" | "evid" | "storia", icon: ReactNode, title: string, text: string) => {
        const done = kids.includes(k);
        return <Opt key={k} done={done} icon={done ? <Check size={16} /> : icon} title={title} text={done ? "Fatto: puoi aggiungerne un altro." : text} onClick={() => onChain(k)} disabled={!can[k]} />;
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

