import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Store } from "lucide-react";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { ACTIVITY_SEARCH_THRESHOLD, filterActivityOptions } from "@/components/ui/ActivityMultiSelect/activityFilter";
import s from "./SediPannello.module.scss";

export type PannelloSede = { id: string; name: string };
export type PannelloGruppo = { id: string; name: string; sedeIds: readonly string[] };
/** Una scelta sola: tutte le sedi, una sede o un gruppo («Cosa guardi»). */
export type SedeScelta = { kind: "all" } | { kind: "sede"; id: string } | { kind: "gruppo"; id: string };

type Common = {
    sedi: readonly PannelloSede[];
    /** Con almeno un gruppo il pannello ha le tab «Sedi · N» e «Gruppi · N». */
    gruppi?: readonly PannelloGruppo[];
    /** Accanto al nome della sede, a destra: «diversa · 3 g», «Sospesa». Lo decide chi usa il pannello. */
    tag?: (id: string) => ReactNode;
    /** In cima: «Cosa guardi», «Confronta con». */
    title?: string;
};
export type SediMoltiProps = Common & {
    mode?: "many";
    value: readonly string[];
    onChange: (ids: string[]) => void;
    /** Quante sedi restano scelte almeno. */
    min?: number;
    /** La casella in cima: «Tutte le sedi», «Tutte le altre sedi». */
    allLabel?: string;
    /** Tutte prese vuol dire anche quelle che si aggiungeranno (le regole, D128): lo dice il fondo. */
    future?: boolean;
};
export type SediUnaProps = Common & {
    mode: "one";
    value: SedeScelta;
    onChange: (v: SedeScelta) => void;
    /** «Tutte le sedi» come prima scelta della tab Sedi. */
    allowAll?: boolean;
};
export type SediPannelloProps = SediMoltiProps | SediUnaProps;

type Stato = "on" | "off" | "mixed";
const ARIA = { on: true, off: false, mixed: "mixed" } as const;

function Box({ st, radio }: { st: Stato; radio?: boolean }) {
    return (
        <span className={s.box} data-radio={radio || undefined} data-st={st}>
            {st === "on" && !radio && <Check size={11} strokeWidth={3} aria-hidden />}
        </span>
    );
}

/**
 * Il pannello delle sedi (D128, D151): ricerca sopra le 8 sedi, tab Sedi · Gruppi
 * quando ci sono gruppi, una casella «Tutte» col trattino quando è presa a metà,
 * «solo questa». Con `mode: "one"` gli stessi pezzi coi radio.
 */
