// «L'aspetto» nel tunnel dello stile: le scelte dell'editor stili (spec-app, sezione 1; deciso da
// Lorenzo, D119.3). Prima tutta la pagina (colori, materiale e forme, carattere), poi le parti
// dall'alto in basso; in cima i sei stili pronti. Le forme sono quelle dell'artifact, versione 16.
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { History, Info, Undo2 } from "lucide-react";
import { listStyleVersions } from "@/services/supabase/styles";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useTenant } from "@/context/useTenant";
import { useLogoColors } from "./creaStyle";
import { parseTokens, type BackgroundPattern, type FontFamily, type HeaderChrome, type StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { borderRadiusToPx, getPatternCss, mapStyleTokensToCssVars } from "@/features/public/utils/mapStyleTokensToCssVars";
import { FONTS, type Tunnel } from "./creaModel";
import { PART_IDS, PRESETS, applyPreset, chromeAdvice, dishKind, ink, lum, partKey, restore, retouched, sameHex, setDish, type DishKind, type PartId } from "./stileLook";
import { Choice, Group, Palette, type Opts } from "./StileUi";
import { Mini } from "./StileMini";
import { Sh } from "./CreaUi";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import type { U } from "./CreaSteps";
import { LOOK_D } from "@/styles/lookD";
import s from "./StileAspetto.module.scss";

type Look = StyleTokenModel;
type ColorKey = "primary" | "accent" | "pageBackground";

// Nella D (D212) la tessera è chiara e dentro c'è il campione con lo sfondo vero: il testo
// del campione si legge sullo sfondo, e su sfondo scuro un colore scuro si schiarisce.
const DARK = 0.3;
const lookTile = (bg: string, pri: string) => ({
    "--b": bg,
    "--tx": lum(bg) < DARK ? "#f5f3ee" : "#1d1a2e",
    "--p": lum(bg) < DARK && lum(pri) < DARK ? `color-mix(in srgb, ${pri} 55%, #fff)` : pri
});

const labOf = <V extends string>(opts: Opts<V>, v: V) => opts.find(o => o[0] === v)?.[1] ?? "";
const vars = (l: Look) => mapStyleTokensToCssVars(l);
const withL = (l: Look, f: (x: Look) => void) => {
    const x = structuredClone(l);
    f(x);
    return x;
};

/** I colori rapidi (editor-client.js, QUICK): quelli dei sei stili pronti. */
const QUICK_PRI: Opts<string> = [["#5558E0", "Viola"], ["#9A3A25", "Terracotta"], ["#7A5C22", "Bronzo"], ["#2E5E4E", "Verde bottiglia"], ["#3A6B4C", "Salvia"], ["#C9A45C", "Ottone"]];
const QUICK_BG: Opts<string> = [["#F6F6FA", "Grigio chiaro"], ["#FFFFFF", "Bianco"], ["#F7F0E3", "Crema"], ["#FAF7F0", "Avorio"], ["#FBF5E6", "Burro"], ["#17131A", "Notte"]];
const nameOf = (q: Opts<string>, c: string) => q.find(x => sameHex(x[0], c))?.[1];

const CHROME: Opts<HeaderChrome> = [["light", "Chiari"], ["dark", "Scuri"]];
const TREAT: Opts<Look["appearance"]["cardTreatment"]> = [["raised", "Pieno"], ["glass", "Vetro"], ["bordered", "Contorno"]];
const EDGE: Opts<NonNullable<Look["appearance"]["outlinedBorderColor"]>> = [["auto", "Automatico"], ["primary", "Colore principale"]];
const RADIUS: Opts<Look["appearance"]["borderRadius"]> = [["none", "Squadrati"], ["soft", "Morbidi"], ["rounded", "Arrotondati"]];
const PATTERN: Opts<BackgroundPattern> = [["none", "Nessuno"], ["glow", "Alone di colore"], ["dots", "Puntini"], ["linen", "Lino fine"], ["contour", "Curve di livello"], ["noise", "Grana"]];
const DEPTH: Opts<Look["appearance"]["patternIntensity"]> = [["subtle", "Leggero"], ["medium", "Medio"], ["strong", "Forte"]];
// Sei caratteri (spec-app sezione 1). Montserrat, Josefin Sans e Spectral restano per gli stili vecchi, non si offrono.
const FONT6: Opts<FontFamily> = [["inter", "Moderno"], ["poppins", "Rotondo"], ["raleway", "Leggero"], ["lora", "Classico"], ["eb-garamond", "Elegante"], ["patrick-hand", "Scritto a mano"]];
const TOP: readonly (readonly ["showLogo" | "showCoverImage", string, string])[] = [
    ["showLogo", "Il logo", "logo"],
    ["showCoverImage", "La foto grande in alto", "foto"]
];
const NAV: Opts<Look["navigation"]["style"]> = [["filled", "Pillola piena"], ["tinted", "Pillola morbida"], ["outline", "Solo il bordo"], ["tabs", "Sottolineata"]];
const FEAT: Opts<Look["appearance"]["featuredStyle"]> = [["card", "Foto sopra, testo sotto"], ["highlight", "Testo sopra la foto"], ["compact", "Compatto, in una riga"], ["image", "Solo l'immagine"]];
const DISH: Opts<DishKind> = [["card", "Un riquadro"], ["modern", "Una riga moderna"], ["editorial", "Una riga come sulla carta"], ["centered", "Una riga centrata"]];
const PHOTO: Opts<"left" | "right" | "none"> = [["left", "A sinistra"], ["right", "A destra"], ["none", "Non mostrarla"]];
const DENS: Opts<NonNullable<Look["card"]["contentDensity"]>> = [["minimal", "Nome e prezzo"], ["standard", "Anche la descrizione"], ["full", "Anche gli allergeni"]];
const CAT: Opts<NonNullable<Look["card"]["categoryTitle"]>> = [["dash", "Un trattino sotto"], ["icon", "Un'icona"], ["text", "Solo il testo"]];

const PART_NAME: Record<PartId, string> = { colori: "i colori", materiale: "materiale e forme", carattere: "il carattere", cima: "in cima alla pagina", categorie: "la riga delle categorie", evidenza: "in evidenza", piatti: "i piatti" };
const day = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

export function StileAspetto({ t, u, tenantId, rules, onPeek, readOnly, seen = null }: { t: Tunnel; u: U; tenantId: string; rules: number; seen?: string | null; onPeek: (look: Look | null, label?: string) => void; readOnly?: boolean }) {
    const editId = t.edit?.id ?? null;
    const { selectedTenant } = useTenant();
    const logo = useLogoColors(selectedTenant?.logo_url ? getTenantLogoPublicUrl(selectedTenant.logo_url) : null);
    // le versioni di prima si leggono la prima volta che si aprono
    const [open, setOpen] = useState(false);
    const [vers, setVers] = useState<{ id: string; when: string; look: Look }[] | "failed" | null>(null);
    const showVers = () => {
        setOpen(o => !o);
        if ((vers && vers !== "failed") || !editId) return;
        listStyleVersions(editId, tenantId)
            .then(list => setVers(list.map(v => ({ id: v.id, when: day(v.created_at), look: parseTokens(v.config) }))))
            .catch(() => setVers("failed"));
    };

    const l = t.look, was = t.edit?.orig.look ?? null;
    // «Torna a questa» chiede solo se nella bozza c'è qualcosa che non è salvato: lì si perderebbe
    const [back, setBack] = useState<{ when: string; look: Look } | null>(null);
    const dirty = !!was && PART_IDS.some(p => partKey(l, p) !== partKey(was, p));
    const takeBack = (v: { when: string; look: Look }) => (dirty ? setBack(v) : u(x => void (x.look = structuredClone(v.look))));
    const [pal, setPal] = useState<ColorKey | null>(null);
    const set = (f: (x: Look) => void) => u(x => f(x.look));
    const close = useRef(() => setPal(null)).current;

    const primary = l.colors.primary, bg = l.colors.pageBackground, accent = l.colors.accent && !sameHex(l.colors.accent, primary) ? l.colors.accent : null;
    const put = (k: ColorKey, c: string) => set(x => void (x.colors[k] = c));
    const used = [...new Map([primary, accent, bg, was?.colors.primary].filter((c): c is string => !!c).map(c => [c.toLowerCase(), c])).values()].slice(0, 6);
    const v = vars(l);
    // Stili salvati prima del campo: riquadro e barra scuri, come erano (D122).
    const chrome = l.header.chrome ?? "dark";
    const advice = chromeAdvice(bg);
    const photo = l.card.image.mode === "hide" ? "none" : l.card.image.position;
    const dish = dishKind(l);
    const isCard = dish === "card";
    const dens = l.card.contentDensity ?? "full";
    const preset = l.meta?.preset;

    // Il colore che si legge poco lo schiariamo o scuriamo nel menù (regole dei colori): qui lo diciamo.
    const fixes: { text: string; from: string; to: string }[] = [];
    const dir = (a: string, b: string) => (lum(b) < lum(a) ? "più scuro" : "più chiaro");
    if (!sameHex(v["--pub-primary"], primary)) fixes.push({ text: `Il colore principale su questo sfondo si legge poco: nel menù lo usiamo un po' ${dir(primary, v["--pub-primary"])}.`, from: primary, to: v["--pub-primary"] });
    if (accent && !sameHex(v["--pub-accent"], accent)) fixes.push({ text: `Sul colore dei pulsanti la scritta si legge poco: lo usiamo un po' ${dir(accent, v["--pub-accent"])}.`, from: accent, to: v["--pub-accent"] });

    /** Il pulsante «Un altro colore» col suo fumetto: resta acceso quando il colore non è fra quelli pronti. */
    const other = (k: ColorKey, title: string, value: string, own: boolean, right?: boolean) => (
        <span className={s.anchor}>
            <button type="button" className={s.cur} aria-expanded={pal === k} data-on={own || undefined} onClick={() => setPal(p => (p === k ? null : k))}>
                <i className={own ? undefined : s.rainbow} style={own ? ink(value) : undefined} />
                {own ? "Un tuo colore" : "Un altro colore"}
            </button>
            {pal === k && <Palette title={title} kind={k === "pageBackground" ? "bg" : "ink"} value={value} used={used} logo={logo} right={right} pick={c => (put(k, c), setPal(null))} live={c => put(k, c)} close={close} />}
        </span>
    );
    const quick = (k: "primary" | "pageBackground", q: Opts<string>, title: string) => (
        <div className={s.sws}>
            {q.map(([c, n]) => (
                <button key={c} type="button" className={s.sw} style={ink(c)} aria-label={n} title={n} aria-pressed={sameHex(l.colors[k], c)} onClick={() => put(k, c)} />
            ))}
            {other(k, title, l.colors[k], !nameOf(q, l.colors[k]))}
        </div>
    );

    // i disegnini: i colori sono quelli che la pagina userebbe con quella scelta
    const fisse = (c: HeaderChrome) => {
        const w = vars(withL(l, x => void (x.header.chrome = c)));
        return <Mini kind="fisse" v={c} style={{ background: bg, "--q": w["--pub-chrome-solid"], "--ql": `color-mix(in srgb, ${w["--pub-chrome-text"]} 35%, transparent)`, "--qp": w["--pub-chrome-active"], "--qs": `color-mix(in srgb, ${v["--pub-bg-text"]} 30%, transparent)` } as CSSProperties} />;
    };
    const mat = (k: Look["appearance"]["cardTreatment"], edge = l.appearance.outlinedBorderColor ?? "auto") => {
        const w = vars(withL(l, x => void ((x.appearance.cardTreatment = k), (x.appearance.outlinedBorderColor = edge))));
        return <Mini kind="mat" v={k} style={{ "--mmbg": bg, "--mmsf": w["--pub-surface"], "--mmbd": w["--pub-surface-border"] } as CSSProperties} />;
    };
    const motif = (k: BackgroundPattern, depth = l.appearance.patternIntensity) => {
        const [img, size] = k === "none" ? ["none", "auto"] : getPatternCss(k, v["--pub-bg-text"], depth, primary);
        return <Mini kind="mot" v={k} style={{ backgroundColor: bg, backgroundImage: img, backgroundSize: size, "--pub-glow-y": "0px" } as CSSProperties} />;
    };
    const pill = (k: string) => <Mini kind="pill" v={k} style={{ background: v["--pub-chrome-solid"], color: v["--pub-chrome-text"], "--mh-ink": v["--pub-chrome-active"], "--mh-on": v["--pub-chrome-active-text"] } as CSSProperties} />;

    const part = (id: PartId, n: number, name: string, now: string, desc: string, body: ReactNode) => (
        <section className={s.part} aria-label={name}>
            <div className={s.parth}>
                <span className={s.nb}>{n}</span>
                <b>{name}</b>
                <span className={s.now}>{now}</span>
                {was && partKey(l, id) !== partKey(was, id) && (
                    <button type="button" className={s.linkb} onClick={() => set(x => restore(x, was, id))}>
                        <Undo2 size={14} />
                        Torna com'era
                    </button>
                )}
            </div>
            <div className={s.partb}>
                <p className={s.pdesc}>{desc}</p>
                {body}
            </div>
        </section>
    );

    return (
        <div className={s.asp}>
            {t.edit && (
                <div className={s.tools}>
                    {(seen || rules > 0) && (
                        <span className={s.inuse}>
                            <i aria-hidden />
                            {seen ?? `Usato in ${rules === 1 ? "una regola" : `${rules} regole`} del Calendario: quello che salvi arriva lì.`}
                        </span>
                    )}
                    <button type="button" className={s.linkb} aria-expanded={open} onClick={showVers}>
                        <History size={14} />
                        Versioni di prima
                    </button>
                </div>
            )}
            {t.edit && open && (
                <div className={s.vers} role="region" aria-label="Versioni di prima">
                    <div>
                        <b>Adesso</b>
                        <span>quello che stai cambiando</span>
                    </div>
                    {vers === null && <div><span>Le leggo…</span></div>}
                    {vers === "failed" && <div><span>Non siamo riusciti a leggere le versioni. Chiudi e riapri per riprovare.</span></div>}
                    {Array.isArray(vers) &&
                        vers.map((ver, i) => {
                            const diff = PART_IDS.filter(p => partKey(ver.look, p) !== partKey(l, p));
                            return (
                                <div key={ver.id}>
                                    <b>{ver.when}</b>
                                    <span>{[i === 0 ? "com'è salvato adesso" : i === vers.length - 1 ? "la prima" : "", diff.length ? `diversi: ${diff.map(p => PART_NAME[p]).join(", ")}` : "uguale a quello che vedi"].filter(Boolean).join(" · ")}</span>
                                    {diff.length > 0 && (
                                        <>
                                            <button type="button" className={s.linkb} onClick={() => onPeek(ver.look, `Versione del ${ver.when}`)}>
                                                Guarda
                                            </button>
                                            <button type="button" className={s.linkb} onClick={() => takeBack(ver)}>
                                                Torna a questa
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
            <Sh title="L'aspetto">{readOnly ? "Com'è fatto questo stile: prima tutta la pagina, poi le parti dall'alto in basso come sul telefono." : "Prima tutta la pagina, poi le parti dall'alto in basso come sul telefono. Cambia quello che vuoi: il resto resta com'è."}</Sh>
            {!readOnly && (
                <div className={s.start}>
                    <b>Parti da uno stile pronto</b>
                    <span className={s.hint}>Colori, carattere e forme già in armonia. È solo una partenza: poi ritocchi quello che vuoi qui sotto.</span>
                    <div className={s.looks}>
                        {PRESETS.map(k => {
                            const on = preset === k.id;
                            return (
                                <button
                                    key={k.id}
                                    type="button"
                                    className={s.look}
                                    // nella D la tessera ha lo sfondo della pagina e si accende quella in uso (copia `.tu-abt`)
                                    style={(LOOK_D ? lookTile(k.bg, k.primary) : { "--b": k.bg, "--p": k.primary, "--tx": lum(k.bg) < 0.35 ? "var(--d-surface)" : "var(--d-text)" }) as CSSProperties}
                                    aria-pressed={on}
                                    onClick={() => set(x => applyPreset(x, k.id))}
                                >
                                    <span className={s.lookSw} style={{ fontFamily: FONTS[k.font].css }} aria-hidden>
                                        Aa
                                        <i>
                                            <b style={{ background: k.primary }} />
                                            <b style={{ background: k.accent }} />
                                        </i>
                                    </span>
                                    <b className={s.lookName}>
                                        {k.name}
                                        {on && retouched(l) && <small>ritoccato</small>}
                                    </b>
                                    <i className={s.lookTick} aria-hidden>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                                        </svg>
                                    </i>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <h3 className={s.grp}>Tutta la pagina</h3>
            {part(
                "colori",
                1,
                "Colori",
                [nameOf(QUICK_PRI, primary) ?? "un tuo colore", "sfondo " + (nameOf(QUICK_BG, bg)?.toLowerCase() ?? "tuo"), chrome === "light" ? "parti fisse chiare" : "parti fisse scure"].join(", "),
                "Valgono in tutta la pagina, anche per il riquadro in cima e la barra in basso.",
                <>
                    <Group label="Colore principale" hint="Trattini, etichette e numeri: i segni piccoli che danno il tono.">
                        {quick("primary", QUICK_PRI, "Colore principale")}
                    </Group>
                    <Group label="Colore dei pulsanti" hint="Aggiungi nella scheda del piatto, il numero sul pulsante dell'ordine e i pulsanti di In evidenza.">
                        <div className={s.sws}>
                            <button type="button" className={s.chip} aria-pressed={!accent} onClick={() => set(x => void delete x.colors.accent)}>
                                <i className={s.dot} style={{ background: primary }} aria-hidden />
                                Come il principale
                            </button>
                            {other("accent", "Colore dei pulsanti", accent ?? primary, !!accent, true)}
                        </div>
                    </Group>
                    <Group label="Sfondo della pagina" hint="Le scritte diventano chiare o scure da sole.">
                        {quick("pageBackground", QUICK_BG, "Sfondo della pagina")}
                    </Group>
                    {fixes.length > 0 && (
                        <div className={s.fix} role="status">
                            <Info size={16} aria-hidden />
                            <div>
                                {fixes.map(f => (
                                    <p key={f.text}>
                                        {f.text}
                                        <span className={s.pair} aria-hidden>
                                            <b style={{ background: f.from }} />
                                            <b style={{ background: f.to }} />
                                        </span>
                                    </p>
                                ))}
                                <p className={s.hint}>Così si legge sempre. Il tuo colore resta salvato com'è.</p>
                            </div>
                        </div>
                    )}
                    <Choice
                        label="Il riquadro in cima e la barra in basso"
                        opts={CHROME}
                        value={chrome}
                        on={c => set(x => void (x.header.chrome = c))}
                        tiles={2}
                        draw={fisse}
                        wide
                        hint={
                            <>
                                Valgono anche per la scheda che si apre toccando un piatto. Non prendono mai il colore del locale.
                                <span className={s.cons} data-on={chrome !== advice || undefined}>
                                    {chrome === advice ? `Su questo sfondo vanno bene ${labOf(CHROME, advice).toLowerCase()}.` : `Su questo sfondo ti consigliamo: ${labOf(CHROME, advice)}.`}
                                </span>
                            </>
                        }
                    />
                </>
            )}

            {part(
                "materiale",
                2,
                "Materiale e forme",
                [labOf(TREAT, l.appearance.cardTreatment), "angoli " + labOf(RADIUS, l.appearance.borderRadius).toLowerCase(), l.appearance.backgroundPattern === "none" ? "" : (labOf(PATTERN, l.appearance.backgroundPattern) || "un disegno").toLowerCase()].filter(Boolean).join(", "),
                "Come sono fatti riquadri, angoli e sfondo, in tutta la pagina.",
                <>
                    <Choice
                        label="Il materiale"
                        opts={TREAT}
                        value={l.appearance.cardTreatment}
                        on={k => set(x => void (x.appearance.cardTreatment = k))}
                        tiles={3}
                        draw={k => mat(k)}
                        wide
                        hint="Vale per il riquadro in cima, la barra in basso, i piatti e In evidenza. Il colore dei riquadri viene dalla pagina: bianchi sulle pagine chiare, un po' più chiari della pagina su quelle scure."
                    />
                    {l.appearance.cardTreatment === "bordered" && (
                        <Choice label="Il colore del contorno" opts={EDGE} value={l.appearance.outlinedBorderColor ?? "auto"} on={k => set(x => void (x.appearance.outlinedBorderColor = k))} tiles={2} draw={k => mat("bordered", k)} wide cond hint="Automatico: grigio sulle pagine chiare, bianco su quelle scure." />
                    )}
                    <Choice label="Gli angoli" opts={RADIUS} value={l.appearance.borderRadius} on={k => set(x => void (x.appearance.borderRadius = k))} tiles={3} draw={k => <Mini kind="ang" v={k} style={{ borderRadius: borderRadiusToPx(k) }} />} wide />
                    <Choice label="Un disegno leggero sullo sfondo" opts={PATTERN} value={l.appearance.backgroundPattern} on={k => set(x => void (x.appearance.backgroundPattern = k))} tiles={3} draw={k => motif(k)} wide />
                    <Choice
                        label="Quanto si vede il disegno"
                        opts={DEPTH}
                        value={l.appearance.patternIntensity}
                        on={k => set(x => void (x.appearance.patternIntensity = k))}
                        tiles={3}
                        draw={k => motif(l.appearance.backgroundPattern === "none" ? "dots" : l.appearance.backgroundPattern, k)}
                        wide
                        off={l.appearance.backgroundPattern === "none" ? "Scegli prima un disegno." : undefined}
                    />
                </>
            )}

            {part(
                "carattere",
                3,
                "Il carattere",
                labOf(FONT6, l.typography.fontFamily) || FONTS[l.typography.fontFamily].name,
                "Uno solo, per tutte le scritte del menù.",
                <Group label="Ogni nome è scritto col suo carattere" wide>
                    <div className={s.chips}>
                        {FONT6.map(([f, name]) => (
                            <button key={f} type="button" className={`${s.chip} ${s.font}`} aria-pressed={l.typography.fontFamily === f} onClick={() => set(x => void (x.typography.fontFamily = f))}>
                                <b style={{ fontFamily: FONTS[f].css }}>{name}</b>
                                <small>{FONTS[f].name}</small>
                            </button>
                        ))}
                    </div>
                </Group>
            )}

            <h3 className={s.grp}>Le parti della pagina</h3>
            {part(
                "cima",
                4,
                "In cima alla pagina",
                TOP.filter(([k]) => l.header[k]).map(x => x[2]).join(", ") || "solo il nome del locale",
                "La prima cosa che il cliente vede aprendo il menù. Il nome del locale c'è sempre. Da qui in giù scegli solo cosa si vede e come è disposto: i colori sono sopra.",
                <Group label="Oltre al nome del locale, mostra" hint="Senza la foto, il riquadro resta in cima con lo stesso spazio intorno." wide>
                    <div className={`${s.chips} ${s.tops}`}>
                        {TOP.map(([k, text]) => (
                            <button key={k} type="button" className={s.tgl} role="switch" aria-checked={l.header[k]} onClick={() => set(x => void (x.header[k] = !x.header[k]))}>
                                <span className={s.trk} />
                                {text}
                            </button>
                        ))}
                    </div>
                </Group>
            )}

            {part(
                "categorie",
                5,
                "La riga delle categorie",
                labOf(NAV, l.navigation.style) || "Solo in grassetto",
                "Antipasti, Primi, Dolci: il cliente la tocca per saltare da una categoria all'altra.",
                <Choice label="Come si vede la categoria in cui sei" opts={NAV} value={l.navigation.style} on={k => set(x => void (x.navigation.style = k))} draw={pill} wide hint="Prende il colore principale, in «Colori»." />
            )}

            {part(
                "evidenza",
                6,
                "In evidenza",
                labOf(FEAT, l.appearance.featuredStyle),
                "Promo, eventi e annunci che metti sopra o sotto il menù. Qui scegli solo la forma: testi, foto e pulsante sono del contenuto.",
                <Choice
                    label="Foto e testo"
                    opts={FEAT}
                    value={l.appearance.featuredStyle}
                    on={k => set(x => void (x.appearance.featuredStyle = k))}
                    tiles={4}
                    draw={k => <Mini kind="feat" v={k} />}
                    wide
                    hint="Solo l'immagine: la grafica intera, senza testo sotto. Va bene se le tue immagini hanno già la scritta dentro; il testo si legge toccandola. Un contenuto senza foto diventa, in ogni forma, un riquadro di testo."
                />
            )}

            {part(
                "piatti",
                7,
                "I piatti",
                labOf(DISH, dish) + ", " + labOf(DENS, dens).toLowerCase(),
                "Come si presenta ogni piatto del menù.",
                <>
                    <Choice label="Ogni piatto è" opts={DISH} value={dish} on={k => set(x => setDish(x, k))} tiles={4} draw={k => <Mini kind="piatto" v={k} />} wide />
                    <Choice
                        label="La foto del piatto"
                        opts={PHOTO}
                        value={photo}
                        on={k =>
                            set(x => {
                                x.card.image.mode = k === "none" ? "hide" : "show";
                                if (k !== "none") x.card.image.position = k;
                            })
                        }
                        off={isCard ? undefined : "Nelle righe la foto non c'è: scegli un riquadro per mostrarla."}
                    />
                    <Choice label="Di ogni piatto si legge" opts={DENS} value={dens} on={k => set(x => void (x.card.contentDensity = k))} />
                    <Choice
                        label="Il titolo di ogni categoria ha"
                        opts={CAT}
                        value={l.card.categoryTitle ?? "dash"}
                        on={k => set(x => void (x.card.categoryTitle = k))}
                        off={isCard ? undefined : "Nelle righe il titolo ha già la sua forma: scegli un riquadro per cambiarlo."}
                    />
                </>
            )}
            <ConfirmDialog
                isOpen={!!back}
                onClose={() => setBack(null)}
                onConfirm={() => {
                    if (back) u(x => void (x.look = structuredClone(back.look)));
                    return true;
                }}
                title={`Torni alla versione del ${back?.when ?? ""}?`}
                message="Le modifiche che non hai ancora salvato si perdono. Diventa una versione nuova solo quando salvi."
                confirmLabel="Torna a questa"
                cancelLabel="Resta così"
                confirmVariant="primary"
            />
        </div>
    );
}
