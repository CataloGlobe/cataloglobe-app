import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Store } from "lucide-react";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { ACTIVITY_SEARCH_THRESHOLD, filterActivityOptions } from "@/components/ui/ActivityMultiSelect/activityFilter";
import s from "./CalendarioView.module.scss";

export type SceltaSede = { id: string; name: string };
export type SceltaGruppo = { id: string; name: string; activityIds: readonly string[] };

type PannelloProps = {
    sedi: readonly SceltaSede[];
    groups: readonly SceltaGruppo[];
    value: readonly string[];
    onChange: (ids: string[]) => void;
    /** Quante sedi restano scelte almeno: nel calendario una. */
    min?: number;
};

/** «Trattoria centro +1», «Tutte le sedi · 30». */
function sediSummary(sedi: readonly SceltaSede[], value: readonly string[]): string {
    const on = sedi.filter(x => value.includes(x.id));
    if (sedi.length > 1 && on.length === sedi.length) return `Tutte le sedi · ${sedi.length}`;
    if (!on.length) return "Nessuna sede";
    return on[0].name + (on.length > 1 ? ` +${on.length - 1}` : "");
}

/**
 * Il pannello delle sedi (D128 A, D129 3): ricerca sopra le 8 sedi, «Tutte»,
 * i gruppi, una casella per sede e «solo questa». Con 30 sedi come con 2.
 */
function SediPannello({ sedi, groups, value, onChange, min = 0 }: PannelloProps) {
    const [query, setQuery] = useState("");
    const big = sedi.length > ACTIVITY_SEARCH_THRESHOLD;
    const list = filterActivityOptions([...sedi], query);
    const order = (ids: readonly string[]) => sedi.filter(x => ids.includes(x.id)).map(x => x.id);
    const toggle = (id: string) => {
        if (value.includes(id)) {
            if (value.length > min) onChange(value.filter(x => x !== id));
        } else onChange(order([...value, id]));
    };
    const same = (ids: readonly string[]) => ids.length === value.length && ids.every(x => value.includes(x));
    const allIds = sedi.map(x => x.id);

    return (
        <>
            {big && (
                <SearchInput
                    aria-label="Cerca una sede"
                    placeholder="Cerca una sede"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onClear={() => setQuery("")}
                />
            )}
            {(sedi.length > 2 || groups.length > 0) && (
                <div className={s.sqk}>
                    <button type="button" aria-pressed={same(allIds)} onClick={() => onChange(allIds)}>
                        Tutte
                    </button>
                    {min === 0 && (
                        <button type="button" aria-pressed={!value.length} onClick={() => onChange([])}>
                            Nessuna
                        </button>
                    )}
                    {groups.map(g => {
                        const ids = order(g.activityIds);
                        return (
                            <button key={g.id} type="button" aria-pressed={same(ids)} onClick={() => ids.length && onChange(ids)}>
                                {g.name}
                            </button>
                        );
                    })}
                </div>
            )}
            <div className={s.slst}>
                {list.map(x => {
                    const on = value.includes(x.id);
                    return (
                        <div key={x.id} className={s.srow}>
                            <button type="button" className={s.gsc} role="checkbox" aria-checked={on} onClick={() => toggle(x.id)}>
                                <span className={s.box}>{on && <Check size={12} aria-hidden />}</span>
                                <span className={s.snm}>{x.name}</span>
                            </button>
                            {sedi.length > 2 && (
                                <button type="button" className={s.sonly} aria-label={`Solo ${x.name}`} onClick={() => onChange([x.id])}>
                                    solo questa
                                </button>
                            )}
                        </div>
                    );
                })}
                {!list.length && <p className={s.snone}>Nessuna sede con «{query.trim()}».</p>}
            </div>
            <div className={s.sft}>
                {value.length} di {sedi.length} scelte
            </div>
        </>
    );
}

type BottoneProps = PannelloProps & {
    /** «below»: sotto il bottone, nella barra; «side»: a fianco della colonna. */
    place?: "below" | "side";
    className?: string;
    /** Senza, il bottone dice quali sedi sono scelte. */
    children?: ReactNode;
};

const W = 300;
// fuori dalla finestra finché non si sa dove va: si vede già, e prende il fuoco
const AWAY: CSSProperties = { left: -9999, top: 0 };
const GAP = 8;

/** Un bottone che apre il pannello delle sedi sopra la pagina: la colonna non lo taglia. */
export function SediBottone({ place = "below", className, children, ...p }: BottoneProps) {
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

    // aperto, il fuoco va sulla ricerca o sulla prima sede
    useEffect(() => {
        if (!open) return setPos(AWAY);
        popRef.current?.querySelector<HTMLElement>("input, [role=checkbox]")?.focus({ preventScroll: true });
    }, [open]);

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`${s.sbtn} ${className ?? ""}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={() => setOpen(o => !o)}
            >
                <Store size={15} aria-hidden />
                <span className={s.snm}>{children ?? sediSummary(p.sedi, p.value)}</span>
                <ChevronDown size={14} aria-hidden />
            </button>
            {open &&
                createPortal(
                    <div ref={popRef} id={id} className={s.spop} role="dialog" aria-label="Sedi" style={pos}>
                        <SediPannello {...p} />
                    </div>,
                    document.body
                )}
        </>
    );
}