export function SediPannello(p: SediPannelloProps) {
    const { sedi, gruppi = [], tag, title } = p;
    const one = p.mode === "one";
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<"sedi" | "gruppi">(() => (p.mode === "one" && p.value.kind === "gruppo" ? "gruppi" : "sedi"));
    const listId = useId();
    const known = new Set(sedi.map(x => x.id));
    const groups = gruppi.map(g => ({ ...g, sedeIds: g.sedeIds.filter(id => known.has(id)) })).filter(g => g.sedeIds.length);
    const shown = groups.length ? tab : "sedi";
    const q = query.trim();
    const list = filterActivityOptions([...sedi], query);
    const glist = filterActivityOptions(groups, query);
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

    let rows: ReactNode;
    let foot: ReactNode;
    if (p.mode === "one") {
        const v = p.value;
        const radio = (key: string, on: boolean, pick: SedeScelta, body: ReactNode, master = false) => (
            <div key={key} className={s.row} data-master={master || undefined}>
                <button type="button" className={s.pick} role="radio" aria-checked={on} onClick={() => p.onChange(pick)}>
                    <Box st={on ? "on" : "off"} radio />
                    {body}
                </button>
            </div>
        );
        rows =
            shown === "sedi" ? (
                <>
                    {p.allowAll && !q && radio("*", v.kind === "all", { kind: "all" }, <><span className={s.nm}>Tutte le sedi</span><span className={s.cnt}>{sedi.length}</span></>, true)}
                    {list.map(x => radio(x.id, v.kind === "sede" && v.id === x.id, { kind: "sede", id: x.id }, <><span className={s.nm}>{x.name}</span>{tag && <span className={s.tag}>{tag(x.id)}</span>}</>))}
                </>
            ) : (
                glist.map(g => radio(g.id, v.kind === "gruppo" && v.id === g.id, { kind: "gruppo", id: g.id }, <><span className={s.nm}>{g.name}</span><span className={s.cnt}>{n(g.sedeIds.length, "sede", "sedi")}</span></>))
            );
        foot = v.kind === "all" ? "Tutte le sedi" : v.kind === "sede" ? sedi.find(x => x.id === v.id)?.name : groups.find(g => g.id === v.id)?.name;
    } else {
        const { value, onChange, min = 0, allLabel = "Tutte le sedi", future } = p;
        const pick = new Set(value);
        const set = (next: Set<string>) => {
            if (next.size >= min) onChange(sedi.filter(x => next.has(x.id)).map(x => x.id));
        };
        const state = (ids: readonly string[]): Stato => {
            const k = ids.filter(x => pick.has(x)).length;
            return k === 0 ? "off" : k === ids.length ? "on" : "mixed";
        };
        const flip = (ids: readonly string[]) => {
            const next = new Set(pick);
            if (state(ids) === "on") ids.forEach(x => next.delete(x));
            else ids.forEach(x => next.add(x));
            set(next);
        };
        const all = sedi.map(x => x.id);
        const allSt = state(all);
        const only = (ids: readonly string[], label: string) =>
            sedi.length > 2 && (
                <button type="button" className={s.only} aria-label={`Solo ${label}`} onClick={() => set(new Set(ids))}>
                    {ids.length === 1 && shown === "sedi" ? "solo questa" : "solo questo"}
                </button>
            );
        rows =
            shown === "sedi" ? (
                <>
                    {sedi.length > 2 && !q && (
                        <div className={s.row} data-master>
                            <button
                                type="button"
                                className={s.pick}
                                role="checkbox"
                                aria-checked={ARIA[allSt]}
                                onClick={() => (allSt === "on" ? set(new Set(all.slice(0, min))) : set(new Set(all)))}
                            >
                                <Box st={allSt} />
                                <span className={s.nm}>{allLabel}</span>
                                <span className={s.cnt}>{sedi.length}</span>
                            </button>
                        </div>
                    )}
                    {list.map(x => {
                        const on = pick.has(x.id);
                        return (
                            <div key={x.id} className={s.row}>
                                <button type="button" className={s.pick} role="checkbox" aria-checked={on} onClick={() => flip([x.id])}>
                                    <Box st={on ? "on" : "off"} />
                                    <span className={s.nm}>{x.name}</span>
                                    {tag && <span className={s.tag}>{tag(x.id)}</span>}
                                </button>
                                {only([x.id], x.name)}
                            </div>
                        );
                    })}
                </>
            ) : (
                glist.map(g => {
                    const st = state(g.sedeIds);
                    const k = g.sedeIds.filter(x => pick.has(x)).length;
                    return (
                        <div key={g.id} className={s.row}>
                            <button type="button" className={s.pick} role="checkbox" aria-checked={ARIA[st]} onClick={() => flip(g.sedeIds)}>
                                <Box st={st} />
                                <span className={s.nm}>{g.name}</span>
                                <span className={s.cnt}>{st === "mixed" ? `${k} di ${g.sedeIds.length}` : n(g.sedeIds.length, "sede", "sedi")}</span>
                            </button>
                            {only(g.sedeIds, g.name)}
                        </div>
                    );
                })
            );
        foot = future && allSt === "on" ? "Tutte, anche quelle che aggiungerai" : `${pick.size} di ${sedi.length} scelte`;
    }
    const empty = shown === "sedi" ? !list.length : !glist.length;

    return (
        <div className={s.panel}>
            {title && <div className={s.title}>{title}</div>}
            {groups.length > 0 && (
                <div className={s.tabs} role="tablist" aria-label="Sedi o gruppi">
                    {(["sedi", "gruppi"] as const).map(t => (
                        <button key={t} type="button" role="tab" aria-selected={shown === t} aria-controls={listId} onClick={() => setTab(t)}>
                            {t === "sedi" ? `Sedi · ${sedi.length}` : `Gruppi · ${groups.length}`}
                        </button>
                    ))}
                </div>
            )}
            {sedi.length > ACTIVITY_SEARCH_THRESHOLD && (
                <SearchInput
                    aria-label={shown === "sedi" ? "Cerca una sede" : "Cerca un gruppo"}
                    placeholder={shown === "sedi" ? "Cerca una sede" : "Cerca un gruppo"}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onClear={() => setQuery("")}
                />
            )}
            <div id={listId} className={s.lst} role={one ? "radiogroup" : "group"} aria-label={shown === "sedi" ? "Sedi" : "Gruppi"}>
                {rows}
                {empty && <p className={s.none}>Niente con «{q}».</p>}
            </div>
            {foot && <div className={s.ft}>{foot}</div>}
        </div>
    );
}

