import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { DraftLookups } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { EV, bundlePrice, bundleTotal, euro, type StepId, type Tunnel } from "./creaModel";
import { phoneVars } from "./creaStyle";
import s from "./Crea.module.scss";
import { DishRow, MenuSample, type SampleSection } from "./MenuSample";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");


const price = (p: number | null) => (p == null ? "" : euro(p));

type PhoneProps = {
    t: Tunnel;
    step: StepId;
    tk: StyleTokenModel;
    business: string;
    /** I menù che ci sono già, per le schede in alto. */
    menus: string[];
    sample: SampleSection[];
    L: DraftLookups;
    imageUrl: string | null;
    coverUrl: string | null;
};

/** Il telefono a destra del tunnel (artifact, `phoneHTML`): com'è adesso quello che si crea. */
export function CreaPhone({ t, step, tk, business, menus, sample, L, imageUrl, coverUrl }: PhoneProps) {
    const head = (
        <div>
            <div className={s.pName}>{business || "Il tuo locale"}</div>
        </div>
    );
    let body;
    if (t.kind === "menu") {
        const secs = t.sections;
        body = (
            <>
                {head}
                <div className={s.pTabs}>
                    <span className={s.on}>{t.name.trim() || "Il menù nuovo"}</span>
                </div>
                {t.i === 0 && !secs.length ? (
                    <MenuSample sample={sample} tk={tk} />
                ) : (
                    <div className={cx(s.pSec, step === "sezioni" && s.hl)}>
                        {secs.length ? (
                            secs.map(sec => (
                                <div key={sec.key} className={s.pSec}>
                                    <div className={s.pH}>{sec.name}</div>
                                    {sec.dishes.length ? (
                                        sec.dishes.map(d => <DishRow key={d.key} name={d.name} p={d.price} tk={tk} />)
                                    ) : (
                                        <div className={s.pEmpty}>Nessun piatto</div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className={s.pEmpty}>Nessuna sezione</div>
                        )}
                    </div>
                )}
            </>
        );
    } else if (t.kind === "stile") {
        body = (
            <>
                {head}
                {menus.length > 0 && (
                    <div className={s.pTabs}>
                        {menus.slice(0, 2).map((m, i) => (
                            <span key={m} className={i === 0 ? s.on : undefined}>
                                {m}
                            </span>
                        ))}
                    </div>
                )}
                <MenuSample sample={sample} tk={tk} />
            </>
        );
    } else if (t.kind === "evid") {
        const ty = t.evType ?? "evento", ex = EV[ty].ex;
        const dishes = t.dishes.map(id => ({ id, name: L.products.get(id)?.name ?? "Prodotto", price: L.products.get(id)?.listPrice ?? null }));
        const feat = (
            <div className={cx(s.pFeat, step !== "controlla" && !!t.evType && s.hl)}>
                <span className={s.k}>{EV[ty].name}</span>
                {imageUrl && <img src={imageUrl} alt="" />}
                <b>{t.title.trim() || ex[0]}</b>
                {t.sub.trim() && <span style={{ fontWeight: 600 }}>{t.sub.trim()}</span>}
                <span>{t.text.trim() || ex[1]}</span>
                {ty === "promo" &&
                    dishes.map(d => (
                        <span key={d.id} className={s.fd}>
                            <span>
                                {d.name} {t.notes[d.id]?.trim() && <i>{t.notes[d.id].trim()}</i>}
                            </span>
                            <b>{price(d.price)}</b>
                        </span>
                    ))}
                {ty === "bundle" && dishes.length > 0 && (
                    <>
                        <span>{dishes.map(d => d.name).join(" · ")}</span>
                        <span className={s.fd}>
                            <span>{t.showOrig && <s>{euro(bundleTotal(t, L))}</s>}</span>
                            <b>{bundlePrice(t) > 0 ? euro(bundlePrice(t)) : "… €"}</b>
                        </span>
                    </>
                )}
                {t.cta && <span className={s.cta}>{t.ctaText.trim() || "Prenota"}</span>}
            </div>
        );
        body = (
            <>
                {head}
                {t.slot === "before" && feat}
                <MenuSample sample={sample.slice(0, 2)} tk={tk} />
                {t.slot === "after" && feat}
            </>
        );
    } else if (step === "blocchi") {
        body = (
            <div className={cx(s.pBody, s.pRead)}>
                <div className={cx(s.sc, !coverUrl && s.noCover)} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined} />
                <span className={s.pH}>{t.kicker.trim() || "La nostra cucina"}</span>
                <div className={s.pName}>{t.title.trim() || "Il titolo della storia"}</div>
                {t.blocks.map(b =>
                    b.type === "quote" ? (
                        <q key={b.id}>{b.content || "La citazione"}</q>
                    ) : b.type === "image" ? (
                        <div key={b.id} className={s.img} style={b.url ? { backgroundImage: `url(${b.url})` } : undefined} />
                    ) : b.type === "video" ? (
                        <div key={b.id} className={s.img} />
                    ) : b.type === "product" ? (
                        <div key={b.id} className={s.dishlink}>
                            <b>{(b.productId && L.products.get(b.productId)?.name) || "Un prodotto"}</b>
                            <span>{price(b.productId ? (L.products.get(b.productId)?.listPrice ?? null) : null)}</span>
                        </div>
                    ) : b.type === "heading" ? (
                        <b key={b.id} style={{ fontSize: 14 }}>
                            {b.content || "Un titolo"}
                        </b>
                    ) : b.type === "list" ? (
                        <ul key={b.id}>
                            {(b.items.filter(x => x.trim()).length ? b.items.filter(x => x.trim()) : ["Una voce"]).map((x, j) => (
                                <li key={j}>{x}</li>
                            ))}
                        </ul>
                    ) : (
                        <p key={b.id}>{b.content || "Il testo"}</p>
                    )
                )}
            </div>
        );
    } else {
        body = (
            <>
                {head}
                <MenuSample sample={sample.slice(0, 1)} tk={tk} />
                <div className={s.pSec}>
                    <div className={s.pH}>Le nostre storie</div>
                    <div className={s.pStories}>
                        {t.i > 0 && (
                            <div className={cx(s.pStory, step !== "controlla" && s.hl)}>
                                <div className={cx(s.sc, !coverUrl && s.noCover)} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined} />
                                <div className={s.st}>
                                    <span>{t.kicker.trim() || "La nostra cucina"}</span>
                                    <b>{t.title.trim() || "Il titolo della storia"}</b>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }
    const reading = t.kind === "storia" && step === "blocchi";
    return (
        <div className={s.phone}>
            <div className={s.screen} style={phoneVars(tk)}>
                <div className={s.scr}>
                    {reading ? (
                        body
                    ) : (
                        <>
                            <div className={s.pCover} />
                            <div className={s.pBody}>{body}</div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
