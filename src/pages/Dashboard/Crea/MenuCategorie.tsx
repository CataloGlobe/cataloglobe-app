// «Categorie e piatti» del tunnel del menù (D177, D180), uguale creando e
// modificando: a sinistra l'albero, a destra il menù nell'ordine del cliente.
// Si trascina prima, dopo o dentro; l'import apre un resoconto e il menù non
// cambia finché non si tocca «Aggiungi». Artifact «Il menù nel tunnel», v8.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeftToLine, ArrowUp, Check, Folder, GripVertical, Plus, RefreshCw, Sparkles, TriangleAlert, Upload, Utensils, X } from "lucide-react";
import type { PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { MAX_IMPORT_FILES, key, priceText, type Dish, type Read, type Section, type Tunnel } from "./creaModel";
import { MAX_LEVEL, allDishes, allSecs, cats, catsOf, dropDish, dropSec, ensure, findDish, findSec, height, inside, moveOut, pathName, pathOf, shift, total, totalOf, type Drop } from "./menuTree";
import s from "./MenuCategorie.module.scss";

export const IMPORT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export type ReadResult = { ok: true; items: Read[]; file: string } | { ok: false; error: string } | null;
export type Suggest = { name: string; price: number | null };

type St = "new" | "lnk" | "chk" | "dup";
type Item = Read & { st: St; on: boolean; to: string; raw: string };
type Imp =
    | { phase: "pick"; error: string | null }
    | { phase: "read"; file: string }
    | { phase: "done"; file: string; T: Section[]; ghosts: string[]; items: Item[] };
type Ai = { open: boolean; loading: boolean; list: Suggest[]; page: number; error: boolean };

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const parsePrice = (x: string) => {
    const n = parseFloat(x.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// un prodotto che c'è già porta il suo prezzo: qui non lo si chiede
const need = (it: Item) => it.on && !it.productId && !(it.price !== null && it.price > 0);
const EASE = "cubic-bezier(.2,.8,.2,1)";
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const ST_LABEL: Record<Exclude<St, "dup">, string> = { new: "nuovo", lnk: "già fra i vostri prodotti: lo colleghiamo", chk: "da controllare" };
const JUMP_COLOR: Record<string, [string, string]> = {
    new: ["--k-ok-soft", "--k-ok"],
    lnk: ["--k-brand-soft", "--k-brand"],
    chk: ["--k-bad-soft", "--k-bad"],
    todo: ["--k-bad-soft", "--k-bad"],
    dup: ["--k-sunk", "--k-muted"]
};

/** Scrivi un piatto, o cercalo fra i tuoi: preso uno che avete già, il prezzo è il suo. */
export function DishInput({ pick, taken, label, onAdd }: { pick: readonly PickProduct[]; taken: ReadonlySet<string>; label: string; onAdd: (p: PickProduct | null, name: string) => void }) {
    const [name, setName] = useState("");
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState(0);
    const sugg = useMemo(() => {
        const n = name.trim().toLowerCase();
        return n ? pick.filter(p => !taken.has(p.id) && p.name.toLowerCase().includes(n)).slice(0, 8) : [];
    }, [name, pick, taken]);
    const add = (p?: PickProduct) => {
        const n = name.trim();
        const mine = p ?? pick.find(x => !taken.has(x.id) && same(x.name, n)) ?? null;
        if (!mine && !n) return;
        onAdd(mine, n);
        setName("");
        setOpen(false);
        setSel(0);
    };
    return (
        <>
            <input
                className={s.in}
                placeholder="Scrivi un piatto, o cercalo fra i tuoi"
                autoComplete="off"
                aria-label={label}
                role="combobox"
                aria-expanded={open && sugg.length > 0}
                value={name}
                onChange={e => {
                    setName(e.target.value);
                    setOpen(true);
                    setSel(0);
                }}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onKeyDown={e => {
                    if (e.key === "ArrowDown" && sugg.length) {
                        e.preventDefault();
                        setSel(i => Math.min(sugg.length - 1, i + 1));
                    } else if (e.key === "ArrowUp" && sugg.length) {
                        e.preventDefault();
                        setSel(i => Math.max(0, i - 1));
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        add(open && sugg.length ? sugg[sel] : undefined);
                    } else if (e.key === "Escape") setOpen(false);
                }}
            />
            <button type="button" className={s.btn} onClick={() => add()}>
                <Plus size={14} aria-hidden />
                Aggiungi
            </button>
            {open && sugg.length > 0 && (
                <div className={s.mine} role="listbox" aria-label="Prodotti che avete">
                    {sugg.map((p, i) => (
                        <button key={p.id} type="button" role="option" aria-selected={i === sel} onMouseDown={e => e.preventDefault()} onClick={() => add(p)}>
                            <span>{p.name}</span>
                            <span>{priceText(p.listPrice)}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

type Props = {
    t: Tunnel;
    u: (fn: (t: Tunnel) => void) => void;
    pick: readonly PickProduct[];
    /** Legge la foto o il PDF; null se qui l'import non c'è. */
    onRead: ((files: File[], signal: AbortSignal) => Promise<ReadResult>) | null;
    /** Propone piatti per una categoria; null se qui i suggerimenti non ci sono. */
    onSuggest: ((category: string, have: string[]) => Promise<Suggest[]>) | null;
};

export function MenuCategorie({ t, u, pick, onRead, onSuggest }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const ghostRef = useRef<HTMLDivElement>(null);
    const dlineRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [sel, setSel] = useState("all");
    const [ren, setRen] = useState<string | null>(null);
    const [openV, setOpenV] = useState<ReadonlySet<string>>(new Set());
    const [ai, setAi] = useState<Record<string, Ai>>({});
    const [imp, setImp] = useState<Imp | null>(null);
    const [over, setOver] = useState(false);
    const run = useRef<AbortController | null>(null);
    const jump = useRef<Record<string, number>>({});
    const byId = useMemo(() => new Map(pick.map(p => [p.id, p])), [pick]);

    const done = imp?.phase === "done" ? imp : null;
    const M = t.sections;
    const root = done ? done.T : M;
    const taken = useMemo(() => new Set(allDishes(M).map(d => d.productId).filter((v): v is string => !!v)), [M]);

    /* ---------- le animazioni: ogni cosa va al suo posto nuovo, chi l'hai mossa tu si alza ---------- */
    const before = useRef<Map<string, { left: number; top: number; n: string }> | null>(null);
    const actor = useRef<string | null>(null);
    const keyed = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-k]") ?? []);
    const pillOf = (el: HTMLElement) => (el.dataset.kind === "sect" ? el.querySelector<HTMLElement>(":scope > [data-head] [data-np]") : el.dataset.kind === "tr" ? el.querySelector<HTMLElement>("[data-np]") : null);
    const headOf = (el: HTMLElement) => (el.dataset.kind === "sect" ? el.querySelector<HTMLElement>(":scope > [data-head]") ?? el : el);
    const flash = (el: HTMLElement, delay = 0) =>
        el.animate(
            [
                { boxShadow: "inset 0 0 0 2px var(--k-brand)", backgroundColor: "var(--k-brand-soft)" },
                { boxShadow: "inset 0 0 0 2px transparent", backgroundColor: "transparent" }
            ],
            { duration: 800, delay, easing: "ease-out" }
        );
    /** Da chiamare prima di ogni cambio che sposta qualcosa: ricorda dov'era tutto. */
    const mark = (who: string | null = null, from: { k: string; x: number; y: number } | null = null) => {
        if (still()) return;
        const m = new Map<string, { left: number; top: number; n: string }>();
        for (const el of keyed()) {
            const r = el.getBoundingClientRect();
            m.set(el.dataset.k!, { left: r.left, top: r.top, n: pillOf(el)?.textContent ?? "" });
        }
        const o = from && m.get(from.k);
        if (o && from) Object.assign(o, { left: from.x, top: from.y });
        before.current = m;
        actor.current = who;
    };
    useLayoutEffect(() => {
        const b = before.current;
        if (!b) return;
        before.current = null;
        const who = actor.current;
        actor.current = null;
        if (!b.size) return;
        const els = keyed();
        const dl = new Map<HTMLElement, { dx: number; dy: number }>();
        for (const el of els) {
            const o = b.get(el.dataset.k!);
            if (!o) continue;
            const r = el.getBoundingClientRect();
            dl.set(el, { dx: o.left - r.left, dy: o.top - r.top });
        }
        for (const el of els) {
            const o = b.get(el.dataset.k!);
            const anc = el.parentElement?.closest<HTMLElement>("[data-k]") ?? null;
            const kind = el.dataset.kind;
            if (!o) {
                if (anc && !dl.has(anc)) continue;
                el.animate(
                    [
                        { opacity: 0, transform: "translateY(-6px) scale(.97)" },
                        { opacity: 1, transform: "none" }
                    ],
                    { duration: 260, easing: EASE }
                );
                if (kind !== "var" && kind !== "one") flash(headOf(el), 120);
                continue;
            }
            const d = dl.get(el)!;
            const a = (anc && dl.get(anc)) || { dx: 0, dy: 0 };
            const dx = d.dx - a.dx;
            const dy = d.dy - a.dy;
            const me = !!who && el.dataset.k!.slice(1) === who;
            if (Math.abs(dx) + Math.abs(dy) > 1) {
                el.style.position = "relative";
                el.style.zIndex = me ? "6" : "1";
                if (me && kind !== "sect") el.style.background = "var(--k-surface)";
                const an = el.animate(
                    me
                        ? [
                              { transform: `translate(${dx}px,${dy}px)`, boxShadow: "0 0 0 rgba(20,26,46,0)" },
                              { transform: `translate(${dx * 0.45}px,${dy * 0.45}px) scale(1.025)`, boxShadow: "0 10px 24px rgba(20,26,46,.25)" },
                              { transform: "none", boxShadow: "0 0 0 rgba(20,26,46,0)" }
                          ]
                        : [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
                    { duration: me ? 360 : 280, easing: EASE }
                );
                an.onfinish = () => {
                    el.style.position = "";
                    el.style.zIndex = "";
                    el.style.background = "";
                    if (me) flash(headOf(el));
                };
            }
            const p = pillOf(el);
            if (p && o.n !== p.textContent)
                p.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)", backgroundColor: "var(--k-brand-soft)", color: "var(--k-brand-ink)" }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
        }
    });

    /** Cambia il menù (o, col resoconto aperto, la copia su cui lavora l'import). */
    const edit = (fn: (root: Section[]) => void, who: string | null = null, from: { k: string; x: number; y: number } | null = null) => {
        mark(who, from);
        if (done) setImp(x => (x?.phase === "done" ? (y => (fn(y.T), y))(structuredClone(x)) : x));
        else u(x => fn(x.sections));
    };
    const item = (k: number, fn: (it: Item) => void, moves = true) => {
        if (moves) mark();
        setImp(x => (x?.phase === "done" ? (y => (fn(y.items[k]), y))(structuredClone(x)) : x));
    };
    /** Togliere: prima sparisce, poi gli altri salgono. */
    const gone = (keys: string[], fn: (root: Section[]) => void) => {
        const els = still() ? [] : keyed().filter(el => keys.includes(el.dataset.k!));
        void Promise.all(els.map(el => el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 180, fill: "forwards" }).finished)).then(() => edit(fn));
    };

    /* ---------- trascinare: prima, dopo o dentro, detto in parole ---------- */
    const live = useRef({ root, edit, done: !!done });
    live.current = { root, edit, done: !!done };
    useEffect(() => {
        const box = rootRef.current;
        const ghost = ghostRef.current;
        const dline = dlineRef.current;
        if (!box || !ghost || !dline) return;
        type Over = { el: HTMLElement; no?: boolean; say: string; drop?: Drop; level?: number; line?: number | null; zone?: string };
        let drag: { kind: "sec" | "dish"; id: string; x: number; y: number; on: boolean; src: HTMLElement | null; over: Over | null } | null = null;
        let skip = false;
        const marks = [s.dropBefore, s.dropAfter, s.dropInside];
        const clear = () => {
            dline.hidden = true;
            box.querySelectorAll("." + marks.join(",.")).forEach(x => x.classList.remove(...marks));
        };
        const target = (x: number, y: number): Over | null => {
            if (!drag) return null;
            const R = live.current.root;
            const el = document.elementFromPoint(x, y) as HTMLElement | null;
            if (!el || !box.contains(el)) return null;
            const ts = el.closest<HTMLElement>("[data-dsec]");
            const td = el.closest<HTMLElement>("[data-ddish]");
            if (drag.kind === "dish") {
                if (td && td.dataset.ddish !== drag.id) {
                    const r = td.getBoundingClientRect();
                    const zone = (y - r.top) / r.height < 0.5 ? "before" : "after";
                    const d = findDish(R, td.dataset.ddish!);
                    return d && { el: td, zone, drop: { type: "dish", key: d.dish.key, zone }, say: (zone === "before" ? "Prima di " : "Dopo ") + d.dish.name };
                }
                const g = ts && findSec(R, ts.dataset.dsec!);
                return g && ts ? { el: ts, zone: "inside", drop: { type: "sec", key: g.sec.key, zone: "inside" }, say: "Dentro " + g.sec.name } : null;
            }
            const end = el.closest<HTMLElement>("[data-dend]");
            if (end) return { el: end, zone: "inside", drop: { type: "end" }, say: "In fondo al menù, fuori da tutto" };
            const me = findSec(R, drag.id)?.sec;
            const path = ts && pathOf(R, ts.dataset.dsec!);
            if (!ts || !me || !path) return null;
            const tree = ts.dataset.kind === "tr";
            const d = path.length - 1;
            const tgt = path[d];
            const self = tgt.key === me.key;
            if (!self && inside(me, tgt.key)) return { el: ts, no: true, say: "Non dentro sé stessa" };
            const r = ts.getBoundingClientRect();
            const rel = (y - r.top) / r.height;
            let zone: "before" | "after" | "inside" = rel < 0.28 ? "before" : rel > 0.72 ? "after" : "inside";
            let anchor = tgt;
            let lv = d;
            let out = 0;
            if (zone === "after" && tgt.subs.some(q => q !== me)) zone = "inside";
            if (tree && d > 0 && (self || zone === "after")) {
                // può uscire di un livello per ogni gruppo di cui è l'ultima
                let can = 0;
                for (let k = d; k > 0; k--) {
                    const l = path[k - 1].subs.filter(q => q !== me || q === path[k]);
                    if (l[l.length - 1] === path[k]) can++;
                    else break;
                }
                out = Math.min(can, Math.floor(Math.max(0, drag.x - x) / 22));
                if (out > 0) {
                    lv = d - out;
                    anchor = path[lv];
                    zone = "after";
                }
            }
            if (self && !out) return null;
            if (lv + (zone === "inside" ? 1 : 0) + height(me) > MAX_LEVEL) return { el: ts, no: true, say: "Più di tre livelli non si può" };
            return {
                el: ts,
                zone,
                level: lv,
                drop: { type: "sec", key: anchor.key, zone },
                line: tree && zone !== "inside" ? (zone === "before" ? r.top : r.bottom) : null,
                say: out ? `Fuori da ${anchor.name}, subito dopo` : zone === "inside" ? `Dentro ${tgt.name}: diventa sottocategoria` : (zone === "before" ? "Prima di " : "Dopo ") + tgt.name
            };
        };
        const down = (e: PointerEvent) => {
            const h = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
            if (!h || !box.contains(h) || e.button > 0 || (e.target as HTMLElement).closest("input,select")) return;
            drag = { kind: h.dataset.drag as "sec" | "dish", id: h.dataset.id!, x: e.clientX, y: e.clientY, on: false, src: h.closest<HTMLElement>("[data-lift]"), over: null };
        };
        const move = (e: PointerEvent) => {
            if (!drag) return;
            const R = live.current.root;
            if (!drag.on) {
                if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
                drag.on = true;
                box.classList.add(s.dragging);
                if (drag.kind === "sec") box.classList.add(s.dragsec);
                drag.src?.classList.add(s.lifted);
                ghost.hidden = false;
                window.getSelection()?.removeAllRanges();
            }
            e.preventDefault();
            clear();
            const nm = (drag.kind === "sec" ? findSec(R, drag.id)?.sec.name : findDish(R, drag.id)?.dish.name) ?? "";
            const o = (drag.over = target(e.clientX, e.clientY));
            ghost.style.left = e.clientX + "px";
            ghost.style.top = e.clientY + "px";
            ghost.className = cx(s.ghost, o?.no && s.ghostNo);
            ghost.textContent = o ? `${nm} → ${o.say}` : nm;
            if (o && !o.no) {
                const tr = o.el.closest<HTMLElement>("[data-tree]")?.getBoundingClientRect();
                if (o.line != null && tr) {
                    const lv = o.level ?? 0;
                    dline.hidden = false;
                    dline.style.left = tr.left + 12 + lv * 22 + "px";
                    dline.style.top = o.line - 1 + "px";
                    dline.style.width = tr.right - tr.left - 20 - lv * 22 + "px";
                } else o.el.classList.add(o.zone === "before" ? s.dropBefore : o.zone === "after" ? s.dropAfter : s.dropInside);
            }
        };
        const end = (e: PointerEvent) => {
            if (!drag) return;
            const d = drag;
            drag = null;
            if (!d.on) return;
            ghost.hidden = true;
            box.classList.remove(s.dragging, s.dragsec);
            d.src?.classList.remove(s.lifted);
            clear();
            skip = e.type === "pointerup";
            setTimeout(() => (skip = false), 0);
            const to = d.over && !d.over.no ? d.over.drop : null;
            if (e.type !== "pointerup" || !to) return;
            const from = { k: (d.kind === "sec" ? "t" : "d") + d.id, x: e.clientX, y: e.clientY };
            live.current.edit(R => (d.kind === "sec" ? dropSec(R, d.id, to) : dropDish(R, d.id, to)), d.id, from);
        };
        // dopo un trascinamento il clic che arriva sulla riga non la sceglie
        const click = (e: MouseEvent) => {
            if (!skip) return;
            skip = false;
            e.stopPropagation();
            e.preventDefault();
        };
        const noNative = (e: Event) => e.preventDefault();
        box.addEventListener("pointerdown", down);
        document.addEventListener("pointermove", move, { passive: false });
        document.addEventListener("pointerup", end);
        document.addEventListener("pointercancel", end);
        box.addEventListener("click", click, true);
        box.addEventListener("dragstart", noNative);
        return () => {
            box.removeEventListener("pointerdown", down);
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", end);
            document.removeEventListener("pointercancel", end);
            box.removeEventListener("click", click, true);
            box.removeEventListener("dragstart", noNative);
        };
    }, []);

    /* ---------- l'import: leggere, il resoconto, aggiungere ---------- */
    useEffect(() => () => run.current?.abort(), []);
    const impOpen = !!done;
    useEffect(() => {
        if (!!t.impOpen !== impOpen) u(x => void (x.impOpen = impOpen || undefined));
    }, [impOpen, t.impOpen, u]);
    // «Da una foto o un PDF» nel passo prima: qui si comincia dall'import
    const asked = useRef(false);
    useEffect(() => {
        if (asked.current || !onRead || t.edit || t.source !== "foto" || M.length) return;
        asked.current = true;
        setImp({ phase: "pick", error: null });
    }, [onRead, t.edit, t.source, M.length]);

    const read = async (picked: File[]) => {
        if (!onRead || !picked.length || run.current) return;
        const ctl = new AbortController();
        run.current = ctl;
        mark();
        setImp({ phase: "read", file: picked.length === 1 ? picked[0].name : `${picked.length} file` });
        const res = await onRead(picked, ctl.signal);
        run.current = null;
        if (!res) return;
        mark();
        if (!res.ok) return setImp({ phase: "pick", error: res.error });
        if (!res.items.length) return setImp({ phase: "pick", error: "Non ho trovato piatti in questo file: prova con una foto più nitida." });
        const T = structuredClone(M);
        const ghosts: string[] = [];
        const have = allDishes(M);
        const items = res.items.map((r): Item => {
            const dup = have.some(d => (r.productId ? d.productId === r.productId : false) || same(d.name, r.name));
            const st: St = dup ? "dup" : r.why ? "chk" : r.productId ? "lnk" : "new";
            const to = ensure(T, r.path, name => {
                const x: Section = { key: key(), name, dishes: [], subs: [] };
                ghosts.push(x.key);
                return x;
            }).key;
            return { ...r, st, on: st !== "dup", to, raw: r.price == null ? "" : String(r.price).replace(".", ",") };
        });
        setImp({ phase: "done", file: res.file, T, ghosts, items });
    };
    const dropImport = () => {
        run.current?.abort();
        run.current = null;
        mark();
        setImp(null);
    };
    const count = useMemo(() => {
        const c: Record<string, number> = {};
        for (const it of done?.items ?? []) if (it.on && it.st !== "dup") c[it.to] = (c[it.to] ?? 0) + 1;
        return c;
    }, [done]);
    const ghost = (x: Section) => !!done && done.ghosts.includes(x.key);
    const alive = (x: Section): boolean => !ghost(x) || !!count[x.key] || x.subs.some(alive);
    const applyImport = () => {
        if (!done) return;
        const T = structuredClone(done.T);
        const fresh: string[] = [];
        const prune = (l: Section[]) => {
            for (let k = l.length - 1; k >= 0; k--) {
                if (!alive(l[k])) l.splice(k, 1);
                else {
                    if (ghost(l[k])) fresh.push(l[k].key);
                    prune(l[k].subs);
                }
            }
        };
        prune(T);
        const dishes: string[] = [];
        for (const it of done.items) {
            if (!it.on || it.st === "dup") continue;
            const d: Dish = { key: key(), productId: it.productId, name: it.name, price: it.price, description: it.description, formats: it.formats, imp: true };
            findSec(T, it.to)?.sec.dishes.push(d);
            dishes.push(d.key);
        }
        mark();
        u(x => {
            x.sections = T;
            x.lastImport = { file: done.file, dishes, secs: fresh };
            x.impOpen = undefined;
        });
        setImp(null);
        setSel("all");
    };
    const undoImport = () => {
        mark();
        u(x => {
            const last = x.lastImport;
            if (!last) return;
            for (const k of last.dishes) {
                const r = findDish(x.sections, k);
                if (r) r.list.splice(r.k, 1);
            }
            for (const k of [...last.secs].reverse()) {
                const r = findSec(x.sections, k);
                if (r && !total(r.sec) && !r.sec.subs.length) r.list.splice(r.k, 1);
            }
            x.lastImport = null;
        });
    };
    const jumpTo = (st: string) => {
        const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(`[data-st="${st}"]`) ?? []);
        if (!rows.length) return;
        const n = (jump.current[st] = ((jump.current[st] ?? -1) + 1) % rows.length);
        rows[n].scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" });
        const [soft, line] = JUMP_COLOR[st];
        const on = { backgroundColor: `var(${soft})`, boxShadow: `inset 0 0 0 2px var(${line})`, borderRadius: "10px" };
        rows.forEach((r, k) => r.animate([on, { ...on, offset: 0.6 }, { backgroundColor: "transparent", boxShadow: "inset 0 0 0 2px transparent", borderRadius: "10px" }], { duration: k === n ? 2000 : 1100, delay: 200 }));
        const inp = rows[n].querySelector("input");
        if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 450);
    };

    /* ---------- i suggerimenti ---------- */
    const suggest = async (sec: Section, more: boolean, spin: SVGElement | null) => {
        if (!onSuggest) return;
        const cur = ai[sec.key];
        if (more && cur && (cur.page + 1) * 2 < cur.list.length) {
            mark();
            if (spin && !still()) spin.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 520, easing: EASE });
            return setAi(a => ({ ...a, [sec.key]: { ...cur, page: cur.page + 1 } }));
        }
        if (!more && cur?.list.length) return setAi(a => ({ ...a, [sec.key]: { ...cur, open: !cur.open } }));
        const turning = spin && !still() ? spin.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 700, iterations: Infinity }) : null;
        setAi(a => ({ ...a, [sec.key]: { open: true, loading: true, list: cur?.list ?? [], page: cur?.page ?? 0, error: false } }));
        const path = pathOf(M, sec.key) ?? [sec];
        const have = [...sec.dishes.map(d => d.name), ...(cur?.list ?? []).map(x => x.name)];
        const got = await onSuggest(pathName(path), have).catch(() => null);
        turning?.cancel();
        mark();
        setAi(a => {
            const was = a[sec.key]?.list ?? [];
            const add = (got ?? []).filter(x => !was.some(y => same(y.name, x.name)));
            const list = [...was, ...add];
            return { ...a, [sec.key]: { open: true, loading: false, list, page: more && add.length ? Math.ceil(was.length / 2) : 0, error: !got } };
        });
    };

    /* ---------- i pezzi ---------- */
    const np = (c: number, d: number) => (
        <span className={s.np} data-np>
            {c > 0 && (
                <span title="Categorie dentro">
                    <Folder size={12} aria-hidden />
                    {c}
                </span>
            )}
            <span title="Piatti dentro">
                <Utensils size={12} aria-hidden />
                {d}
            </span>
        </span>
    );
    const ib = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
        <button type="button" className={s.ib} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
            {icon}
        </button>
    );
    const addSec = (into: Section | null) => {
        const x: Section = { key: key(), name: into ? "Sottocategoria nuova" : "Categoria nuova", dishes: [], subs: [] };
        edit(R => void (into ? findSec(R, into.key)?.sec.subs : R)?.push(x));
        setRen("s" + x.key);
    };
    const commitName = (k: string, v: string) => {
        const n = v.trim();
        if (n) u(x => void (findSec(x.sections, k)!.sec.name = n));
        setRen(null);
    };
    const inline = (id: string, value: string, label: string, commit: (v: string) => void, num = false) => (
        <input
            className={cx(s.mini, num && s.num)}
            autoFocus
            defaultValue={value}
            aria-label={label}
            inputMode={num ? "decimal" : undefined}
            placeholder={num ? "Prezzo" : undefined}
            onFocus={e => e.target.select()}
            onBlur={e => ren === id && commit(e.target.value)}
            onKeyDown={e => {
                if (e.key === "Enter") commit(e.currentTarget.value);
                else if (e.key === "Escape") setRen(null);
            }}
        />
    );
    const setDish = (k: string, fn: (d: Dish) => void) => {
        u(x => {
            const r = findDish(x.sections, k);
            if (r) fn(r.dish);
        });
        setRen(null);
    };
    const toggleV = (k: string, on?: boolean) => {
        mark();
        setOpenV(v => {
            const n = new Set(v);
            if (on ?? !n.has(k)) n.add(k);
            else n.delete(k);
            return n;
        });
    };

    const dishRows = (sec: Section) =>
        sec.dishes.map((d, k) => {
            const mine = d.productId ? byId.get(d.productId) : null;
            const fixed = (mine?.formats ?? []).map(f => ({ name: f.name, price: null as number | null }));
            const vars = d.productId ? fixed : d.formats ?? [];
            const prices = vars.map(v => v.price).filter((v): v is number => v !== null);
            const open = openV.has(d.key);
            const free = !d.productId;
            return (
                <div key={d.key} data-k={"d" + d.key} data-kind="dishbox">
                    <div className={s.dish} data-ddish={d.key} data-lift>
                        <span className={s.grip} data-drag="dish" data-id={d.key}>
                            <GripVertical size={14} aria-hidden />
                        </span>
                        <span className={s.ico}>
                            <Utensils size={14} aria-hidden />
                        </span>
                        <span className={s.dname}>
                            {ren === "n" + d.key ? (
                                inline("n" + d.key, d.name, "Nome del piatto", v => setDish(d.key, x => void (v.trim() && (x.name = v.trim()))))
                            ) : free ? (
                                <button type="button" className={s.edit} title="Tocca per rinominare" onClick={() => setRen("n" + d.key)}>
                                    {d.name}
                                </button>
                            ) : (
                                d.name
                            )}
                            {d.imp && <span className={cx(s.tg, s.new)}>importato</span>}
                            {vars.length > 0 ? (
                                <button type="button" className={s.tag} aria-expanded={open} onClick={() => toggleV(d.key)}>
                                    {vars.length} {vars.length === 1 ? "variante" : "varianti"}
                                </button>
                            ) : (
                                free && (
                                    <button
                                        type="button"
                                        className={s.lk}
                                        onClick={() => {
                                            mark();
                                            u(x => void (findDish(x.sections, d.key)!.dish.formats = [{ name: "", price: d.price }]));
                                            toggleV(d.key, true);
                                            setRen("v" + d.key + "-0");
                                        }}
                                    >
                                        <Plus size={14} aria-hidden />
                                        Variante
                                    </button>
                                )
                            )}
                        </span>
                        {ren === "p" + d.key ? (
                            inline("p" + d.key, d.price === null ? "" : String(d.price).replace(".", ","), `Prezzo di ${d.name}`, v => setDish(d.key, x => void (x.price = parsePrice(v))), true)
                        ) : free && !vars.length ? (
                            <button type="button" className={cx(s.p, s.edit, d.price === null && s.missing)} title="Tocca per cambiare il prezzo" onClick={() => setRen("p" + d.key)}>
                                {d.price === null ? "Prezzo" : priceText(d.price)}
                            </button>
                        ) : (
                            <span className={s.p}>{prices.length ? "da " + priceText(Math.min(...prices)) : priceText(d.price)}</span>
                        )}
                        {ib(`Sposta su ${d.name}`, <ArrowUp size={14} aria-hidden />, () => edit(R => shift(findDish(R, d.key)!, -1), d.key), k === 0)}
                        {ib(`Sposta giù ${d.name}`, <ArrowDown size={14} aria-hidden />, () => edit(R => shift(findDish(R, d.key)!, 1), d.key), k === sec.dishes.length - 1)}
                        {ib(`Togli ${d.name}`, <X size={14} aria-hidden />, () =>
                            gone(["d" + d.key], R => {
                                const r = findDish(R, d.key);
                                if (r) r.list.splice(r.k, 1);
                            })
                        )}
                    </div>
                    {open &&
                        vars.map((v, vi) => (
                            <div className={s.var} key={vi} data-k={`v${d.key}-${vi}`} data-kind="var">
                                <span className={s.dname}>
                                    {free && ren === `v${d.key}-${vi}` ? (
                                        inline(`v${d.key}-${vi}`, v.name, "Nome della variante", val => setDish(d.key, x => void (x.formats![vi].name = val.trim())))
                                    ) : free ? (
                                        <button type="button" className={cx(s.edit, !v.name && s.missing)} onClick={() => setRen(`v${d.key}-${vi}`)}>
                                            {v.name || "Nome della variante"}
                                        </button>
                                    ) : (
                                        v.name
                                    )}
                                </span>
                                {free && ren === `w${d.key}-${vi}` ? (
                                    inline(`w${d.key}-${vi}`, v.price === null ? "" : String(v.price).replace(".", ","), "Prezzo della variante", val => setDish(d.key, x => void (x.formats![vi].price = parsePrice(val))), true)
                                ) : free ? (
                                    <button type="button" className={cx(s.p, s.edit, v.price === null && s.missing)} onClick={() => setRen(`w${d.key}-${vi}`)}>
                                        {v.price === null ? "Prezzo" : priceText(v.price)}
                                    </button>
                                ) : null}
                                {free &&
                                    ib("Togli la variante", <X size={14} aria-hidden />, () => {
                                        mark();
                                        u(x => {
                                            const f = findDish(x.sections, d.key)!.dish;
                                            f.formats!.splice(vi, 1);
                                            if (!f.formats!.length) f.formats = undefined;
                                        });
                                    })}
                            </div>
                        ))}
                    {open && free && (
                        <div className={s.var}>
                            <button
                                type="button"
                                className={s.lk}
                                onClick={() => {
                                    mark();
                                    u(x => void findDish(x.sections, d.key)!.dish.formats!.push({ name: "", price: null }));
                                    setRen(`v${d.key}-${vars.length}`);
                                }}
                            >
                                <Plus size={14} aria-hidden />
                                Aggiungi una variante
                            </button>
                        </div>
                    )}
                </div>
            );
        });

    const footer = (sec: Section) => {
        const a = ai[sec.key];
        const pool = (a?.list ?? []).filter(x => !sec.dishes.some(d => same(d.name, x.name)));
        const shown = pool.length ? [0, 1].map(k => pool[((a?.page ?? 0) * 2 + k) % pool.length]).filter((x, k, l) => l.indexOf(x) === k) : [];
        return (
            <>
                <div className={s.foot}>
                    <DishInput
                        pick={pick}
                        taken={taken}
                        label={`Piatto da aggiungere a ${sec.name}`}
                        onAdd={(p, name) => {
                            const d: Dish = { key: key(), productId: p?.id ?? null, name: p?.name ?? name, price: p?.listPrice ?? null };
                            edit(R => void findSec(R, sec.key)?.sec.dishes.push(d));
                            if (!p) setRen("p" + d.key);
                        }}
                    />
                    {onSuggest && (
                        <button type="button" className={s.lk} disabled={a?.loading} onClick={e => void suggest(sec, false, e.currentTarget.querySelector("svg"))}>
                            <Sparkles size={14} aria-hidden />
                            Suggerisci altri piatti
                        </button>
                    )}
                </div>
                {a?.open && (
                    <div className={s.sug} aria-live="polite">
                        {a.loading && !shown.length ? (
                            "Cerco piatti che starebbero bene qui…"
                        ) : a.error && !shown.length ? (
                            "Adesso non riesco a suggerirne: riprova fra poco."
                        ) : shown.length ? (
                            <>
                                {shown.map(x => (
                                    <button
                                        key={x.name}
                                        type="button"
                                        className={s.one}
                                        data-k={`g${sec.key}${x.name}`}
                                        data-kind="one"
                                        title={`Aggiungi a ${sec.name}`}
                                        onClick={() => edit(R => void findSec(R, sec.key)?.sec.dishes.push({ key: key(), productId: null, name: x.name, price: x.price }))}
                                    >
                                        <Plus size={14} aria-hidden />
                                        {x.name}
                                        {x.price !== null && ` · ${priceText(x.price)}`}
                                    </button>
                                ))}
                                <span className={s.grow} />
                                <button type="button" className={s.lk} title="Proponine altri" disabled={a.loading} onClick={e => void suggest(sec, true, e.currentTarget.querySelector("svg"))}>
                                    <RefreshCw size={14} aria-hidden />
                                    Altri
                                </button>
                            </>
                        ) : (
                            "Li hai presi tutti."
                        )}
                    </div>
                )}
            </>
        );
    };

    const sect = (sec: Section, list: readonly Section[], k: number, depth: number, sub: boolean): ReactNode => {
        const path = pathOf(M, sec.key) ?? [sec];
        return (
            <div key={sec.key} className={cx(s.sect, sub && s.sub, k === list.length - 1 && s.last)} data-k={"s" + sec.key} data-kind="sect">
                <div className={s.sectH} data-dsec={sec.key} data-head data-lift>
                    <span className={s.grip} data-drag="sec" data-id={sec.key}>
                        <GripVertical size={14} aria-hidden />
                    </span>
                    <span className={s.ico}>
                        <Folder size={14} aria-hidden />
                    </span>
                    {ren === "s" + sec.key ? (
                        inline("s" + sec.key, sec.name, "Nome della categoria", v => commitName(sec.key, v))
                    ) : (
                        <button type="button" className={s.nm} title="Tocca per rinominare" onClick={() => setRen("s" + sec.key)}>
                            {sec.name}
                        </button>
                    )}
                    {np(cats(sec), total(sec))}
                    <span className={s.grow} />
                    {path.length > 1 && ib(`Porta fuori da ${path[path.length - 2].name}`, <ArrowLeftToLine size={14} aria-hidden />, () => edit(R => moveOut(R, sec.key), sec.key))}
                    {depth < MAX_LEVEL && (
                        <button type="button" className={s.lk} onClick={() => addSec(sec)}>
                            <Plus size={14} aria-hidden />
                            Sottocategoria
                        </button>
                    )}
                    {ib(`Sposta su ${sec.name}`, <ArrowUp size={14} aria-hidden />, () => edit(R => shift(findSec(R, sec.key)!, -1), sec.key), k === 0)}
                    {ib(`Sposta giù ${sec.name}`, <ArrowDown size={14} aria-hidden />, () => edit(R => shift(findSec(R, sec.key)!, 1), sec.key), k === list.length - 1)}
                    {ib(`Togli la categoria ${sec.name}`, <X size={14} aria-hidden />, () =>
                        gone(["t" + sec.key, "s" + sec.key], R => {
                            const r = findSec(R, sec.key);
                            if (r) r.list.splice(r.k, 1);
                        })
                    )}
                </div>
                {dishRows(sec)}
                {!(sec.subs.length && !sec.dishes.length) && footer(sec)}
                {sec.subs.map((x, j) => sect(x, sec.subs, j, depth + 1, true))}
            </div>
        );
    };

    /* ---------- a sinistra: l'albero ---------- */
    const wire = (d: number, last: boolean, trail: boolean[]) => (
        <>
            {trail.map((on, j) => j >= 1 && j < d && on && <span key={j} className={cx(s.wr, s.th)} style={{ left: (j - 1) * 22 + 15 }} />)}
            {d > 0 && <span className={cx(s.wr, s.el)} style={{ left: (d - 1) * 22 + 15 }} />}
            {d > 0 && !last && <span className={cx(s.wr, s.dn)} style={{ left: (d - 1) * 22 + 15 }} />}
        </>
    );
    const row = (x: Section, d: number, last: boolean, trail: boolean[]): ReactNode => {
        const g = ghost(x);
        const kids = x.subs.filter(alive);
        return [
            <button
                key={x.key}
                type="button"
                className={cx(s.tr, s.t2, g && s.ghostrow)}
                style={{ paddingLeft: 8 + d * 22 }}
                data-k={"t" + x.key}
                data-kind="tr"
                data-lift
                {...(imp ? (done ? { "data-dsec": x.key, ...(g ? { "data-drag": "sec", "data-id": x.key } : {}) } : {}) : { "data-dsec": x.key, "data-drag": "sec", "data-id": x.key })}
                aria-pressed={!imp && x.key === sel}
                onClick={
                    imp
                        ? undefined
                        : () => {
                              mark();
                              setSel(x.key);
                          }
                }
            >
                {wire(d, last, trail)}
                <span className={s.grip}>{(!imp || g) && <GripVertical size={14} aria-hidden />}</span>
                <span className={s.ico}>
                    <Folder size={14} aria-hidden />
                </span>
                <b>{x.name}</b>
                {count[x.key] ? <span className={s.plus}>+{count[x.key]}</span> : null}
                {!g && np(cats(x), total(x))}
            </button>,
            ...kids.map((y, j) => row(y, d + 1, j === kids.length - 1, [...trail, !last]))
        ];
    };
    const plusAll = done ? done.items.filter(x => x.on && x.st !== "dup").length : 0;
    const left = (
        <div className={cx(s.tree, imp && s.dim)} data-tree>
            <button
                type="button"
                className={s.tr}
                aria-pressed={sel === "all" || !!imp}
                onClick={
                    imp
                        ? undefined
                        : () => {
                              mark();
                              setSel("all");
                          }
                }
            >
                <b>Tutto il menù</b>
                {plusAll > 0 && <span className={s.plus}>+{plusAll}</span>}
                {np(catsOf(M), totalOf(M))}
            </button>
            {root.filter(alive).map(x => row(x, 0, true, []))}
            {(!imp || done) && (
                <div className={s.endzone} data-dend>
                    In fondo al menù, fuori da tutto
                </div>
            )}
            {!imp && (
                <button type="button" className={s.lk} onClick={() => addSec(null)}>
                    <Plus size={14} aria-hidden />
                    Categoria
                </button>
            )}
            {done ? (
                <p className={cx(s.note, s.treeNote)}>In verde: dove finiscono i piatti del file. Le righe tratteggiate sono categorie che nascono con l'import: trascinale dove le vuoi, anche dentro un'altra.</p>
            ) : (
                !imp && <p className={cx(s.note, s.treeNote)}>Trascina una riga per spostarla: prima, dopo o dentro un'altra. Verso sinistra esce dalla sua categoria.</p>
            )}
        </div>
    );

    /* ---------- a destra: il resoconto dell'import ---------- */
    const report = () => {
        if (!done) return null;
        const it = done.items.map((x, k) => [x, k] as const);
        const c = (st: St) => done.items.filter(x => x.st === st).length;
        const inn = done.items.filter(x => x.st !== "dup");
        const on = inn.filter(x => x.on).length;
        const miss = inn.filter(need).length;
        const nodes = allSecs(done.T).map(({ sec, path }) => ({ sec, name: pathName(path) }));
        const nameOf = (k: string) => nodes.find(n => n.sec.key === k)?.name ?? "";
        const pill = (st: St, text: string) =>
            c(st) > 0 && (
                <button type="button" className={cx(s.stat, st === "new" && s.new, st === "lnk" && s.lnk, st === "chk" && s.chk)} title="Portami lì" onClick={() => jumpTo(st)}>
                    {c(st)} {text}
                    <ArrowDown size={11} strokeWidth={2.4} aria-hidden />
                </button>
            );
        const price = (x: Item, k: number, id: string) => (
            <span>
                <input
                    id={id}
                    inputMode="decimal"
                    placeholder="Prezzo"
                    value={x.raw}
                    className={need(x) ? s.need : undefined}
                    aria-label={`Prezzo di ${x.name}`}
                    onChange={e => {
                        const raw = e.target.value;
                        item(k, y => Object.assign(y, { raw, price: parsePrice(raw) }), false);
                    }}
                />{" "}
                €
            </span>
        );
        const todo = it.filter(([x]) => x.st === "chk" && x.on);
        const dups = it.filter(([x]) => x.st === "dup");
        let hint = 0;
        return (
            <div className={s.card}>
                <div className={s.sh}>
                    <b>
                        Nel file «{done.file}» ho trovato {done.items.length} {done.items.length === 1 ? "piatto" : "piatti"}
                    </b>
                    <span>{c("dup") ? `${inn.length} ${inn.length === 1 ? "entra" : "entrano"} nel menù, ${c("dup")} ${c("dup") === 1 ? "lo" : "li"} hai già.` : "Entrano tutti nel menù."}</span>
                </div>
                <div className={s.explain}>
                    <Upload size={16} aria-hidden />
                    <span>
                        <b>Qui sotto c'è solo quello che ho letto nel file</b>, non tutto il tuo menù. Il menù è a sinistra: non cambia finché non tocchi «Aggiungi», e i «+» in verde dicono dove finirà ogni piatto.
                    </span>
                </div>
                <div className={s.stats}>
                    {pill("new", "nuovi")}
                    {pill("lnk", "già fra i vostri prodotti")}
                    {pill("chk", "da controllare")}
                    {pill("dup", c("dup") === 1 ? "lo hai già: non entra" : "li hai già: non entrano")}
                    <span className={s.note}>Tocca una pillola: ti porto lì e te li accendo.</span>
                </div>
                {nodes.map(({ sec, name }) => {
                    const rows = it.filter(([x]) => x.st !== "dup" && x.to === sec.key);
                    if (!rows.length) return null;
                    const g = ghost(sec);
                    return (
                        <div className={s.rg} key={sec.key}>
                            <div className={s.rgH}>
                                <span className={s.ico}>
                                    <Folder size={14} aria-hidden />
                                </span>
                                {name}
                                {g && <span className={cx(s.tg, s.new)}>categoria nuova</span>}
                                {g && !hint++ && <span className={s.note}>trascinala nell'albero per metterla dove vuoi</span>}
                            </div>
                            {rows.map(([x, k]) => (
                                <div className={cx(s.ri, !x.on && s.off)} key={x.key} data-st={x.st}>
                                    <button type="button" className={s.ck} aria-pressed={x.on} aria-label={`Aggiungi ${x.name}`} onClick={() => item(k, y => void (y.on = !y.on))}>
                                        {x.on && <Check size={13} strokeWidth={2.6} aria-hidden />}
                                    </button>
                                    <span className={s.rn}>{x.name}</span>
                                    {x.st === "chk" && !x.formats?.length ? price(x, k, "imp-p-" + k) : <span className={cx(s.rp, s.p)}>{x.formats?.length && x.price !== null ? "da " : ""}{priceText(x.price)}</span>}
                                    <span className={s.sub2}>
                                        <span className={cx(s.tg, s[x.st])}>
                                            {ST_LABEL[x.st as Exclude<St, "dup">]}
                                            {x.st === "chk" && x.why ? `: ${x.why}` : ""}
                                        </span>
                                        <span>va in</span>
                                        <select aria-label={`Categoria di ${x.name}`} value={x.to} onChange={e => item(k, y => void (y.to = e.target.value))}>
                                            {nodes.map(o => (
                                                <option key={o.sec.key} value={o.sec.key}>
                                                    {o.name}
                                                </option>
                                            ))}
                                        </select>
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })}
                {(todo.length > 0 || dups.length > 0) && (
                    <div className={s.fin}>
                        <div className={s.sh}>
                            <b>Prima di aggiungere</b>
                            <span>
                                {miss ? `${miss === 1 ? "Manca 1 prezzo: scrivilo" : `Mancano ${miss} prezzi: scrivili`} qui, senza risalire.` : "Non manca niente: puoi aggiungere."}
                                {dups.length > 0 && " Sotto, i piatti che hai già."}
                            </span>
                        </div>
                        {todo.length > 0 && (
                            <div className={cx(s.rg, s.chkb)}>
                                <div className={s.rgH}>
                                    Da controllare · {todo.length}
                                    {miss < todo.length && <span className={cx(s.tg, s.new)}>{todo.length - miss} a posto</span>}
                                </div>
                                {todo.map(([x, k]) => (
                                    <div className={s.ri} key={x.key} data-st="todo">
                                        <span className={s.ico}>{need(x) ? <Utensils size={14} aria-hidden /> : <Check size={14} aria-hidden />}</span>
                                        <span className={s.rn}>{x.name}</span>
                                        {x.formats?.length ? <span className={cx(s.rp, s.p)}>{priceText(x.price)}</span> : price(x, k, "imp-q-" + k)}
                                        <span className={s.sub2}>
                                            <span className={cx(s.tg, need(x) ? s.chk : s.new)}>{need(x) ? x.why ?? "manca il prezzo" : "a posto"}</span>
                                            <span>va in {nameOf(x.to)}</span>
                                            <button type="button" className={s.lk} onClick={() => item(k, y => void (y.on = false))}>
                                                Non aggiungerlo
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {dups.length > 0 && (
                            <div className={cx(s.rg, s.dupb)}>
                                <div className={s.rgH}>Li hai già in questo menù · {dups.length}</div>
                                <div className={s.rgN}>Erano nel file, ma nel tuo menù ci sono già con lo stesso nome. Non li aggiungo una seconda volta e non li tocco: restano come sono.</div>
                                {dups.map(([x, k]) => (
                                    <div className={s.ri} key={x.key} data-st="dup">
                                        <span className={s.ico}>
                                            <Utensils size={14} aria-hidden />
                                        </span>
                                        <span className={s.rn}>{x.name}</span>
                                        <span className={cx(s.rp, s.p)}>{priceText(x.price)}</span>
                                        <span className={s.sub2}>
                                            <span>è già in {nameOf(x.to)}</span>
                                            <button type="button" className={s.lk} onClick={() => item(k, y => Object.assign(y, { st: y.why ? "chk" : y.productId ? "lnk" : "new", on: true }))}>
                                                Aggiungilo lo stesso
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className={s.repf}>
                    {miss > 0 && (
                        <button type="button" className={cx(s.lk, s.why)} onClick={() => jumpTo("todo")}>
                            {miss === 1 ? "Manca 1 prezzo" : `Mancano ${miss} prezzi`}: portami lì
                        </button>
                    )}
                    <button type="button" className={s.btn} onClick={dropImport}>
                        Butta via
                    </button>
                    <button type="button" className={cx(s.btn, s.pri)} disabled={miss > 0 || !on} onClick={applyImport}>
                        Aggiungi {on} {on === 1 ? "piatto" : "piatti"} al menù
                    </button>
                </div>
            </div>
        );
    };

    const selAt = sel === "all" || imp ? null : findSec(M, sel);
    const importBtn = (pri: boolean) =>
        onRead && (
            <button
                type="button"
                className={cx(s.btn, pri && s.pri)}
                onClick={() => {
                    mark();
                    setImp({ phase: "pick", error: null });
                }}
            >
                <Upload size={14} aria-hidden />
                Importa da foto o PDF
            </button>
        );
    let right: ReactNode;
    if (imp?.phase === "pick")
        right = (
            <div className={s.card}>
                <div className={s.sh}>
                    <b>Importa da foto o PDF</b>
                    <span>Fino a {MAX_IMPORT_FILES} file. Leggo categorie, piatti e prezzi; poi li controlli qui, prima che entrino.</span>
                </div>
                <div
                    className={cx(s.dropz, over && s.over)}
                    onDragOver={e => {
                        e.preventDefault();
                        setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={e => {
                        e.preventDefault();
                        setOver(false);
                        void read(Array.from(e.dataTransfer.files));
                    }}
                >
                    <Upload size={26} strokeWidth={1.6} aria-hidden />
                    <span>Trascina qui la foto o il PDF del menù</span>
                    <button type="button" className={cx(s.btn, s.pri)} onClick={() => fileRef.current?.click()}>
                        Scegli i file
                    </button>
                </div>
                {imp.error && (
                    <div className={s.alert} role="alert">
                        <TriangleAlert size={16} aria-hidden />
                        <span>{imp.error}</span>
                    </div>
                )}
                <div className={s.repf}>
                    <button type="button" className={s.btn} onClick={dropImport}>
                        Annulla
                    </button>
                </div>
            </div>
        );
    else if (imp?.phase === "read")
        right = (
            <div className={s.card}>
                <div className={s.sh} aria-live="polite">
                    <b>Sto leggendo «{imp.file}»</b>
                    <span>Leggo categorie, piatti e prezzi, e cerco quelli che avete già…</span>
                </div>
                <div className={s.bar}>
                    <i />
                </div>
                <span className={s.note}>Di solito ci vuole meno di un minuto. Il menù non cambia finché non dici sì al resoconto.</span>
                <div className={s.repf}>
                    <button type="button" className={s.btn} onClick={dropImport}>
                        Annulla
                    </button>
                </div>
            </div>
        );
    else if (done) right = report();
    else
        right = (
            <>
                {t.lastImport && (
                    <div className={s.banner}>
                        <Check size={16} strokeWidth={2.4} aria-hidden />
                        <span>
                            <b>
                                {t.lastImport.dishes.length} {t.lastImport.dishes.length === 1 ? "piatto aggiunto" : "piatti aggiunti"} da «{t.lastImport.file}».
                            </b>{" "}
                            Li scriviamo quando salvi.
                        </span>
                        <span className={s.grow} />
                        <button type="button" className={s.lk} onClick={undoImport}>
                            Annulla l'import
                        </button>
                    </div>
                )}
                {selAt ? (
                    sect(selAt.sec, selAt.list, selAt.k, (pathOf(M, selAt.sec.key) ?? [selAt.sec]).length, false)
                ) : M.length ? (
                    M.map((x, k) => sect(x, M, k, 1, false))
                ) : (
                    <div className={s.card}>
                        <div className={s.sh}>
                            <b>Il menù è vuoto</b>
                            <span>{onRead ? "Parti da una foto o da un PDF, oppure scrivi tu la prima categoria." : "Scrivi tu la prima categoria."}</span>
                        </div>
                        <div className={cx(s.repf, s.start)}>
                            {importBtn(true)}
                            <button type="button" className={s.btn} onClick={() => addSec(null)}>
                                <Plus size={14} aria-hidden />
                                Aggiungi una categoria
                            </button>
                        </div>
                    </div>
                )}
            </>
        );

    return (
        <div className={s.b2} ref={rootRef} data-menu-cat="">
            <div className={s.shrow}>
                <div className={s.sh}>
                    <h3>Categorie e piatti</h3>
                    <span>{imp ? "L'import è aperto: il menù resta com'è finché non aggiungi." : selAt ? `Stai guardando solo «${selAt.sec.name}». Tocca «Tutto il menù» per rivederlo intero.` : "Tutto il menù, nell'ordine in cui lo vede il cliente."}</span>
                </div>
                {!imp && M.length > 0 && importBtn(false)}
            </div>
            <div className={s.two}>
                {left}
                <div className={s.right}>{right}</div>
            </div>
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
                    void read(files);
                }}
            />
            <div ref={ghostRef} className={s.ghost} hidden />
            <div ref={dlineRef} className={s.dline} hidden />
        </div>
    );
}