/** «Trattoria centro +1», «Tutte le sedi · 30», «Milano · 12». */
function summary(p: SediPannelloProps): string {
    const { sedi, gruppi = [] } = p;
    if (p.mode === "one") {
        const v = p.value;
        if (v.kind === "all") return `Tutte le sedi · ${sedi.length}`;
        if (v.kind === "sede") return sedi.find(x => x.id === v.id)?.name ?? "Sede";
        const g = gruppi.find(x => x.id === v.id);
        return g ? `${g.name} · ${g.sedeIds.filter(id => sedi.some(x => x.id === id)).length}` : "Gruppo";
    }
    const on = sedi.filter(x => p.value.includes(x.id));
    if (sedi.length > 1 && on.length === sedi.length) return `Tutte le sedi · ${sedi.length}`;
    if (!on.length) return "Nessuna sede";
    return on[0].name + (on.length > 1 ? ` +${on.length - 1}` : "");
}

/** Con una scelta sola il pannello si chiude scegliendo. */
function oneCloses(p: SediPannelloProps, close: () => void): SediPannelloProps {
    if (p.mode !== "one") return p;
    const pick = p.onChange;
    const one: SediUnaProps = {
        ...p,
        onChange: (v: SedeScelta) => {
            pick(v);
            close();
        }
    };
    return one;
}

export type SediBottoneProps = SediPannelloProps & {
    /** «below»: sotto il bottone; «side»: a fianco, se c'è posto. */
    place?: "below" | "side";
    className?: string;
    /** Senza, il bottone dice cosa è scelto. */
    children?: ReactNode;
};

const W = 330;
// fuori dalla finestra finché non si sa dove va: si vede già, e prende il fuoco
const AWAY: CSSProperties = { left: -9999, top: 0 };
const GAP = 8;

/** Un bottone che apre il pannello delle sedi sopra la pagina. Con una scelta sola si chiude scegliendo. */
export function SediBottone(props: SediBottoneProps) {
    const { place = "below", className, children } = props;
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<CSSProperties>(AWAY);
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const id = useId();

    // si mette dove c'è posto: a fianco o sotto, dentro la finestra
    useLayoutEffect(() => {
        if (!open) return;
        const put = () => {
            const b = btnRef.current?.getBoundingClientRect();
            const h = popRef.current?.offsetHeight ?? 0;
            if (!b) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const side = place === "side" && b.right + GAP + W <= vw - 16;
            let left = side ? b.right + GAP : b.left;
            let top = side ? b.top : b.bottom + 6;
            left = Math.max(16, Math.min(left, vw - W - 16));
            if (top + h > vh - 12) top = side ? Math.max(12, vh - 12 - h) : Math.max(12, b.top - 6 - h);
            setPos({ left, top });
        };
        put();
        let raf = 0;
        const later = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(put);
        };
        window.addEventListener("scroll", later, true);
        window.addEventListener("resize", later);
        const ro = new ResizeObserver(later);
        if (popRef.current) ro.observe(popRef.current);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("scroll", later, true);
            window.removeEventListener("resize", later);
            ro.disconnect();
        };
    }, [open, place]);

    // si chiude cliccando fuori o con Esc, e il fuoco torna al bottone
    useEffect(() => {
        if (!open) return;
        const off = (ev: MouseEvent) => {
            const t = ev.target as Node;
            if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
        };
        const esc = (ev: KeyboardEvent) => {
            if (ev.key !== "Escape") return;
            setOpen(false);
            btnRef.current?.focus();
        };
        document.addEventListener("mousedown", off);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", off);
            document.removeEventListener("keydown", esc);
        };
    }, [open]);

    // aperto, il fuoco va sulla ricerca o sulla prima scelta
    useEffect(() => {
        if (!open) return setPos(AWAY);
        popRef.current?.querySelector<HTMLElement>("input, [role=checkbox], [role=radio]")?.focus({ preventScroll: true });
    }, [open]);

    const panel = oneCloses(props, () => {
        setOpen(false);
        btnRef.current?.focus();
    });

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`${s.btn} ${className ?? ""}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={() => setOpen(o => !o)}
            >
                <Store size={15} aria-hidden />
                <span className={s.nm}>{children ?? summary(props)}</span>
                <ChevronDown size={14} aria-hidden />
            </button>
            {open &&
                createPortal(
                    <div ref={popRef} id={id} className={s.pop} role="dialog" aria-label={props.title ?? "Sedi"} style={pos}>
                        <SediPannello {...panel} />
                    </div>,
                    document.body
                )}
        </>
    );
}
