// Il tunnel di creazione: i passi, il telefono o la settimana a destra, il
// salvataggio e «E adesso?».
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Pencil, Smartphone, Sparkles, X } from "lucide-react";
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
import type { FontFamily, StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { V2Style } from "@/services/supabase/styles";
import { axisFor, entriesFromRules, romeToday, type CalNames, type CalWhen } from "@/pages/Dashboard/Programming/calendar/calendarModel";
import { DB_WAIT, NEW_MODEL, sediOf, NO_IMPATTO, draftFromEntry, dropAside, scontriWait, waitsForDb, whenKey, type Draft, type Impatto } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { rebase, adessoDid, FONTS, KIND, ONDA, goesLive, MAX_IMPORT_FILES, readFromAi, qcardText, withAside, blocker, changed, clonePer, effWhen, firstBlock, isDirty, lit, newTunnel, skipped, stepFrom, stepLabel, steps, thingName, touched, tunnelTitle, type CreaKind, type From, type StepId, type Tunnel } from "./creaModel";
import { badSel, useBad, type Bad } from "./creaBad";
import { CAL_KIND, draftFor, saveTunnel, type Saved } from "./creaSave";
import { saveEdit } from "./creaEdit";
import { allEntriesOf, copySections, entriesOf, loadTunnel, type Loaded } from "./creaLoad";
import { sampleOf, styleTokens, tokensOf, useFonts, useStyleSeen } from "./creaStyle";
import { StileAspetto } from "./StileAspetto";
import { StilePhone } from "./StilePhone";
import { lookKey } from "./stileLook";
import { type CreaData } from "./useCreaData";
import { CreaPhone } from "./CreaPhone";
import { allSecs } from "./menuTree";
import { IMPORT_ACCEPT, MenuCategorie, type ReadResult } from "./MenuCategorie";
import { EvidContenuto } from "./EvidContenuto";
import { Adesso, Controlla, Dove, DoveQuando, Modifica, MenuParti, Quando, QuandoOre, Serve, StileNome, StoriaBlocchi, StoriaRacconto, type U } from "./CreaSteps";
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

/** Il tunnel di creazione già su «Parti da questo stile». */
function fromSystem(t: Tunnel, st: V2Style | undefined): Tunnel {
    return st ? { ...t, base: "copy", baseStyleId: st.id, look: structuredClone(tokensOf(st)) } : t;
}

const FONT_ALL = Object.keys(FONTS) as FontFamily[];

export type TunnelProps = {
    kind: CreaKind;
    aside: Pick<Draft, "when" | "where"> | null;
    /** La cosa già creata che si modifica (D140), letta dal database. */
    edit?: Loaded | null;
    /** Uno stile di CataloGlobe non si modifica: si parte da lui per farne uno proprio (D186, 4A). */
    fromStyle?: string | null;
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
type After = { t: Tunnel; saved: Saved };

export function Tunnelo({ kind, aside, edit, fromStyle, data, tenantId, owner, origin, business, reload, navigate, showToast, b }: TunnelProps) {
    const L = data.L;
    const { ensureActive } = useEnsureActive();
    // con più sedi le sedi si scelgono apposta: si parte da nessuna (la storia ha ancora tutte)
    const allWhere = { all: !L.multi || kind === "storia", activityIds: [], groupIds: [] };
    const [t, setT] = useState<Tunnel>(() => (edit ? edit.t : aside ? withAside(newTunnel(kind, allWhere), aside) : fromSystem(newTunnel(kind, allWhere), data.styles.find(x => x.id === fromStyle))));
    const [after, setAfter] = useState<After | null>(null);
    /** «E adesso?» aperto (alla fine di ogni creazione, D194), o un tunnel aperto da lì. */
    const showAfter = !!after && t === after.t;
    const [saving, setSaving] = useState(false);
    const [leave, setLeave] = useState(false);
    const [going, setGoing] = useState<string | null>(null);
    const [effect, setEffect] = useState<Impatto>(NO_IMPATTO);
    const [blockFiles, setBlockFiles] = useState<Record<string, File>>({});
    const [productOptions, setProductOptions] = useState<StoryProductOptions>({ items: null, failed: false });
    const refreshAiUsage = useBusinessOutletContext()?.refreshAiUsage;

    // nelle sue ore c'è già un altro, e il tuo può prenderne il posto: si sceglie nel «Quando»
    const clash = NEW_MODEL.multiMenu && NEW_MODEL.newestWins && owner && t.onda === "on" && (kind === "menu" || kind === "stile") && effect.scontri.some(x => x.vince);
    const c = useMemo(() => ({ owner, multi: L.multi, clash }), [owner, L.multi, clash]);
    const u: U = useCallback(fn => setT(prev => {
        const n = structuredClone(prev);
        fn(n);
        return n;
    }), []);

    // La foto o il PDF del menù (D165, D180): l'AI legge e il passo mostra il
    // resoconto; il menù cambia solo con «Aggiungi», il database solo al Salva.
    const onRead = useCallback(
        async (picked: File[], signal: AbortSignal): Promise<ReadResult> => {
            const types = IMPORT_ACCEPT.split(",");
            const usable = picked.filter(f => types.includes(f.type));
            const { accepted } = partitionBySizeBudget([], usable.slice(0, MAX_IMPORT_FILES));
            if (!accepted.length) return { ok: false, error: usable.length ? "I file sono troppo pesanti: foto fino a 25 MB, PDF fino a 20 MB, 30 MB in tutto." : "Servono foto (JPG, PNG o WEBP) o PDF." };
            const res = await analyzeMenuFiles(tenantId, accepted, signal, refreshAiUsage);
            if (!res) return null;
            if (!res.ok) return { ok: false, error: res.error };
            if (accepted.length < picked.length) {
                showToast({ message: `Letti ${accepted.length} file su ${picked.length}: gli altri erano troppi, troppo pesanti o non erano foto o PDF.`, type: "info" });
            }
            return { ok: true, items: readFromAi(res.categories, data.pickList), file: accepted.length === 1 ? accepted[0].name : `${accepted.length} file` };
        },
        [tenantId, refreshAiUsage, data.pickList, showToast]
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
    // il «Quando» in due parti (più sedi): dalla prima «Avanti» porta alla seconda, non a «Controlla»
    const oreOnly = step === "quando" && L.multi && clash && t.qPart !== 2;
    const nothing = !!t.edit && !isDirty(t);
    // ciò che manca: «Avanti» resta acceso e ci porta (creaBad)
    const missing = showAfter ? "" : last ? fb?.why ?? "" : t.edit && step !== "modifica" && !touched(t, step) ? "" : blocker(t, step, oreOnly ? { ...c, clash: false } : c);
    const [bad, setBad] = useState<Bad | null>(null);
    const formRef = useRef<HTMLDivElement>(null);
    // il segno resta finché manca la stessa cosa
    const badNow = bad && !showAfter && bad.why === blocker(t, step, c) ? bad : null;
    useEffect(() => {
        if (bad && !badNow) setBad(null);
    }, [bad, badNow]);
    useBad(formRef, badNow, badNow ? badSel(step, badNow.why, t) : "");

    /* ---------- lo stile del telefono ---------- */
    const styleById = useMemo(() => new Map(data.styles.map(x => [x.id, x])), [data.styles]);
    const liveStyle = styleById.get(data.base?.styleId ?? data.systemStyleId ?? "") ?? data.styles[0] ?? null;
    const baseStyle = t.edit ? edit?.style ?? null : t.kind === "stile" && t.base === "copy" && t.baseStyleId ? styleById.get(t.baseStyleId) ?? null : null;
    const liveTokens = useMemo(() => tokensOf(liveStyle), [liveStyle]);
    const tk = t.kind === "stile" && (i > 0 || t.edit) ? styleTokens(t) : liveTokens;
    useFonts(step === "aspetto" ? FONT_ALL : [tk.typography.fontFamily]);

    // nel passo dell'aspetto il telefono è la pagina vera; «com'era prima» vale finché non si tocca altro
    const realPhone = t.kind === "stile" && step === "aspetto" && !showAfter;
    const was = t.edit?.orig.look ?? null;
    const seen = useStyleSeen(t.kind === "stile" && t.edit ? t.edit.id : null, tenantId);
    const [peek, setPeek] = useState<{ key: string; look: StyleTokenModel; label: string } | null>(null);
    const peeking = peek && peek.key === lookKey(t.look) ? peek : null;
    const onPeek = (look: StyleTokenModel | null, label = "") => setPeek(look ? { key: lookKey(t.look), look, label } : null);

    // scegliere lo stile di partenza riporta tutto l'aspetto a com'è lì
    const onBase = (id: string | null) =>
        u(x => {
            x.base = id ? "copy" : "zero";
            x.baseStyleId = id;
            x.look = structuredClone(tokensOf(id ? styleById.get(id) : null));
        });

    // «Copia da un altro menù»: tutti i menù, anche quelli non in onda
    const copyMenus = useMemo(() => (kind === "menu" ? data.catalogs.map(x => ({ id: x.id, name: x.name, live: entriesOf("menu", x.id, data).length > 0 })) : []), [kind, data]);
    const copyAsk = useRef<string | null>(null);
    const onCopy = (m: { id: string; name: string }) => {
        copyAsk.current = m.id;
        u(x => {
            x.copyFrom = m.id;
            if (!x.name.trim()) x.name = m.name + " (copia)";
        });
        copySections(m.id, tenantId, data)
            // conta solo l'ultimo menù scelto, e solo se nel frattempo non si è cambiata strada
            .then(secs => copyAsk.current === m.id && u(x => void (x.copyFrom === m.id && (x.sections = secs))))
            .catch(error => {
                console.error("[Crea] il menù da copiare non si è letto:", error);
                if (copyAsk.current !== m.id) return;
                u(x => void (x.copyFrom === m.id && (x.copyFrom = null)));
                showToast({ message: `Non siamo riusciti a leggere ${q(m.name)}. Riprova.`, type: "error" });
            });
    };

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
    // modificando, la bozza è la sua voce del Calendario: la settimana non la conta due volte
    const editId = t.edit?.id, editRule = t.edit?.ruleId;
    // anche spenta (D189): rimettendolo in onda si riaccende la sua voce
    const editEntry = useMemo(() => (editId && editRule ? allEntriesOf(kind, editId, data).find(e => e.ruleId === editRule) ?? null : null), [kind, editId, editRule, data]);
    const draft: Draft | null = !calKind
        ? null
        : editEntry
          ? { ...draftFromEntry(editEntry, L, calKind === "featured" && editEntry.rule.featured_contents.length > 1 ? editId : null), when: structuredClone(effWhen(t)), where: t.where, per: clonePer(t.per) }
          : draftFor(t, calKind, FAKE, pair);
    // tenuto pronto non tocca il Calendario (D189)
    const calTouched = t.onda === "on" && (!t.edit || changed(t, "dove") || changed(t, "quando"));
    // mettere in onda aspetta il database nuovo per le novità che non sa tenere (D149)
    const calWhy = owner && draft && calTouched ? waitsForDb(draft) || (clash && kind === "stile" && t.insieme ? "Lascia gli altri stili: " + DB_WAIT : scontriWait(draft, effect.scontri)) : "";
    // i blocchi che «Avanti» non sa sistemare: lì il bottone resta spento, col motivo accanto
    const why = showAfter || !last ? "" : nothing ? "Non hai cambiato niente" : calWhy;
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
    const imageUrl = useObjectUrl(t.image) ?? t.imageUrl;
    const coverUrl = useObjectUrl(t.cover) ?? t.coverUrl;
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
    const jump = (n: number) =>
        u(x => {
            x.i = Math.max(0, Math.min(n, st.length - 1));
            // manca la scelta «insieme o al posto»: si torna alla seconda parte del «Quando»
            if (st[x.i] === "quando" && fb?.why.startsWith("Scegli: ")) x.qPart = 2;
        });
    const go = (n: number) => {
        setBad(null);
        jump(n);
    };
    const next = () => {
        if (why) return;
        if (last && fb) {
            setBad({ why: fb.why, n: Date.now() });
            return jump(fb.i);
        }
        if (last) return void finish();
        if (missing) return setBad({ why: missing, n: Date.now() });
        setBad(null);
        if (oreOnly) return u(x => void (x.qPart = 2));
        u(x => {
            x.i = stepFrom(x, c, i, 1);
            x.seen = Math.max(x.seen, x.i);
        });
        toTop();
    };
    const back = () => {
        setBad(null);
        u(x => void (x.i = stepFrom(x, c, i, -1)));
    };

    // lo stile non ha una pagina sua: il suo editor è questo tunnel, e si torna all'elenco
    const landing = (k: CreaKind, id: string) => (k === "stile" ? `${b}/${PAGE_OF[k]}` : `${b}/${PAGE_OF[k]}/${id}`);

    // i passi già riusciti di un salvataggio fallito a metà: «Riprova» riparte da lì
    const progress = useRef(new Map<string, unknown>());
    const savingNow = useRef(false);
    async function finish(): Promise<boolean> {
        // con l'abbonamento fermo non si crea niente, come dai bottoni «Crea» delle liste
        // un ref, non lo stato: due clic nello stesso istante vedrebbero tutti e due `saving` falso
        if (savingNow.current || !ensureActive()) return false;
        // anche da «Salva le modifiche ed esci»: gli stessi controlli del bottone «Salva»
        if (t.edit && (fb || nothing || calWhy)) {
            setLeave(false);
            showToast({ message: fb ? `${fb.why}: torna a «${stepLabel(t, st[fb.i])}».` : nothing ? "Non hai cambiato niente." : calWhy, type: "error" });
            return false;
        }
        savingNow.current = true;
        setSaving(true);
        try {
            if (t.edit) {
                await saveEdit(t, { tenantId, L, names: data.names, blockFiles, done: progress.current, pair, owner });
                progress.current = new Map();
                void reload();
                setLeave(false);
                showToast({ message: "Modifiche salvate.", type: "success" });
                setGoing(origin.to);
                return true;
            }
            const saved = await saveTunnel(t, { tenantId, L, live: goesLive(t, c), pair, blockFiles, done: progress.current });
            progress.current = new Map();
            const n = saved.name;
            const pub = "in onda";
            // tenuto pronto (D189): le parole della pagina
            const kept = `${ONDA[t.kind].Il} resta in «${KIND[t.kind].page}» come «${ONDA[t.kind].Pronto}, non in onda».`;
            void reload();
            setLeave(false);
            // la bozza del Calendario si toglie solo quando va in onda
            if (t.aside && saved.live) dropAside(tenantId);
            // ogni creazione finisce con «E adesso?» (D194), anche tenuta pronta
            const done = { ...t, i: st.length - 1, seen: st.length - 1 };
            setAfter({ t: done, saved });
            setT(done);
            showToast({ message: saved.live ? (t.kind === "menu" ? `${n} è in onda.` : `${n}: ${pub}.`) : kept, type: "success" });
            return true;
        } catch (error) {
            console.error("[Crea] salvataggio non riuscito:", error);
            // in modifica una parte può essere già scritta: si rilegge, e «Riprova» fa solo quel che manca
            if (t.edit) {
                const fresh = await loadTunnel(t.kind, t.edit.id, tenantId, data).catch(() => null);
                if (fresh) setT(cur => rebase(cur, fresh.t));
                void reload();
            }
            showToast({ message: `Non siamo riusciti a salvare ${IL[t.kind]}. Riprova.`, type: "error" });
            return false;
        } finally {
            savingNow.current = false;
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
        progress.current = new Map();
        if (after && t.from) return setT(after.t);
        setGoing(origin.to);
    };
    const finishAfter = () => after && setGoing(landing(after.t.kind, after.saved.id));

    // il primo piatto della cosa appena creata: da lì partono il contenuto in evidenza e la storia
    const afterDish = useMemo(() => {
        if (!after) return null;
        const m = after.t;
        const named = (id: string | undefined) => (id ? { id, name: L.products.get(id)?.name ?? data.names.products.get(id) ?? "" } : null);
        if (m.kind === "menu") {
            const d = allSecs(m.sections).flatMap(x => x.sec.dishes)[0];
            const id = after.saved.productIds?.[0];
            return d && id ? { id, name: d.name } : null;
        }
        const d = m.kind === "evid" ? named(m.dishes[0]) : m.kind === "storia" ? named(m.linked) : null;
        return d?.name ? d : null;
    }, [after, L.products, data.names.products]);

    const chain = (k: CreaKind) => {
        if (!after) return;
        const m = after.t;
        const from: From = {
            kind: m.kind,
            name: after.saved.name,
            catalogId: m.kind === "menu" ? after.saved.id : null,
            ruleId: m.kind === "menu" ? after.saved.ruleId : null,
            productIds: m.kind === "menu" ? after.saved.productIds ?? [] : [],
            dish: afterDish,
            onda: after.saved.live ? "on" : "off",
            when: effWhen(m),
            where: m.where,
            per: m.per
        };
        progress.current = new Map();
        setBad(null);
        setT(newTunnel(k, { all: !L.multi || k === "storia", activityIds: [], groupIds: [] }, from));
        toTop();
    };

    /* ---------- il corpo del passo ---------- */
    const styleName = (id: string) => styleById.get(id)?.name ?? "Stile";
    let body;
    if (showAfter && after) {
        body = (
            <Adesso
                kind={after.t.kind}
                did={adessoDid(after.t, after.saved, { multi: L.multi, sedi: sediOf(after.t.where, data.sedi, data.groups).map(id => L.sedi.get(id) ?? "sede"), dish: afterDish?.name ?? "" })}
                name={after.saved.name}
                live={after.saved.live}
                dish={afterDish?.name ?? ""}
                onChain={chain}
                onFinish={finishAfter}
            />
        );
    } else
        switch (step) {
            case "modifica":
                body = <Modifica t={t} u={u} c={c} L={L} styleName={styleName} />;
                break;
            case "parti":
                body = <MenuParti t={t} u={u} menus={copyMenus} tenantId={tenantId} onCopy={onCopy} />;
                break;
            case "sezioni":
                body = <MenuCategorie t={t} u={u} pick={data.pickList} onRead={onRead} />;
                break;
            case "serve":
                body = <Serve t={t} example={t.kind === "stile" ? liveStyle?.name ?? null : null} business={business} />;
                break;
            case "nome":
                body = <StileNome t={t} u={u} styles={data.styles} onBase={onBase} />;
                break;
            case "aspetto":
                body = <StileAspetto t={t} u={u} tenantId={tenantId} rules={t.edit ? styleById.get(t.edit.id)?.usage_count ?? 0 : 0} onPeek={onPeek} seen={seen} />;
                break;
            case "contenuto":
                body = <EvidContenuto t={t} u={u} owner={owner} imageUrl={imageUrl} pick={data.pickList} L={L} />;
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
                        onFile={(id, f) => {
                            setBlockFiles(prev => {
                                const n = { ...prev };
                                if (f) n[id] = f;
                                else delete n[id];
                                return n;
                            });
                            u(x => void (x.pending = f ? [...new Set([...x.pending, id])] : x.pending.filter(y => y !== id)));
                        }}
                        productOptions={productOptions}
                    />
                );
                break;
            case "quando":
                // con più sedi il Dove è già stato scelto: qui solo le ore
                body = L.multi && draft ? <QuandoOre t={t} u={u} L={L} draft={momentiDraft ?? draft} updDraft={updDraft} sedi={data.sedi} groups={data.groups} durs={durs} axis={axis} clash={clash} scontri={effect.scontri} onPart={n => (n === 2 ? next() : u(x => void (x.qPart = 1)))} /> : <Quando t={t} u={u} L={L} draft={momentiDraft} updDraft={updDraft} durs={durs} axis={axis} clash={clash} scontri={effect.scontri} />;
                break;
            case "dove": {
                const D = draft ?? draftFor(t, "featured", FAKE, null);
                body = t.kind !== "storia" ? <Dove t={t} u={u} L={L} draft={D} updDraft={updDraft} sedi={data.sedi} groups={data.groups} /> : <DoveQuando t={t} u={u} draft={D} updDraft={updDraft} sedi={data.sedi} groups={data.groups} L={L} durs={durs} axis={axis} />;
                break;
            }
            default:
                body = <Controlla t={t} c={c} L={L} seen={seen} effect={effect} styleName={styleName} onGo={n => go(n)} onInsieme={v => u(x => void (x.insieme = v))} />;
        }

    /* ---------- a destra ---------- */
    // «Categorie e piatti» prende tutta la larghezza: l'albero e il menù, senza il telefono (D177)
    const full = !showAfter && step === "sezioni";
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
                {realPhone ? <StilePhone look={peeking?.look ?? tk} business={business} menu={menus[0] ?? ""} /> : <CreaPhone t={phoneT} step={showAfter ? "controlla" : step} tk={tk} business={business} menus={menus} sample={sample} L={L} imageUrl={imageUrl} coverUrl={coverUrl} />}
            </div>
            {realPhone && peeking && (
                <button type="button" className={s.cmpb} aria-pressed onClick={() => onPeek(null)}>
                    {peeking.label}: torna alle tue modifiche
                </button>
            )}
            {realPhone && !peeking && was && lookKey(was) !== lookKey(t.look) && (
                <button type="button" className={s.cmpb} aria-pressed={false} onClick={() => onPeek(was, "Com'era prima")}>
                    Guarda com'era prima
                </button>
            )}
        </aside>
    );

    /* ---------- la testa ---------- */
    const pubLabel = t.edit ? "Salva le modifiche" : goesLive(t, c) ? KIND[t.kind].pub : `Salva e tieni ${ONDA[t.kind].pronto}`;
    const title = showAfter && after ? after.saved.name : tunnelTitle(t);
    const sub = showAfter ? "Vuoi aggiungere qualcosa?" : t.edit ? "Scegli cosa cambiare: il resto resta com'è." : `${st.length} passi. A destra vedi già com'è.`;
    // «E adesso?» chiude ogni creazione, mai una modifica (D194)
    const creating = !t.edit;
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
                        <b>{t.edit ? KIND[t.kind].edit : KIND[t.kind].t}</b>
                    </nav>
                    <span className={s.itopa}>
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
                    <ol className={cx(s.isteps, t.edit && s.editing)}>
                        {st.map((n, j) => {
                            // modificando ci si sposta dove si vuole: viola i passi scelti o toccati, grigi gli altri (D140)
                            const part = !!t.edit && n !== "modifica" && n !== "controlla";
                            // tenuto pronto, il «Quando» si salta
                            const skip = skipped(t, n, c);
                            const can = !skip && (t.edit ? true : !showAfter && j <= t.seen && (!fb || j <= fb.i || j <= i));
                            const done = !skip && !t.edit && (showAfter || j < i);
                            return (
                                <li key={n}>
                                    <button
                                        type="button"
                                        aria-current={!showAfter && j === i ? "step" : "false"}
                                        className={cx(done && s.done, part && (lit(t, n) ? s.pick : s.grey))}
                                        disabled={!can}
                                        onClick={() => go(j)}
                                    >
                                        <span className={s.idot}>{done ? <Check size={12} aria-hidden /> : n === "modifica" ? <Pencil size={11} aria-hidden /> : t.edit ? j : j + 1}</span>
                                        {stepLabel(t, n)}
                                        {/* la scelta fatta nel «Dove e quando» (D189) */}
                                        {(n === "dove" || n === "quando") && t.onda && <em>{t.onda === "on" ? "· in onda" : "· non in onda"}</em>}
                                    </button>
                                </li>
                            );
                        })}
                        {creating && (
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
            <div className={cx(s.igrid, week && s.wide, full && s.full)}>
                <div className={s.iform} ref={formRef}>
                    {body}
                </div>
                {!full && right}
            </div>
            {/* in «Controlla» le righe di cosa cambia: la settimana c'è, non si vede */}
            {!week && step === "controlla" && owner && calKind && <div hidden>{preview}</div>}
            <UnsavedChangesDialog
                isOpen={leave}
                title="Uscire dal tunnel?"
                message={t.edit ? "Le modifiche non sono ancora salvate. Se esci senza salvare, le perdi." : "Quello che hai scritto non è ancora salvato. Se esci senza salvare, lo perdi."}
                cancelLabel="Resta"
                saveLabel="Salva le modifiche ed esci"
                wide
                onCancel={() => setLeave(false)}
                onDiscard={discard}
                onSaveAndExit={t.edit ? () => finish() : undefined}
            />
        </div>
    );
}

