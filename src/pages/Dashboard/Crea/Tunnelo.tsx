// Il tunnel di creazione: i passi, il telefono o la settimana a destra, il
// salvataggio e «E adesso?».
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CornerDownRight, Smartphone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog/UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { useToast } from "@/context/Toast/ToastContext";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { usePhoneFit } from "@/hooks/usePhoneFit";
import { listBaseProductsForPicker } from "@/services/supabase/products";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { analyzeMenuFiles } from "@/pages/Dashboard/Catalogs/AiMenuImport/analyzeMenu";
import { partitionBySizeBudget } from "@/pages/Dashboard/Catalogs/AiMenuImport/sizeBudget";
import type { StoryProductOptions } from "@/pages/Dashboard/Stories/components/StoryProductPicker";
import { SettimanaAnteprima } from "@/pages/Dashboard/Programming/calendar/SettimanaAnteprima";
import type { Draft, Impatto } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { axisFor, entriesFromRules, romeToday, type CalNames, type CalWhen } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { NO_IMPATTO, dropAside, scontriWait, waitsForDb, whenKey } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { KIND, MAX_IMPORT_FILES, sectionsFromAi, qcardText, withAside, blocker, effWhen, firstBlock, isDirty, newTunnel, steps, STEP_LABEL, thingName, tunnelTitle, type CreaKind, type FromMenu, type StepId, type Tunnel } from "./creaModel";
import { CAL_KIND, draftFor, saveTunnel, type Saved } from "./creaSave";
import { aspectOf, sampleOf, styleTokens, tokensOf, useFonts } from "./creaStyle";
import { type CreaData } from "./useCreaData";
import { CreaPhone } from "./CreaPhone";
import { Adesso, Controlla, DoveQuando, EvidContenuto, EvidCosa, EvidPiatti, IMPORT_ACCEPT, MenuParti, MenuSezioni, MenuTipo, Quando, Serve, StileAspetto, StileNome, StoriaBlocchi, StoriaRacconto, type U } from "./CreaSteps";
import s from "./Crea.module.scss";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const q = (x: string) => "«" + x + "»";
const PAGE_OF: Record<CreaKind, string> = { menu: "catalogs", stile: "styles", evid: "featured", storia: "stories" };
const IL: Record<CreaKind, string> = { menu: "il menù", stile: "lo stile", evid: "il contenuto", storia: "la storia" };

/** La cosa che si sta creando, nel Calendario: non ha ancora un id. */
const FAKE = "crea:nuovo";

function useObjectUrl(f: File | null) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!f) return setUrl(null);
        const u = URL.createObjectURL(f);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [f]);
    return url;
}

export type TunnelProps = {
    kind: CreaKind;
    aside: Pick<Draft, "when" | "where"> | null;
    data: CreaData;
    tenantId: string;
    owner: boolean;
    origin: { label: string; to: string };
    business: string;
    reload: () => Promise<void>;
    navigate: ReturnType<typeof useNavigate>;
    showToast: ReturnType<typeof useToast>["showToast"];
    b: string;
};

/** Il menù appena messo in onda, con «E adesso?» e quello che ci si è aggiunto. */
type After = { t: Tunnel; saved: Saved; kids: CreaKind[] };

