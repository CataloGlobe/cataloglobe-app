import { forwardRef, type CSSProperties } from "react";
import { ChevronLeft, ImageIcon } from "lucide-react";
import type { ProdottoPart } from "./prodottoCopy";
import { hiddenToday, isVariant, type ProdottoFacts } from "./prodottoModel";
import styles from "./Prodotto.module.scss";

interface ProdottoPhoneProps {
    facts: ProdottoFacts;
    /** La parte accesa (passando su una tessera, o quella a fuoco). */
    highlight?: ProdottoPart | null;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Il prodotto come lo apre il cliente, in piccolo (artifact «Scheda del
 * prodotto», `phoneHTML()`): le stesse parti nello stesso ordine, ognuna col
 * suo `data-part` per accendersi e per agganciare lo scorrimento della
 * pagina. È un disegno coi valori della bozza, prima del Salva, e coi colori
 * dello stile del menù.
 */
export const ProdottoPhone = forwardRef<HTMLDivElement, ProdottoPhoneProps>(function ProdottoPhone(
    { facts: f, highlight = null },
    scrRef
) {
    const variant = isVariant(f);
    // Le parti che la variante prende dal padre non le disegniamo: le ha lui.
    // Quelle che il verticale non usa non arrivano al menù.
    const traits = variant || !f.show.caratteristiche ? [] : f.characteristics;
    const pairings = variant || !f.show.abbinamenti ? [] : f.pairings;
    const notes = variant || !f.show.note ? [] : f.notes;
    const allergens = f.show.allergeni ? f.allergens : [];
    const ingredients = f.show.ingredienti ? f.ingredients : [];
    const part = (k: ProdottoPart, className?: string) => ({
        "data-part": k,
        className: cx(className, highlight === k && styles.hl)
    });
    const screenStyle = {
        "--st-bg": f.palette.background,
        "--st-text": f.palette.muted,
        "--st-primary": f.palette.primary,
        "--st-accent": f.palette.accent
    } as CSSProperties;
    const coverStyle: CSSProperties | undefined = f.imageUrl ? { backgroundImage: `url("${f.imageUrl}")` } : undefined;

    return (
        <div className={styles.phone} aria-hidden>
            <div className={styles.screen} style={screenStyle}>
                <div className={styles.pBar}>
                    <ChevronLeft size={15} strokeWidth={2} />
                    <span>{f.businessName}</span>
                </div>
                {hiddenToday(f) && (
                    <div className={styles.pOff}>
                        <b>Oggi non si vede</b>
                        <span>Nessun {f.labels.catalog} attivo lo mostra. Quando torna visibile, è così.</span>
                    </div>
                )}
                <div className={styles.scr} ref={scrRef}>
                    <span {...part("piatto", styles.pCover)} style={coverStyle}>
                        {!f.imageUrl && <ImageIcon size={28} strokeWidth={1.5} />}
                    </span>
                    <div className={styles.pBody}>
                        <div className={styles.pName}>
                            <span {...part("piatto")}>{f.name || "Senza nome"}</span>
                            <span {...part("prezzo", styles.pPrice)}>{f.priceLabel}</span>
                        </div>
                        {traits.length > 0 && (
                            <div {...part("caratteristiche", styles.pBadges)}>
                                {traits.map(t => (
                                    <span key={t}>{t}</span>
                                ))}
                            </div>
                        )}
                        {f.description.trim() && <p {...part("piatto", styles.pDesc)}>{f.description}</p>}
                        {allergens.length > 0 && (
                            <div {...part("allergeni")}>
                                <div className={styles.pH}>Allergeni</div>
                                <div className={styles.pChips}>
                                    {allergens.map(a => (
                                        <span key={a}>{a}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {f.priceMode === "formato" && f.formats.length > 0 && (
                            <div {...part("prezzo", styles.pSec)}>
                                <div className={styles.pH}>Formato</div>
                                {f.formats.map((x, i) => (
                                    <div key={`${x.name}-${i}`} className={styles.pOpt}>
                                        <span>{x.name}</span>
                                        <span>{x.price}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {f.choices.map(c => (
                            <div key={c.name} {...part("scelte", styles.pSec)}>
                                <div className={styles.pH}>
                                    {c.name} · {c.rule}
                                </div>
                                {c.options.map(o => (
                                    <div key={o.name} className={styles.pOpt}>
                                        <span>{o.name}</span>
                                        <span>{o.price}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {pairings.length > 0 && (
                            <div {...part("abbinamenti", styles.pSec)}>
                                <div className={styles.pH}>Perfetto con</div>
                                <div className={styles.pPair}>
                                    {pairings.map(p => (
                                        <span key={p}>{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {ingredients.length > 0 && (
                            <div {...part("ingredienti", styles.pSec)}>
                                <div className={styles.pH}>Ingredienti</div>
                                <div>{ingredients.join(", ")}</div>
                            </div>
                        )}
                        {notes.length > 0 && (
                            <div {...part("note", styles.pSec)}>
                                <div className={styles.pH}>Da sapere</div>
                                <div className={styles.pNote}>
                                    {notes.map((n, i) => (
                                        <span key={i} className={styles.contents}>
                                            <b>{n.label}</b>
                                            <span>{n.value}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.pAdd}>Aggiungi · {f.priceLabel}</div>
            </div>
        </div>
    );
});
