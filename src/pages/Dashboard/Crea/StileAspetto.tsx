// «L'aspetto» nel tunnel dello stile (D186): le sei parti della pagina del cliente,
// dall'alto in basso, con tutte le scelte dell'editor. Le forme sono quelle
// dell'artifact «Lo stile nel tunnel», quarta versione.
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { History, TriangleAlert, Undo2 } from "lucide-react";
import { listStyleVersions } from "@/services/supabase/styles";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useTenant } from "@/context/useTenant";
import { useLogoColors } from "./creaStyle";
import { parseTokens, type FontFamily, type StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { COLORS, FONTS, type Tunnel } from "./creaModel";
import { DARK_BG, LIGHT_BG, PART_IDS, hardToRead, ink, lum, partKey, readable, restore, sameHex, type PartId } from "./stileLook";
import { Choice, Group, Palette, type Opts } from "./StileUi";
import { Sh } from "./CreaUi";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import type { U } from "./CreaSteps";
import { LOOK_D } from "@/styles/lookD";
import s from "./StileAspetto.module.scss";

type Look = StyleTokenModel;
type ColorKey = "primary" | "accent" | "pageBackground";

const labOf = <V extends string>(opts: Opts<V>, v: V) => opts.find(o => o[0] === v)?.[1] ?? "";
const colorName = (c: string) => COLORS.find(x => sameHex(x[0], c))?.[1] ?? "un tuo colore";

const NAV: Opts<Look["navigation"]["style"]> = [["filled", "Pillola piena"], ["tinted", "Pillola leggera"], ["outline", "Solo il bordo"], ["tabs", "Sottolineata"], ["minimal", "Solo in grassetto"]];
const FEAT: Opts<Look["appearance"]["featuredStyle"]> = [["card", "Foto sopra, testo sotto"], ["highlight", "Testo sopra la foto"], ["compact", "Compatto, in una riga"]];
const PROD: Opts<Look["card"]["productStyle"]> = [["card", "Un riquadro"], ["compact", "Una riga di un elenco"]];
const LEAD: Opts<NonNullable<Look["card"]["compactLayoutStyle"]>> = [["modern", "Niente"], ["editorial", "I puntini, come sulla carta"]];
const TREAT: Opts<Look["appearance"]["cardTreatment"]> = [["raised", "Un'ombra"], ["bordered", "Un bordo"], ["glass", "Niente: è trasparente"]];
const EDGE: Opts<NonNullable<Look["appearance"]["outlinedBorderColor"]>> = [["auto", "Grigio"], ["primary", "Del colore principale"]];
const PHOTO: Opts<"left" | "right" | "none"> = [["left", "A sinistra"], ["right", "A destra"], ["none", "Non mostrarla"]];
const DENS: Opts<NonNullable<Look["card"]["contentDensity"]>> = [["minimal", "Nome e prezzo"], ["standard", "Anche la descrizione"], ["full", "Anche gli allergeni"]];
const ICON: Opts<NonNullable<Look["appearance"]["iconStyle"]>> = [["plain", "Da soli"], ["pill", "Dentro un tondo colorato"]];
const RADIUS: Opts<Look["appearance"]["borderRadius"]> = [["none", "Dritti"], ["soft", "Appena smussati"], ["rounded", "Tondi"]];
const PATTERN: Opts<Look["appearance"]["backgroundPattern"]> = [["none", "Nessuno"], ["dots", "Puntini"], ["diagonal", "Righe"], ["waves", "Onde"], ["crosshatch", "Quadretti"], ["noise", "Grana"]];
const DEPTH: Opts<Look["appearance"]["patternIntensity"]> = [["subtle", "Appena"], ["medium", "Un po'"], ["strong", "Bene"]];
const TOP: readonly (readonly [keyof Pick<Look["header"], "showLogo" | "showCoverImage" | "showCatalogName" | "showAddress">, string, string])[] = [
    ["showLogo", "Il logo", "logo"],
    ["showCoverImage", "La foto grande in alto", "foto"],
    ["showCatalogName", "Il nome del menù", "nome del menù"],
    ["showAddress", "L'indirizzo", "indirizzo"]
];

/** Gli abbinamenti pronti: colore, sfondo, carattere e forma già in armonia. */
const LOOKS: readonly { name: string; primary: string; bg: string; font: FontFamily; put: (l: Look) => void }[] = [
    { name: "Trattoria", primary: "#be123c", bg: LIGHT_BG, font: "lora", put: l => void ((l.card.productStyle = "card"), (l.appearance.cardTreatment = "raised"), (l.appearance.borderRadius = "rounded"), (l.navigation.style = "tinted"), (l.appearance.backgroundPattern = "none")) },
    { name: "Bistrot di sera", primary: "#d9a441", bg: DARK_BG, font: "josefin-sans", put: l => void ((l.card.productStyle = "compact"), (l.card.compactLayoutStyle = "editorial"), (l.appearance.borderRadius = "none"), (l.navigation.style = "tabs"), (l.appearance.backgroundPattern = "none")) },
    { name: "Fresco", primary: "#5f7a61", bg: "#f4f6ee", font: "poppins", put: l => void ((l.card.productStyle = "card"), (l.appearance.cardTreatment = "bordered"), (l.appearance.outlinedBorderColor = "auto"), (l.appearance.borderRadius = "soft"), (l.navigation.style = "outline"), (l.appearance.backgroundPattern = "none")) },
    { name: "Elegante", primary: "#0f172a", bg: LIGHT_BG, font: "eb-garamond", put: l => void ((l.card.productStyle = "compact"), (l.card.compactLayoutStyle = "editorial"), (l.appearance.borderRadius = "none"), (l.navigation.style = "minimal"), (l.appearance.backgroundPattern = "none")) },
    { name: "Allegro", primary: "#7c3aed", bg: LIGHT_BG, font: "patrick-hand", put: l => void ((l.card.productStyle = "card"), (l.appearance.cardTreatment = "raised"), (l.appearance.borderRadius = "rounded"), (l.navigation.style = "filled"), (l.appearance.backgroundPattern = "dots"), (l.appearance.patternIntensity = "subtle")) }
];

const PART_NAME: Record<PartId, string> = { cima: "in cima alla pagina", categorie: "la riga delle categorie", evidenza: "in evidenza", piatti: "i piatti", colori: "colori e forme", carattere: "il carattere" };
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
        if (vers || !editId) return;
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
    const photo = l.card.image.mode === "hide" ? "none" : l.card.image.position;
    const isCard = l.card.productStyle !== "compact";
    const dens = l.card.contentDensity ?? "full";
    const bgName = sameHex(bg, LIGHT_BG) ? "bianco" : sameHex(bg, DARK_BG) || lum(bg) < 0.35 ? "scuro" : "chiaro";

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
                        vers.map((v, i) => {
                            const diff = PART_IDS.filter(p => partKey(v.look, p) !== partKey(l, p));
                            return (
                                <div key={v.id}>
                                    <b>{v.when}</b>
                                    <span>{[i === 0 ? "com'è salvato adesso" : i === vers.length - 1 ? "la prima" : "", diff.length ? `diversi: ${diff.map(p => PART_NAME[p]).join(", ")}` : "uguale a quello che vedi"].filter(Boolean).join(" · ")}</span>
                                    {diff.length > 0 && (
                                        <>
                                            <button type="button" className={s.linkb} onClick={() => onPeek(v.look, `Versione del ${v.when}`)}>
                                                Guarda
                                            </button>
                                            <button type="button" className={s.linkb} onClick={() => takeBack(v)}>
                                                Torna a questa
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
            <Sh title="L'aspetto">{readOnly ? "Com'è fatto questo stile: sei parti, dall'alto in basso come sul telefono." : t.edit ? "Sei parti, dall'alto in basso come sul telefono. Cambia quello che vuoi: il resto resta com'è." : "Sei parti, dall'alto in basso come sul telefono. Va già bene così com'è: cambia solo quello che vuoi."}</Sh>
            {!t.edit && !readOnly && (
                <div className={s.start}>
                    <b>Vuoi partire da un abbinamento pronto?</b>
                    <span className={s.hint}>Colore, sfondo, carattere e forma già in armonia. Poi ritocchi quello che vuoi qui sotto.</span>
                    <div className={s.looks}>
                        {LOOKS.map(k => (
                            <button
                                key={k.name}
                                type="button"
                                className={s.look}
                                // nella D la tessera ha lo sfondo della pagina e si accende quella in uso (copia `.tu-abt`)
                                style={{ "--b": k.bg, "--p": k.primary, "--tx": lum(k.bg) < 0.35 ? "var(--d-surface)" : "var(--d-text)" } as CSSProperties}
                                aria-pressed={LOOK_D ? sameHex(primary, k.primary) && sameHex(bg, k.bg) && l.typography.fontFamily === k.font : undefined}
                                onClick={() =>
                                    set(x => {
                                        x.colors.primary = k.primary;
                                        x.colors.pageBackground = k.bg;
                                        delete x.colors.accent;
                                        x.typography.fontFamily = k.font;
                                        k.put(x);
                                    })
                                }
                            >
                                <i style={{ ...ink(k.bg), color: k.primary, fontFamily: FONTS[k.font].css }} aria-hidden>
                                    Aa
                                </i>
                                {k.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {part(
                "cima",
                1,
                "In cima alla pagina",
                TOP.filter(([k]) => l.header[k]).map(x => x[2]).join(", ") || "solo il nome del locale",
                "La prima cosa che il cliente vede aprendo il menù. Il nome del locale c'è sempre.",
                <Group label="Oltre al nome del locale, mostra" wide>
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
                2,
                "La riga delle categorie",
                labOf(NAV, l.navigation.style),
                "Antipasti, Primi, Dolci: il cliente la tocca per saltare da una categoria all'altra.",
                <Choice label="Come si vede la categoria in cui sei" opts={NAV} value={l.navigation.style} on={v => set(x => void (x.navigation.style = v))} wide mini />
            )}

            {part(
                "evidenza",
                3,
                "In evidenza",
                labOf(FEAT, l.appearance.featuredStyle),
                "Promo, eventi e annunci che metti sopra o sotto il menù. Qui scegli solo la forma: testi, foto e pulsante sono del contenuto.",
                <Choice label="Foto e testo" opts={FEAT} value={l.appearance.featuredStyle} on={v => set(x => void (x.appearance.featuredStyle = v))} wide />
            )}

            {part(
                "piatti",
                4,
                "I piatti",
                labOf(PROD, l.card.productStyle) + ", " + labOf(DENS, dens).toLowerCase(),
                "Come si presenta ogni piatto del menù.",
                <>
                    <Choice label="Ogni piatto è" opts={PROD} value={l.card.productStyle} on={v => set(x => void (x.card.productStyle = v))} />
                    {!isCard && <Choice label="Elenco: fra nome e prezzo" opts={LEAD} value={l.card.compactLayoutStyle ?? "modern"} on={v => set(x => void (x.card.compactLayoutStyle = v))} cond />}
                    {isCard && <Choice label="Il riquadro si stacca dallo sfondo con" opts={TREAT} value={l.appearance.cardTreatment} on={v => set(x => void (x.appearance.cardTreatment = v))} />}
                    {isCard && l.appearance.cardTreatment === "bordered" && <Choice label="Il bordo è" opts={EDGE} value={l.appearance.outlinedBorderColor ?? "auto"} on={v => set(x => void (x.appearance.outlinedBorderColor = v))} cond />}
                    {isCard && (
                        <Choice
                            label="La foto del piatto"
                            opts={PHOTO}
                            value={photo}
                            on={v =>
                                set(x => {
                                    x.card.image.mode = v === "none" ? "hide" : "show";
                                    if (v !== "none") x.card.image.position = v;
                                })
                            }
                        />
                    )}
                    <Choice label="Di ogni piatto si legge" opts={DENS} value={dens} on={v => set(x => void (x.card.contentDensity = v))} />
                    {dens === "full" && <Choice label="I simboli degli allergeni" opts={ICON} value={l.appearance.iconStyle ?? "plain"} on={v => set(x => void (x.appearance.iconStyle = v))} cond />}
                </>
            )}

            {part(
                "colori",
                5,
                "Colori e forme",
                colorName(primary) + ", sfondo " + bgName,
                "Valgono per tutta la pagina.",
                <>
                    <Group label="Colore principale" hint="Prezzi, pulsanti e la categoria in cui sei.">
                        <div className={s.sws}>
                            {COLORS.map(([c, n]) => (
                                <button key={c} type="button" className={s.sw} style={ink(c)} aria-label={n} aria-pressed={sameHex(primary, c)} onClick={() => put("primary", c)} />
                            ))}
                            {other("primary", "Colore principale", primary, !COLORS.some(c => sameHex(c[0], primary)))}
                        </div>
                    </Group>
                    <Group label="Secondo colore" hint="Titoli delle categorie e contenuti in evidenza. Se non lo scegli, usiamo il principale.">
                        <div className={s.sws}>
                            <button type="button" className={s.chip} aria-pressed={!accent} onClick={() => set(x => void delete x.colors.accent)}>
                                Come il principale
                            </button>
                            {other("accent", "Secondo colore", accent ?? primary, !!accent, true)}
                        </div>
                    </Group>
                    <Group label="Sfondo della pagina" hint="Le scritte diventano chiare o scure da sole.">
                        <div className={s.sws}>
                            <button type="button" className={s.chip} aria-pressed={sameHex(bg, LIGHT_BG)} onClick={() => put("pageBackground", LIGHT_BG)}>
                                Bianco
                            </button>
                            <button type="button" className={s.chip} aria-pressed={sameHex(bg, DARK_BG)} onClick={() => put("pageBackground", DARK_BG)}>
                                Scuro
                            </button>
                            {other("pageBackground", "Sfondo della pagina", bg, !sameHex(bg, LIGHT_BG) && !sameHex(bg, DARK_BG))}
                        </div>
                    </Group>
                    <Choice label="Gli angoli di riquadri e foto" opts={RADIUS} value={l.appearance.borderRadius} on={v => set(x => void (x.appearance.borderRadius = v))} />
                    <Choice label="Un disegno leggero sullo sfondo" opts={PATTERN} value={l.appearance.backgroundPattern} on={v => set(x => void (x.appearance.backgroundPattern = v))} wide />
                    {l.appearance.backgroundPattern !== "none" && <Choice label="Il disegno si vede" opts={DEPTH} value={l.appearance.patternIntensity} on={v => set(x => void (x.appearance.patternIntensity = v))} cond />}
                    {hardToRead(l) && (
                        <div className={s.warn} role="status">
                            <TriangleAlert size={15} />
                            <span>Il colore principale si legge poco su questo sfondo: i prezzi rischiano di sparire.</span>
                            <button type="button" className={s.linkb} onClick={() => put("primary", readable(primary, bg))}>
                                Rendilo leggibile
                            </button>
                        </div>
                    )}
                </>
            )}

            {part(
                "carattere",
                6,
                "Il carattere",
                FONTS[l.typography.fontFamily].name,
                "Uno solo, per tutte le scritte del menù.",
                <Group label="Ogni nome è scritto col suo carattere" wide>
                    <div className={s.chips}>
                        {(Object.keys(FONTS) as FontFamily[]).map(f => (
                            <button key={f} type="button" className={[s.chip, s.font].join(" ")} style={{ fontFamily: FONTS[f].css }} aria-pressed={l.typography.fontFamily === f} onClick={() => set(x => void (x.typography.fontFamily = f))}>
                                {FONTS[f].name}
                            </button>
                        ))}
                    </div>
                </Group>
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
