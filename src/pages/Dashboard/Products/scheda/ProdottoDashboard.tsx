import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Pencil, Smartphone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { DASH_GROUPS, ZONE_CARD, partTitle, type ProdottoPart } from "./prodottoCopy";
import { hiddenToday, isVariant, joinNames, missingLanguages, withArticle, type ProdottoFacts } from "./prodottoModel";
import { partCaption, rich } from "./prodottoText";
import { ProdottoPhone } from "./ProdottoPhone";
import { ProdottoTile, type TileActions } from "./ProdottoTile";
import { useProdottoFollow } from "./useProdottoFollow";
import styles from "./Prodotto.module.scss";

interface ProdottoDashboardProps {
    facts: ProdottoFacts;
    tiles: TileActions;
    /** Le parti che il verticale e il tipo di prodotto mostrano. */
    visible: (part: ProdottoPart) => boolean;
    /** «Scrivila»: apre il piatto con il cursore nella descrizione. */
    onWriteDescription: () => void;
    /** Il verticale non usa né allergeni né ingredienti: lo si dice (§25.4). */
    noAllergens: { title: string; description: string } | null;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Il cruscotto del prodotto (artifact «Scheda del prodotto», 2026-10-10, sul
 * modello C+++ «Scorrono insieme» della sede): in cima il piatto e il prezzo,
 * poi «Oggi», poi le tessere nell'ordine del telefono. Il telefono scorre
 * insieme alla pagina; passando su una tessera la sua parte si accende e la
 * card fissa sopra il telefono dice cos'è.
 */
export function ProdottoDashboard({ facts: f, tiles, visible, onWriteDescription, noAllergens }: ProdottoDashboardProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const colRef = useRef<HTMLDivElement>(null);
    const sideRef = useRef<HTMLElement>(null);
    const scrRef = useRef<HTMLDivElement>(null);
    const [hl, setHl] = useState<ProdottoPart | null>(null);
    const zone = useProdottoFollow(rootRef, scrRef, hl !== null);

    // Come nell'artifact: sopra una tessera si accende la sua parte; negli
    // spazi fra le tessere resta l'ultima; sopra il telefono non cambia
    // niente; fuori dalla pagina si spegne.
    useEffect(() => {
        const onOver = (e: MouseEvent) => {
            const target = e.target as Element | null;
            if (!target || !rootRef.current) return;
            if (sideRef.current?.contains(target)) return;
            const t = target.closest<HTMLElement>("[data-k]");
            if (!t && colRef.current?.contains(target)) return;
            const k = t && rootRef.current.contains(t) ? (t.dataset.k as ProdottoPart) : null;
            setHl(prev => (prev === k ? prev : k));
        };
        document.addEventListener("mouseover", onOver);
        return () => document.removeEventListener("mouseover", onOver);
    }, []);

    const labels = f.labels;
    const [cardTitle, cardText] = hl ? [partTitle(hl, labels), partCaption(hl, f)] : ZONE_CARD[zone];
    const variant = isVariant(f);

    // ── «Oggi»: cosa vede il cliente adesso, e cosa manca, come conseguenze ──
    const today = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    const lower = (names: string[]) => joinNames(names.map(n => n.toLowerCase()));
    let sentence: ReactNode;
    if (f.usageLoading) {
        sentence = "Caricamento...";
    } else {
        const seen =
            f.places.length > 0 ? (
                <>
                    Oggi lo vedono <span className={styles.on}>in {f.places.length === 1 ? "una sede" : `${f.places.length} sedi`}</span>,{" "}
                    {joinNames(f.places)}
                    {f.catalogs.length > 0 ? `, nel ${f.labels.catalog} ${joinNames(f.catalogs)}` : ""}.
                </>
            ) : (
                <>
                    Oggi <span className={styles.off}>nessun cliente lo vede</span>.
                </>
            );
        const extra = variant
            ? ` È una variante di ${f.parentName}: caratteristiche, note e abbinamenti li prende da lì.`
            : f.choices.length > 0
              ? ` Ordinandolo, il cliente sceglie ${lower(f.choices.map(c => c.name))}.`
              : "";
        sentence = (
            <>
                {seen}
                {extra}
            </>
        );
    }

    const problems: { key: string; text: string; action: string; run: () => void }[] = [];
    if (hiddenToday(f)) {
        problems.push({
            key: "dove",
            text:
                f.catalogs.length > 0
                    ? `Oggi nessun cliente lo vede: i suoi ${f.labels.catalog === "menù" ? "menù" : "cataloghi"} non sono attivi in nessuna sede.`
                    : `Oggi nessun cliente lo vede: non è in nessun ${f.labels.catalog}.`,
            action: "Vedi dove",
            run: () => tiles.open("dove")
        });
    }
    if (!variant && !f.description.trim()) {
        problems.push({
            key: "descrizione",
            text: "Manca la descrizione: sul telefono, sotto il nome, non c'è niente.",
            action: "Scrivila",
            run: onWriteDescription
        });
    }
    const missing = missingLanguages(f);
    if (!variant && f.description.trim() && missing.length > 0) {
        problems.push({
            key: "traduzioni",
            text: `Manca ${joinNames(missing.map(l => withArticle(l.name)))}: chi non legge l'italiano lo trova in italiano.`,
            action: "Traduci",
            run: () => tiles.open("traduzioni")
        });
    }
    for (const name of f.emptyChoices) {
        problems.push({
            key: `scelta-${name}`,
            text: `La scelta «${name}» non ha opzioni: il cliente non la vede.`,
            action: "Sistemala",
            run: () => tiles.open("scelte")
        });
    }

    const coverStyle = f.imageUrl ? { backgroundImage: `url("${f.imageUrl}")` } : undefined;

    return (
        <div className={styles.root} ref={rootRef}>
            <div className={styles.dash}>
                <div className={styles.col} ref={colRef}>
                    <div className={styles.hero}>
                        <button
                            type="button"
                            className={cx(styles.identity, hl === "piatto" && styles.tileHl)}
                            data-k="piatto"
                            id="prodotto-piatto"
                            onClick={() => tiles.open("piatto")}
                        >
                            <span className={cx(styles.identityCover, styles.cover, !f.imageUrl && styles.coverNone)} style={coverStyle} />
                            <span className={styles.edit}>
                                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                                Cambia foto, nome e descrizione
                            </span>
                            <span className={styles.overlay}>
                                <h3>{f.name || "Senza nome"}</h3>
                                {f.description.trim() ? <p>{f.description}</p> : <p className={styles.noDesc}>Nessuna descrizione</p>}
                            </span>
                        </button>
                        <button
                            type="button"
                            className={cx(styles.price, hl === "prezzo" && styles.tileHl)}
                            data-k="prezzo"
                            id="prodotto-prezzo"
                            onClick={() => tiles.open("prezzo")}
                        >
                            <span className={cx(styles.lab, styles.priceLab)}>
                                Prezzo
                                {tiles.changed("prezzo") && <span className={styles.chg}>Da salvare</span>}
                            </span>
                            <span className={styles.big}>{f.optionsLoading ? "…" : f.priceLabel}</span>
                            <span className={styles.rows}>
                                {f.priceMode === "formato" && f.formats.length > 0 ? (
                                    f.formats.map((x, i) => (
                                        <span key={`${x.name}-${i}`} className={styles.rowLine}>
                                            <span>{x.name}</span>
                                            <b>{x.price}</b>
                                        </span>
                                    ))
                                ) : f.inheritsPrice ? (
                                    <span>Lo stesso di {f.parentName}.</span>
                                ) : (
                                    <span>Un prezzo solo, per tutti.</span>
                                )}
                            </span>
                            <span className={styles.go}>
                                Cambia
                                <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
                            </span>
                        </button>
                    </div>

                    <section className={styles.now} aria-label="Oggi">
                        <span className={styles.nowLab}>Oggi · {today}</span>
                        <p className={styles.say}>{sentence}</p>
                        {problems.map(p => (
                            <div key={p.key} className={styles.prob}>
                                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
                                <span>{p.text}</span>
                                <Button variant="secondary" size="sm" onClick={p.run}>
                                    {p.action}
                                </Button>
                            </div>
                        ))}
                    </section>

                    {DASH_GROUPS.map(g => {
                        const parts = g.parts.filter(visible);
                        const empty = g.key === "sotto" && noAllergens;
                        if (parts.length === 0 && !empty) return null;
                        return (
                            <section key={g.key} data-g={g.key} aria-label={g.title}>
                                <div className={styles.groupHead}>
                                    <h3>{g.title}</h3>
                                    <span className={styles.hint}>{g.hint}</span>
                                </div>
                                <div className={styles.tiles}>
                                    {parts.map((k, i) => (
                                        <ProdottoTile
                                            key={k}
                                            part={k}
                                            facts={f}
                                            actions={tiles}
                                            wide={parts.length % 2 === 1 && i === parts.length - 1 && !empty}
                                            highlighted={hl === k}
                                        />
                                    ))}
                                    {empty && (
                                        <div className={cx(styles.tile, styles.tileStill, parts.length % 2 === 0 && styles.w2)}>
                                            <EmptyState variant="inline" icon={null} title={noAllergens.title} description={noAllergens.description} />
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>

                <aside className={styles.side} ref={sideRef} aria-label="Così lo vede il cliente">
                    <div className={styles.card} aria-live="polite">
                        <span className={styles.cardK}>
                            <Smartphone size={13} strokeWidth={1.75} aria-hidden />
                            Sul telefono
                        </span>
                        <b className={styles.cardTitle}>{cardTitle}</b>
                        <p className={styles.cardText}>{rich(cardText)}</p>
                    </div>
                    <ProdottoPhone ref={scrRef} facts={f} highlight={hl} />
                    {f.styleName && (
                        <span className={styles.styleName}>
                            Stile «{f.styleName}»{f.styleMenu ? `, dal ${f.labels.catalog} ${f.styleMenu}` : ""}
                        </span>
                    )}
                </aside>
            </div>
        </div>
    );
}