export function Tunnelo({ kind, aside, data, tenantId, owner, origin, business, reload, navigate, showToast, b }: TunnelProps) {
    const L = data.L;
    const { ensureActive } = useEnsureActive();
    const allWhere = { all: true, activityIds: [], groupIds: [] };
    const [t, setT] = useState<Tunnel>(() => (aside ? withAside(newTunnel(kind, allWhere), aside) : newTunnel(kind, allWhere)));
    const [after, setAfter] = useState<After | null>(null);
    /** «E adesso?» aperto (dopo il menù), o un tunnel aperto da lì. */
    const showAfter = !!after && t === after.t;
    const [saving, setSaving] = useState(false);
    const [leave, setLeave] = useState(false);
    const [going, setGoing] = useState<string | null>(null);
    const [effect, setEffect] = useState<Impatto>(NO_IMPATTO);
    const [blockFiles, setBlockFiles] = useState<Record<string, File>>({});
    const [productOptions, setProductOptions] = useState<StoryProductOptions>({ items: null, failed: false });
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const importRun = useRef<AbortController | null>(null);
    const refreshAiUsage = useBusinessOutletContext()?.refreshAiUsage;

    const c = useMemo(() => ({ owner, multi: L.multi }), [owner, L.multi]);
    const u: U = useCallback(fn => setT(prev => {
        const n = structuredClone(prev);
        fn(n);
        return n;
    }), []);

    // La foto o il PDF del menù (D165, D172): l'AI legge, sezioni e piatti
    // riempiono il passo dopo; il database si tocca solo al Salva.
    useEffect(() => () => importRun.current?.abort(), []);
    const onImport = useCallback(
        async (picked: File[]) => {
            if (importRun.current) return;
            const types = IMPORT_ACCEPT.split(",");
            const usable = picked.filter(f => types.includes(f.type));
            const { accepted } = partitionBySizeBudget([], usable.slice(0, MAX_IMPORT_FILES));
            if (!accepted.length) {
                setImportError(usable.length ? "I file sono troppo pesanti: foto fino a 25 MB, PDF fino a 20 MB, 30 MB in tutto." : "Servono foto (JPG, PNG o WEBP) o PDF.");
                return;
            }
            setImportError(null);
            setImporting(true);
            const run = new AbortController();
            importRun.current = run;
            const res = await analyzeMenuFiles(tenantId, accepted, run.signal, refreshAiUsage);
            if (!res) return;
            importRun.current = null;
            setImporting(false);
            if (!res.ok) {
                setImportError(res.error);
                return;
            }
            const sections = sectionsFromAi(res.categories, data.pickList);
            const dishes = sections.reduce((n, x) => n + x.dishes.length, 0);
            u(x => {
                x.source = "foto";
                x.sections = sections;
                x.imported = { sections: sections.length, dishes };
            });
            if (accepted.length < picked.length) {
                showToast({ message: `Letti ${accepted.length} file su ${picked.length}: gli altri erano troppi, troppo pesanti o non erano foto o PDF.`, type: "info" });
            }
        },
        [tenantId, refreshAiUsage, data.pickList, u, showToast]
    );

    // si naviga un giro dopo il render senza la guardia: l'host nel layout aggiorna il
    // suo blocker negli effetti del genitore, che girano dopo questi (come RuleDetailPage)
    useUnsavedChangesGuard(!going && !showAfter && isDirty(t));
    useEffect(() => {
        if (!going) return;
        const timer = window.setTimeout(() => {
            navigate(going);
            // la pagina d'arrivo si carica a parte e il tunnel resta su un attimo: se intanto
            // si torna indietro, si deve poter uscire di nuovo
            setGoing(null);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [going, navigate]);

    // i prodotti per i blocchi Prodotto della storia (come la pagina della storia)
    useEffect(() => {
        if (t.kind !== "storia") return;
        let off = false;
        listBaseProductsForPicker(tenantId)
            .then(items => !off && setProductOptions({ items, failed: false }))
            .catch(() => !off && setProductOptions({ items: null, failed: true }));
        return () => {
            off = true;
        };
    }, [t.kind, tenantId]);

    const st = steps(t, c);
    const i = Math.min(t.i, st.length - 1);
    const step: StepId = st[i];
    const last = i === st.length - 1;
    const fb = firstBlock(t, c);
    const stepWhy = showAfter ? "" : last ? fb?.why ?? "" : blocker(t, step, c);

    /* ---------- lo stile del telefono ---------- */
    const styleById = useMemo(() => new Map(data.styles.map(x => [x.id, x])), [data.styles]);
    const liveStyle = styleById.get(data.base?.styleId ?? data.systemStyleId ?? "") ?? data.styles[0] ?? null;
    const baseStyle = t.kind === "stile" && t.base === "copy" && t.baseStyleId ? styleById.get(t.baseStyleId) ?? null : null;
    const baseTokens = useMemo(() => (t.kind === "stile" ? tokensOf(baseStyle) : tokensOf(liveStyle)), [t.kind, baseStyle, liveStyle]);
    const tk = useMemo(() => (t.kind === "stile" && i > 0 ? styleTokens(t, baseTokens) : t.kind === "stile" ? tokensOf(liveStyle) : baseTokens), [t, i, baseTokens, liveStyle]);
    useFonts(step === "aspetto" ? ["lora", "patrick-hand", tk.typography.fontFamily] : [tk.typography.fontFamily]);

    // scegliere lo stile di partenza riporta le quattro scelte a com'erano lì
    const onBase = (id: string | null) =>
        u(x => {
            x.base = id ? "copy" : "zero";
            x.baseStyleId = id;
            const a = aspectOf(tokensOf(id ? styleById.get(id) : null));
            x.dark = a.dark;
            x.font = a.font;
            x.card = a.card;
        });

    /* ---------- il Calendario: la bozza, i nomi, le durate ---------- */
    const calKind = t.kind === "storia" ? null : CAL_KIND[t.kind];
    const pair =
        t.kind === "menu"
            ? data.base?.styleId ?? data.systemStyleId ?? data.styles[0]?.id ?? null
            : t.kind === "stile"
              ? t.from?.catalogId ?? data.base?.catalogId ?? data.catalogs[0]?.id ?? null
              : null;
    const name = thingName(t);
    const names = useMemo<CalNames>(() => {
        const n = data.names;
        if (calKind === "menu") return { ...n, catalogs: new Map(n.catalogs).set(FAKE, name) };
        if (calKind === "style") return { ...n, styles: new Map(n.styles).set(FAKE, name) };
        if (calKind === "featured") return { ...n, featured: new Map(n.featured).set(FAKE, name) };
        return n;
    }, [data.names, calKind, name]);
    const draft: Draft | null = calKind ? draftFor(t, calKind, FAKE, pair) : null;
    // mettere in onda aspetta il database nuovo per le novità che non sa tenere (D149)
    const why = stepWhy || (last && !showAfter && owner && draft ? waitsForDb(draft) || scontriWait(draft, effect.scontri) : "");
    const updDraft = (fn: (d: Draft) => void) =>
        u(x => {
            const D = draftFor(x, calKind ?? "featured", FAKE, pair);
            if (x.qmode === "momenti") D.when = structuredClone(x.when);
            fn(D);
            if (x.qmode === "momenti") x.when = D.when;
            x.where = D.where;
            x.per = D.per;
        });
    const momentiDraft = draft && t.qmode === "momenti" ? { ...draft, when: t.when } : draft;
    const entries = useMemo(() => entriesFromRules(data.rules, data.names), [data.rules, data.names]);
    const axis = useMemo(() => axisFor(entries), [entries]);
    const durs = useMemo(() => {
        const today = romeToday();
        const m = new Map<string, CalWhen>();
        for (const e of [...entries.filter(x => x.kind === calKind), ...entries]) {
            if (m.size >= 6) break;
            const k = whenKey(e.when);
            if (k === "||" || (e.when.period && e.when.period.to < today) || m.has(k)) continue;
            m.set(k, e.when);
        }
        return [...m.values()].sort((a, b) => (a.period ? 1 : 0) - (b.period ? 1 : 0) || (a.period?.from ?? 0) - (b.period?.from ?? 0));
    }, [entries, calKind]);

    /* ---------- il telefono ---------- */
    const sample = useMemo(() => {
        const only = t.from?.productIds.length ? new Set(t.from.productIds) : undefined;
        return sampleOf(data.pickList, only);
    }, [data.pickList, t.from]);
    const menus = useMemo(() => {
        const first = data.base?.catalogId;
        return [...data.catalogs].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0)).map(x => x.name);
    }, [data.catalogs, data.base]);
    const imageUrl = useObjectUrl(t.image);
    const coverUrl = useObjectUrl(t.cover);
    const blockUrls = useMemo(() => Object.fromEntries(Object.entries(blockFiles).map(([k, f]) => [k, URL.createObjectURL(f)])), [blockFiles]);
    useEffect(() => () => Object.values(blockUrls).forEach(x => URL.revokeObjectURL(x)), [blockUrls]);
    const phoneT = useMemo(() => (t.kind === "storia" ? { ...t, blocks: t.blocks.map(x => (x.type === "image" && blockUrls[x.id] ? { ...x, url: blockUrls[x.id] } : x)) } : t), [t, blockUrls]);

    /* ---------- la testa ferma: misure per la colonna di destra ---------- */
    // la testa sta ferma sul bordo della colonna che scorre, sopra il suo margine
    // (`pad`): la colonna di destra si ferma 12px sotto la testa
    const hdrRef = useRef<HTMLDivElement>(null);
    const [hdr, setHdr] = useState({ h: 0, pad: 24 });
    useLayoutEffect(() => {
        const el = hdrRef.current;
        if (!el) return;
        const read = () => {
            const col = el.parentElement?.parentElement;
            const pad = col ? parseFloat(getComputedStyle(col).paddingTop) || 0 : 24;
            setHdr(p => (p.h === el.offsetHeight && p.pad === pad ? p : { h: el.offsetHeight, pad }));
        };
        const ro = new ResizeObserver(read);
        ro.observe(el);
        read();
        return () => ro.disconnect();
    }, []);
    const asideRef = useRef<HTMLElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    // usePhoneFit toglie già i due margini della colonna: resta la testa, 12px sopra e 16 sotto
    const fit = usePhoneFit(asideRef, boxRef, true, Math.max(0, hdr.h + 28 - 2 * hdr.pad));

    /* ---------- le azioni ---------- */
    const toTop = () => document.querySelector("main [class*='content']")?.scrollTo({ top: 0 });
    const go = (n: number) => u(x => void (x.i = Math.max(0, Math.min(n, st.length - 1))));
    const next = () => {
        if (why) return;
        if (last) return void finish(owner);
        u(x => {
            x.i = i + 1;
            x.seen = Math.max(x.seen, x.i);
        });
        toTop();
    };
    const back = () => u(x => void (x.i = Math.max(0, i - 1)));

    const landing = (k: CreaKind, id: string) => `${b}/${PAGE_OF[k]}/${id}`;

    async function finish(live: boolean): Promise<boolean> {
        // con l'abbonamento fermo non si crea niente, come dai bottoni «Crea» delle liste
        if (saving || !ensureActive()) return false;
        setSaving(true);
        try {
            const saved = await saveTunnel(t, { tenantId, L, live: live && owner, pair, baseTokens, blockFiles });
            const n = saved.name;
            const pub = t.kind === "menu" || t.kind === "stile" ? "in onda" : t.kind === "storia" ? "pubblicata" : "pubblicato";
            void reload();
            setLeave(false);
            // la bozza del Calendario si toglie solo quando va in onda
            if (t.aside && saved.live) dropAside();
            // il menù in onda apre «E adesso?»
            if (t.kind === "menu" && saved.live) {
                const done = { ...t, i: st.length - 1, seen: st.length - 1 };
                setAfter({ t: done, saved, kids: [] });
                setT(done);
                showToast({ message: `${n} è in onda.`, type: "success" });
                return true;
            }
            // un tunnel aperto da «E adesso?» torna lì
            if (after && t.from) {
                setAfter({ ...after, kids: [...after.kids, t.kind] });
                setT(after.t);
                showToast({ message: saved.live ? `${n}: ${pub}. Si torna a «E adesso?».` : `${n}: salvato come bozza. Si torna a «E adesso?».`, type: "success" });
                return true;
            }
            showToast({
                message: saved.live ? `${n}: ${pub}.` : t.kind === "storia" ? "Salvata come bozza: non è pubblicata." : "Salvato come bozza: non è in calendario.",
                type: "success"
            });
            setGoing(landing(t.kind, saved.id));
            return true;
        } catch (error) {
            console.error("[Crea] salvataggio non riuscito:", error);
            showToast({ message: `Non siamo riusciti a salvare ${IL[t.kind]}. Riprova.`, type: "error" });
            return false;
        } finally {
            setSaving(false);
        }
    }

    const exit = () => {
        if (showAfter) return finishAfter();
        if (isDirty(t)) return setLeave(true);
        discard();
    };
    const discard = () => {
        setLeave(false);
        if (after && t.from) return setT(after.t);
        setGoing(origin.to);
    };
    const finishAfter = () => after && setGoing(landing("menu", after.saved.id));

    const chain = (k: "stile" | "evid" | "storia") => {
        if (!after) return;
        const m = after.t;
        const from: FromMenu = {
            name: after.saved.name,
            catalogId: after.saved.id,
            ruleId: after.saved.ruleId,
            productIds: after.saved.productIds ?? [],
            when: effWhen(m),
            where: m.where,
            per: m.per
        };
        setT(newTunnel(k, m.where, from));
        toTop();
    };

    /* ---------- il corpo del passo ---------- */
    const styleName = (id: string) => styleById.get(id)?.name ?? "Stile";
    let body;
    if (showAfter && after) {
        body = (
            <Adesso
                name={after.saved.name}
                kids={after.kids}
                onChain={chain}
                onFinish={finishAfter}
                can={{ stile: true, evid: true, storia: true }}
            />
        );
    } else
        switch (step) {
            case "tipo":
                body = <MenuTipo t={t} u={u} />;
                break;
            case "parti":
                body = <MenuParti t={t} u={u} onImport={onImport} importing={importing} importError={importError} />;
                break;
            case "sezioni":
                body = <MenuSezioni t={t} u={u} pick={data.pickList} />;
                break;
            case "serve":
                body = <Serve t={t} example={t.kind === "stile" ? liveStyle?.name ?? null : null} business={business} />;
                break;
            case "nome":
                body = <StileNome t={t} u={u} styles={data.styles} onBase={onBase} />;
                break;
            case "aspetto":
                body = <StileAspetto t={t} u={u} />;
                break;
            case "cosa":
                body = <EvidCosa t={t} u={u} />;
                break;
            case "contenuto":
                body = <EvidContenuto t={t} u={u} owner={owner} imageUrl={imageUrl} />;
                break;
            case "piatti":
                body = <EvidPiatti t={t} u={u} pick={data.pickList} L={L} />;
                break;
            case "racconto":
                body = <StoriaRacconto t={t} u={u} pick={data.pickList} coverUrl={coverUrl} />;
                break;
            case "blocchi":
                body = (
                    <StoriaBlocchi
                        t={t}
                        u={u}
                        tenantId={tenantId}
                        files={blockFiles}
                        onFile={(id, f) =>
                            setBlockFiles(prev => {
                                const n = { ...prev };
                                if (f) n[id] = f;
                                else delete n[id];
                                return n;
                            })
                        }
                        productOptions={productOptions}
                    />
                );
                break;
            case "quando":
                body = <Quando t={t} u={u} draft={momentiDraft} updDraft={updDraft} durs={durs} axis={axis} />;
                break;
            case "dove": {
                const D = draft ?? draftFor(t, "featured", FAKE, null);
                body = <DoveQuando t={t} u={u} draft={D} updDraft={updDraft} sedi={data.sedi} groups={data.groups} L={L} durs={durs} axis={axis} />;
                break;
            }
            default:
                body = <Controlla t={t} c={c} L={L} effect={effect} styleName={styleName} onGo={n => go(n)} onInsieme={v => u(x => void (x.insieme = v))} />;
        }

    /* ---------- a destra ---------- */
    const week = !showAfter && (step === "quando" || step === "dove") && t.kind !== "storia" && !!momentiDraft;
    const preview = calKind && momentiDraft && (
        <SettimanaAnteprima
            rules={data.rules}
            names={names}
            sedi={data.sedi}
            groupIdsByActivity={data.groupIdsByActivity}
            groupNames={data.groupNames}
            formatNames={data.formatNames}
            draft={{ ...momentiDraft, when: structuredClone(effWhen(t)) }}
            pickList={data.pickList}
            onEffect={setEffect}
        />
    );
    const [qb, qp] = qcardText(t, showAfter ? "controlla" : step, L, t.kind === "stile" ? (t.base === "copy" ? baseStyle?.name ?? null : liveStyle?.name ?? null) : null);
    const right = week ? (
        <div className={s.week}>{preview}</div>
    ) : (
        <aside className={s.rside} ref={asideRef} aria-label="Così lo vede il cliente" style={fit.vars}>
            <div className={cx(s.qcard, fit.slim && s.slim)}>
                <span className={s.k}>
                    <Smartphone size={13} strokeWidth={1.75} aria-hidden />
                    Sul telefono
                </span>
                <b>{qb}</b>
                <p>{qp}</p>
            </div>
            <div className={s.phoneBox} ref={boxRef} style={fit.boxStyle}>
                <CreaPhone t={phoneT} step={showAfter ? "controlla" : step} tk={tk} business={business} menus={menus} sample={sample} L={L} imageUrl={imageUrl} coverUrl={coverUrl} />
            </div>
        </aside>
    );

    /* ---------- la testa ---------- */
    const pubLabel = owner ? KIND[t.kind].pub : "Salva";
    const title = showAfter && after ? `${after.saved.name} è in onda` : tunnelTitle(t);
    const sub = showAfter ? "Vuoi aggiungere qualcosa?" : `${st.length} passi. A destra vedi già com'è.`;
    const isMenuFlow = t.kind === "menu";
    const rootStyle = { "--stick": `${hdr.h + 12 - hdr.pad}px`, "--ihdr": `${hdr.h - hdr.pad}px` } as CSSProperties;

    return (
        <div className={s.root} style={rootStyle}>
            <div className={s.ihdr} ref={hdrRef}>
                <div className={s.itop}>
                    <nav className={s.icrumb} aria-label="Percorso">
                        <Button variant="ghost" size="sm" onClick={exit}>
                            {origin.label}
                        </Button>
                        <ChevronRight size={14} aria-hidden />
                        <b>{KIND[t.kind].t}</b>
                    </nav>
                    <span className={s.itopa}>
                        {!showAfter && (
                            <Button variant="secondary" size="sm" onClick={() => void finish(false)} disabled={saving}>
                                Tieni come bozza
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={exit}>
                            Esci
                        </Button>
                    </span>
                </div>
                <div className={s.ihead}>
                    <h2>{title}</h2>
                    <p className={cx(s.small, s.muted)}>{sub}</p>
                </div>
                <div className={s.istrow}>
                    <ol className={s.isteps}>
                        {st.map((n, j) => {
                            const can = !showAfter && j <= t.seen && (!fb || j <= fb.i || j <= i);
                            const done = showAfter || j < i;
                            return (
                                <li key={n}>
                                    <button type="button" aria-current={!showAfter && j === i ? "step" : "false"} className={done ? s.done : undefined} disabled={!can} onClick={() => go(j)}>
                                        <span className={s.idot}>{done ? <Check size={12} aria-hidden /> : j + 1}</span>
                                        {STEP_LABEL[n]}
                                    </button>
                                </li>
                            );
                        })}
                        {isMenuFlow && (
                            <li>
                                <button type="button" disabled aria-current={showAfter ? "step" : "false"}>
                                    <span className={s.idot}>
                                        <Sparkles size={12} aria-hidden />
                                    </span>
                                    E adesso?
                                </button>
                            </li>
                        )}
                    </ol>
                    {!showAfter && (
                        <span className={s.iacts}>
                            {why && <span className={s.why}>{why}</span>}
                            {i > 0 && (
                                <Button variant="secondary" size="sm" leftIcon={<ArrowLeft size={14} />} onClick={back}>
                                    Indietro
                                </Button>
                            )}
                            <Button variant="primary" size="sm" rightIcon={last ? undefined : <ArrowRight size={14} />} onClick={next} disabled={!!why || saving} loading={saving && last}>
                                {last ? pubLabel : "Avanti"}
                            </Button>
                        </span>
                    )}
                </div>
            </div>
            {after && t.from && !showAfter && (
                <div className={s.inh}>
                    <CornerDownRight size={15} aria-hidden />
                    <span>Fa parte di {q(after.saved.name)}: finito, si torna a «E adesso?».</span>
                </div>
            )}
            <div className={cx(s.igrid, week && s.wide)}>
                <div className={s.iform}>{body}</div>
                {right}
            </div>
            {/* in «Controlla» le righe di cosa cambia: la settimana c'è, non si vede */}
            {!week && step === "controlla" && owner && calKind && <div hidden>{preview}</div>}
            <UnsavedChangesDialog
                isOpen={leave}
                title="Uscire dal tunnel?"
                message={`${t.kind === "storia" ? "La storia" : "Quello che hai scritto"} non è ancora salvat${t.kind === "storia" ? "a" : "o"}. Se esci senza salvare, lo perdi.`}
                cancelLabel="Resta qui"
                saveLabel="Tieni come bozza ed esci"
                wide
                onCancel={() => setLeave(false)}
                onDiscard={discard}
                onSaveAndExit={() => finish(false)}
            />
        </div>
    );
}

