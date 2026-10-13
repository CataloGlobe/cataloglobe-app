// «Il contenuto» di un contenuto in evidenza (D187): niente tipo da scegliere.
// «Cosa dici» c'è sempre; i piatti e il pulsante si aggiungono se servono e
// diventano una parte come le altre. Creando, in cima, le idee da cui partire.
import { useId, type ReactNode } from "react";
import { CalendarHeart, ChefHat, Megaphone, MousePointerClick, Plus, Tag, UtensilsCrossed } from "lucide-react";
import type { DraftLookups, PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { hasDishes, type Tunnel } from "./creaModel";
import { IDEE, dropDishes, dropIdea, ideaOf, pickIdea, type IdeaId } from "./evidIdee";
import { EvidPiatti, type U } from "./CreaSteps";
import { Chip, Field, Sh } from "./CreaUi";
import { ImagePick } from "./ImagePick";
import s from "./Crea.module.scss";
import st from "./StileAspetto.module.scss";
import e from "./Evid.module.scss";

const IDEA_ICON: Record<IdeaId, ReactNode> = {
    chef: <ChefHat size={17} />,
    offerta: <Tag size={17} />,
    fisso: <UtensilsCrossed size={17} />,
    serata: <CalendarHeart size={17} />,
    avviso: <Megaphone size={17} />
};

export function EvidIdee({ t, u }: { t: Tunnel; u: U }) {
    const idea = ideaOf(t.idea);
    if (idea)
        return (
            <div className={`${e.start} ${e.line}`}>
                Partito da <b>{idea.name}</b>
                <button type="button" className={st.linkb} onClick={() => u(dropIdea)}>
                    Parti da un'altra idea
                </button>
            </div>
        );
    return (
        <div className={e.start}>
            <div>
                <b>Parti da un'idea</b>
                <p>Cosa diresti al tavolo? Trovi gli esempi già nei campi, da riscrivere. Oppure salta e componi qui sotto.</p>
            </div>
            <div className={e.jobs}>
                {IDEE.map(j => (
                    <div className={e.job} key={j.job}>
                        <small>{j.job}</small>
                        {j.ideas.map(i => (
                            <button
                                type="button"
                                className={e.idea}
                                key={i.id}
                                onClick={() => u(x => pickIdea(x, i))}
                            >
                                {IDEA_ICON[i.id]}
                                <span>
                                    <b>{i.name}</b>
                                    <small>{i.say}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function EvidParte({ icon, title, now, onRemove, children }: { icon?: ReactNode; title: string; now?: string; onRemove?: () => void; children: ReactNode }) {
    return (
        <section className={st.part} aria-label={title}>
            <div className={st.parth}>
                {icon && <span className={e.icon}>{icon}</span>}
                <b>{title}</b>
                {now && <span className={st.now}>{now}</span>}
                {onRemove && (
                    <button type="button" className={st.linkb} onClick={onRemove}>
                        Togli
                    </button>
                )}
            </div>
            <div className={e.body}>{children}</div>
        </section>
    );
}

export function EvidAggiungi({ title, why, onClick }: { title: string; why: string; onClick: () => void }) {
    return (
        <button type="button" className={e.addp} onClick={onClick}>
            <Plus size={18} />
            <span>
                <b>{title}</b>
                <small>{why}</small>
            </span>
        </button>
    );
}

export function EvidContenuto({ t, u, owner, imageUrl, pick, L }: { t: Tunnel; u: U; owner: boolean; imageUrl: string | null; pick: readonly PickProduct[]; L: DraftLookups }) {
    const ids = { title: useId(), sub: useId(), text: useId(), inner: useId(), cta: useId(), link: useId(), img: useId() };
    const ex = ideaOf(t.idea)?.ex ?? ["Giovedì karaoke", "Facoltativo", "Come lo diresti al tavolo."];
    const dishes = hasDishes(t);
    return (
        <>
            <Sh title="Il contenuto">Quello che diresti a voce arrivando al tavolo. I piatti e il pulsante si aggiungono solo se servono.</Sh>
            <div className={st.asp}>
                {!t.edit && <EvidIdee t={t} u={u} />}
                <EvidParte title="Cosa dici" now={t.title.trim() ? `«${t.title.trim()}»` : "ancora vuoto"}>
                    <Field label="Titolo" id={ids.title}>
                        <input className={s.in} id={ids.title} value={t.title} placeholder={ex[0]} autoComplete="off" onChange={ev => u(x => void (x.title = ev.target.value))} />
                    </Field>
                    <Field label="Sottotitolo" id={ids.sub}>
                        <input className={s.in} id={ids.sub} value={t.sub} placeholder={ex[1]} autoComplete="off" onChange={ev => u(x => void (x.sub = ev.target.value))} />
                    </Field>
                    <Field label="Descrizione" id={ids.text}>
                        <textarea className={s.in} id={ids.text} value={t.text} placeholder={ex[2]} onChange={ev => u(x => void (x.text = ev.target.value))} />
                    </Field>
                    <div className={s.row2}>
                        <div className={s.f}>
                            <span className={s.lab}>Immagine</span>
                            <ImagePick
                                url={imageUrl}
                                id={ids.img}
                                onPick={f =>
                                    u(x => {
                                        x.image = f;
                                        if (!f) x.imageUrl = null;
                                    })
                                }
                            />
                        </div>
                        <div className={s.f}>
                            <label htmlFor={ids.inner}>Nome interno</label>
                            <input className={s.in} id={ids.inner} value={t.inner} placeholder="Se vuoto, il titolo" autoComplete="off" onChange={ev => u(x => void (x.inner = ev.target.value))} />
                            <p className={s.hint}>Lo vedi solo tu.</p>
                        </div>
                    </div>
                    {owner && !t.edit && (
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
                        </div>
                    )}
                </EvidParte>
                {dishes && (
                    <EvidParte
                        icon={<UtensilsCrossed size={17} />}
                        title="I piatti"
                        now={`${t.dishes.length} ${t.dishes.length === 1 ? "piatto" : "piatti"} · ${t.evType === "bundle" ? "a prezzo unico" : "coi loro prezzi"}`}
                        onRemove={() => u(dropDishes)}
                    >
                        <EvidPiatti t={t} u={u} pick={pick} L={L} />
                    </EvidParte>
                )}
                {t.cta && (
                    <EvidParte icon={<MousePointerClick size={17} />} title="Il pulsante" now={t.ctaText.trim() ? `«${t.ctaText.trim()}»` : ""} onRemove={() => u(x => void (x.cta = false))}>
                        <div className={s.row2}>
                            <div className={s.f}>
                                <label htmlFor={ids.cta}>La scritta sul pulsante</label>
                                <input className={s.in} id={ids.cta} value={t.ctaText} autoComplete="off" onChange={ev => u(x => void (x.ctaText = ev.target.value))} />
                            </div>
                            <div className={s.f}>
                                <label htmlFor={ids.link}>Dove porta</label>
                                <input className={s.in} id={ids.link} value={t.ctaLink} placeholder="https://" inputMode="url" autoComplete="off" onChange={ev => u(x => void (x.ctaLink = ev.target.value))} />
                                <p className={s.hint}>Un link: le prenotazioni, i biglietti, una pagina tua.</p>
                            </div>
                        </div>
                    </EvidParte>
                )}
                {(!dishes || !t.cta) && (
                    <div className={e.adds}>
                        {!dishes && <EvidAggiungi title="Dei piatti" why="Per far ordinare adesso: consigli, offerte, un menù a prezzo unico" onClick={() => u(x => void (x.evType = "promo"))} />}
                        {!t.cta && <EvidAggiungi title="Un pulsante" why="Porta a una pagina: prenotazioni, biglietti, un modulo" onClick={() => u(x => void (x.cta = true))} />}
                    </div>
                )}
            </div>
        </>
    );
}
