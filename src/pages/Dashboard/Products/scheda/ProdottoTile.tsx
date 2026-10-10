import type { ReactNode } from "react";
import { Copy, Eye, EyeOff, Link2, MapPin, SlidersHorizontal } from "lucide-react";
import { PART_ICON, partTitle, type ProdottoPart } from "./prodottoCopy";
import {
    capitalize,
    hiddenToday,
    inheritedPart,
    joinNames,
    missingLanguages,
    withArticle,
    type ProdottoFacts
} from "./prodottoModel";
import styles from "./Prodotto.module.scss";
import { ProdottoTileFoot } from "./ProdottoTileFoot";

export interface TileActions {
    open: (part: ProdottoPart) => void;
    changed: (part: ProdottoPart) => boolean;
}

interface ProdottoTileProps {
    part: ProdottoPart;
    facts: ProdottoFacts;
    actions: TileActions;
    wide?: boolean;
    highlighted?: boolean;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const eye = <Eye size={14} strokeWidth={1.75} aria-hidden />;
const eyeOff = <EyeOff size={14} strokeWidth={1.75} aria-hidden />;
const lower = (names: string[]) => joinNames(names.map(n => n.toLowerCase()));

/**
 * Una tessera del cruscotto (artifact «Scheda del prodotto», `tile()`): la
 * risposta in grande, il dettaglio, e in fondo dove si vede sul telefono.
 * Tutta la tessera apre la parte a fuoco.
 */
export function ProdottoTile({ part, facts: f, actions, wide = false, highlighted = false }: ProdottoTileProps) {
    const Icon = PART_ICON[part];
    const title = partTitle(part, f.labels);
    let ans: ReactNode = null;
    let det: ReactNode = null;
    let foot: ReactNode = null;
    let muted = false;

    if (inheritedPart(f, part)) {
        ans = `Come ${f.parentName}`;
        muted = true;
        det = <span>Li prende da {f.parentName}. Per cambiarli, aprite {f.parentName}.</span>;
        foot = <ProdottoTileFoot icon={<Link2 size={14} strokeWidth={1.75} aria-hidden />} text={`Da ${f.parentName}`} />;
    } else {
        switch (part) {
            case "caratteristiche": {
                const n = f.characteristics.length;
                ans = n ? f.characteristics.join(" · ") : "Nessuna";
                muted = !n;
                det = n ? null : <span>Per esempio vegano, piccante, fatto in casa.</span>;
                foot = <ProdottoTileFoot icon={n ? eye : eyeOff} text={n ? "Sotto il nome" : "Non compare"} />;
                break;
            }
            case "allergeni": {
                const n = f.allergens.length;
                ans = n ? `Contiene ${lower(f.allergens)}` : "Nessuno segnato";
                muted = !n;
                det = n ? (
                    <div className={styles.miniAl}>
                        {f.allergens.map(a => (
                            <span key={a}>{a}</span>
                        ))}
                    </div>
                ) : (
                    <span>Se non ne contiene nessuno, va bene così.</span>
                );
                foot = <ProdottoTileFoot icon={n ? eye : eyeOff} text={n ? "Sotto la descrizione" : "Non compare"} />;
                break;
            }
            case "scelte": {
                const n = f.choices.length;
                if (f.optionsLoading) {
                    ans = "…";
                    muted = true;
                } else {
                    ans = n
                        ? `${n === 1 ? "Una domanda" : `${n} domande`}: ${lower(f.choices.map(c => c.name))}`
                        : "Si ordina così com'è";
                    muted = !n;
                }
                det =
                    n || f.emptyChoices.length ? (
                        <>
                            {f.choices.map(c => (
                                <span key={c.name}>
                                    <b className={styles.detStrong}>{c.name}</b>, {c.rule}: {lower(c.options.map(o => o.name))}
                                </span>
                            ))}
                            {f.emptyChoices.map(name => (
                                <span key={`vuota-${name}`} className={styles.tfHid}>
                                    {name}: nessuna opzione, il cliente non la vede
                                </span>
                            ))}
                        </>
                    ) : null;
                foot = <ProdottoTileFoot icon={n ? eye : eyeOff} text={n ? "Prima di «Aggiungi»" : "Non compare"} />;
                break;
            }
            case "abbinamenti": {
                const n = f.pairings.length;
                ans = n ? f.pairings.join(" · ") : "Nessun consiglio";
                muted = !n;
                det = n ? null : <span>Consigliate un {f.labels.product.toLowerCase()} da prendere insieme.</span>;
                foot = <ProdottoTileFoot icon={n ? eye : eyeOff} text={n ? "Prima di «Aggiungi»" : "Non compare"} />;
                break;
            }
            case "ingredienti": {
                const n = f.ingredients.length;
                ans = n ? (n === 1 ? "Un ingrediente" : `${n} ingredienti`) : "Nessuno";
                muted = !n;
                det = n ? <span>{f.ingredients.join(", ")}</span> : null;
                foot = <ProdottoTileFoot icon={n ? eye : eyeOff} text={n ? "Più in basso" : "Non compare"} />;
                break;
            }
            case "note": {
                const n = f.notes.length;
                ans = n ? f.notes.map(x => x.label).filter(Boolean).join(" · ") || "Una nota" : "Nessuna nota";
                muted = !n;
                det = n ? (
                    <>
                        {f.notes.map((x, i) => (
                            <span key={i}>
                                {x.label ? `${x.label}: ` : ""}
                                {x.value}
                            </span>
                        ))}
                    </>
                ) : null;
                foot = <ProdottoTileFoot icon={n ? eye : eyeOff} text={n ? "In fondo, sotto «Da sapere»" : "Non compare"} />;
                break;
            }
            case "traduzioni": {
                const langs = f.languages;
                if (langs === null) {
                    ans = "…";
                    muted = true;
                    break;
                }
                if (langs.length === 0) {
                    ans = "Solo in italiano";
                    muted = true;
                    det = <span>Nessun'altra lingua attiva per i vostri {f.labels.catalog === "menù" ? "menù" : "cataloghi"}.</span>;
                    foot = <ProdottoTileFoot icon={eye} text="In italiano per tutti" />;
                    break;
                }
                const done = langs.filter(l => l.state === "done");
                const pending = langs.filter(l => l.state === "pending");
                const missing = missingLanguages(f);
                if (!f.description.trim()) {
                    ans = "Niente da tradurre";
                    muted = true;
                } else if (done.length === 0 && pending.length === 0) {
                    ans = "Solo in italiano";
                } else if (missing.length > 0) {
                    ans = `${missing.length === 1 ? "Manca" : "Mancano"} ${joinNames(missing.map(l => withArticle(l.name)))}`;
                } else if (pending.length > 0) {
                    ans = "In traduzione";
                } else {
                    ans = `${capitalize(joinNames(done.map(l => l.name)))} ${done.length === 1 ? "pronto" : "pronti"}`;
                }
                det = <span>{["Italiano", ...done.map(l => l.name)].join(" · ")}</span>;
                const warn = Boolean(f.description.trim()) && missing.length > 0;
                foot = (
                    <ProdottoTileFoot
                        icon={warn ? eyeOff : eye}
                        text={warn ? "In italiano per chi non lo legge" : "Nella lingua del cliente"}
                        warn={warn}
                    />
                );
                break;
            }
            case "dove": {
                if (f.usageLoading) {
                    ans = "…";
                    muted = true;
                    break;
                }
                const n = f.places.length;
                const hidden = hiddenToday(f);
                ans = n ? `Oggi in ${n === 1 ? "una sede" : `${n} sedi`}` : "Oggi in nessuna sede";
                muted = !n;
                det = (
                    <>
                        <span>
                            {f.catalogs.length
                                ? `${capitalize(f.labels.catalog)} ${f.catalogs.join(", ")}`
                                : `In nessun ${f.labels.catalog}`}
                        </span>
                        <span>{n ? f.places.join(", ") : `Nessun ${f.labels.catalog} attivo lo mostra oggi.`}</span>
                    </>
                );
                foot = (
                    <ProdottoTileFoot
                        icon={hidden ? eyeOff : <MapPin size={14} strokeWidth={1.75} aria-hidden />}
                        text={hidden ? "Nessuno lo vede" : "Nelle sedi aperte"}
                        warn={hidden}
                    />
                );
                break;
            }
            case "varianti": {
                const n = f.variants.length;
                ans = n ? f.variants.join(" · ") : "Nessuna variante";
                muted = !n;
                det = (
                    <span>{n ? "Ognuna ha il suo prezzo e la sua pagina." : "Per esempio una versione doppia o senza zucchero."}</span>
                );
                foot = (
                    <ProdottoTileFoot
                        icon={<Copy size={14} strokeWidth={1.75} aria-hidden />}
                        text={`${capitalize(f.labels.productPlural.toLowerCase())} a sé nel ${f.labels.catalog}`}
                    />
                );
                break;
            }
            case "attributi": {
                const n = f.attributes.length;
                ans = n ? f.attributes.join(" · ") : "Nessun attributo";
                muted = !n;
                det = <span>Taglia, colore e gli altri dati del {f.labels.product.toLowerCase()}.</span>;
                foot = <ProdottoTileFoot icon={<SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden />} text="Solo per voi" />;
                break;
            }
            default:
                return null;
        }
    }

    return (
        <div
            className={cx(styles.tile, wide && styles.w2, highlighted && styles.tileHl)}
            data-k={part}
            id={`prodotto-${part}`}
            // La tessera si tocca tutta col mouse; per tastiera e lettore di
            // schermo il pulsante è il titolo (come nella Scheda della sede).
            onClick={() => actions.open(part)}
        >
            <div className={styles.th}>
                <span className={styles.ico}>
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                </span>
                <button
                    type="button"
                    className={styles.thTitle}
                    aria-label={`${title}: apri`}
                    onClick={e => {
                        e.stopPropagation();
                        actions.open(part);
                    }}
                >
                    {title}
                </button>
                {actions.changed(part) && <span className={styles.chg}>Da salvare</span>}
            </div>
            <div className={cx(styles.ans, muted && styles.ansMuted)}>{ans}</div>
            {det && <div className={styles.det}>{det}</div>}
            {foot}
        </div>
    );
}
