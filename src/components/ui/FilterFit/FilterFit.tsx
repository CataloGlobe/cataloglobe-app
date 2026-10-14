import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import s from "./FilterFit.module.scss";

export type FilterFitSort<T extends string> = {
    /** Per i lettori di schermo: «Ordine». */
    label: string;
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (v: T) => void;
};

export interface FilterFitProps<T extends string> {
    /** Le pill dei filtri (ChipGroupSingle, il chip delle stelle…). */
    children: ReactNode;
    /** Filtri accesi: il numerino sul pulsante. */
    active: number;
    /** «Togli i filtri» in fondo al pannello, solo con un filtro acceso. */
    onClear?: () => void;
    /** Altre scelte che nella riga sono una tendina e nel pannello diventano pill (es. «Passati da»). */
    aside?: ReactNode;
    panelExtra?: ReactNode;
    sort?: FilterFitSort<T>;
    /** Testata compatta: «Ordina» dice la parola, non la scelta. */
    short?: boolean;
    className?: string;
}

// fuori dalla finestra finché non si sa dove va
const AWAY: CSSProperties = { left: -9999, top: 0 };
const W = 320;

/**
 * Filtri della D (Visual Redesign 2, `fz`): pill quando ci stanno, altrimenti
 * un pulsante con i cursori e il numerino che apre «Mostra solo». Decide lo
 * spazio della riga, non il dispositivo. «Ordina» è una pillola col nome
 * quando c'è posto, un'icona con le frecce quando no. Solo D: con la D spenta
 * le pagine usano ancora le pill e la tendina di sempre.
 */
export function FilterFit<T extends string>({ children, active, onClear, aside, panelExtra, sort, short, className }: FilterFitProps<T>) {
    const rowRef = useRef<HTMLDivElement>(null);
    const [zip, setZip] = useState(false);

    // Si toglie il segno, si misura la riga intera e lo si rimette se non ci
    // sta: tutto prima del disegno, quindi senza sfarfallio.
    const fit = useCallback(() => {
        const row = rowRef.current;
        if (!row) return;
        row.removeAttribute("data-zip");
        const tooWide = row.scrollWidth > row.clientWidth + 1;
        if (tooWide) row.setAttribute("data-zip", "");
        setZip(tooWide);
    }, []);

    useLayoutEffect(fit);

    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        let raf = 0;
        const later = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(fit);
        };
        const ro = new ResizeObserver(later);
        ro.observe(row);
        if (row.parentElement) ro.observe(row.parentElement);
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [fit]);

    return (
        <div ref={rowRef} className={`${s.row} ${className ?? ""}`} data-zip={zip ? "" : undefined}>
            <div className={s.pills} aria-hidden={zip || undefined} inert={zip || undefined}>
                {children}
            </div>
            {aside && (
                <div className={s.aside} aria-hidden={zip || undefined} inert={zip || undefined}>
                    {aside}
                </div>
            )}
            {zip && (
                <FilterPanel active={active} onClear={onClear}>
                    {children}
                    {panelExtra}
                </FilterPanel>
            )}
            {sort && <SortMenu sort={sort} icon={zip} short={short} />}
        </div>
    );
}

function FilterPanel({ active, onClear, children }: { active: number; onClear?: () => void; children: ReactNode }) {
    const sheet = useMediaQuery("(max-width: 640px)");
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<CSSProperties>(AWAY);
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const id = useId();

    // sotto il pulsante, a sinistra, dentro la finestra
    useLayoutEffect(() => {
        if (!open || sheet) return;
        const put = () => {
            const b = btnRef.current?.getBoundingClientRect();
            const h = popRef.current?.offsetHeight ?? 0;
            if (!b) return;
            const vw = window.innerWidth;
            const left = Math.max(16, Math.min(b.left, vw - Math.min(W, vw - 32) - 16));
            let top = b.bottom + 6;
            if (top + h > window.innerHeight - 12) top = Math.max(12, b.top - 6 - h);
            setPos({ left, top });
        };
        put();
        window.addEventListener("scroll", put, true);
        window.addEventListener("resize", put);
        return () => {
            window.removeEventListener("scroll", put, true);
            window.removeEventListener("resize", put);
        };
    }, [open, sheet]);

    // si chiude cliccando fuori o con Esc, e il fuoco torna al pulsante
    useEffect(() => {
        if (!open) return setPos(AWAY);
        // il fuoco sul pannello: Tab porta alle pill, senza accendere l'anello su una scelta
        popRef.current?.focus({ preventScroll: true });
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

    const label = active ? `Mostra solo, ${active === 1 ? "un filtro acceso" : `${active} filtri accesi`}` : "Mostra solo";
    const pop = (
        <div
            ref={popRef}
            id={id}
            className={`${s.pop} ${sheet ? s.popSheet : ""}`}
            role="dialog"
            aria-label="Mostra solo"
            tabIndex={-1}
            style={sheet ? undefined : pos}
        >
            <p className={s.head}>Mostra solo</p>
            <div className={s.panelPills}>{children}</div>
            {active > 0 && onClear && (
                <button
                    type="button"
                    className={s.clear}
                    onClick={() => {
                        onClear();
                        setOpen(false);
                        btnRef.current?.focus();
                    }}
                >
                    Togli i filtri
                </button>
            )}
        </div>
    );

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={s.fzBtn}
                data-on={active ? "" : undefined}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-label={label}
                title="Mostra solo"
                onClick={() => setOpen(o => !o)}
            >
                <svg viewBox="0 0 24 24" aria-hidden className={s.fzIcon}>
                    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
                    <circle cx="15" cy="7" r="2.2" />
                    <circle cx="9" cy="17" r="2.2" />
                </svg>
                {active > 0 && <i className={s.count}>{active}</i>}
            </button>
            {open && createPortal(sheet ? <div className={s.veil}>{pop}</div> : pop, document.body)}
        </>
    );
}

function SortMenu<T extends string>({ sort, icon, short }: { sort: FilterFitSort<T>; icon: boolean; short?: boolean }) {
    const current = sort.options.find(o => o.value === sort.value)?.label ?? "";
    return (
        <Menu
            align="end"
            trigger={
                <button
                    type="button"
                    className={s.sortBtn}
                    data-icon={icon ? "" : undefined}
                    data-short={short ? "" : undefined}
                    aria-label={`${sort.label}: ${current}`}
                    title={icon ? "Ordina" : undefined}
                >
                    <ArrowUpDown size={18} aria-hidden className={s.sortIcon} />
                    <span className={s.sortName}>{current}</span>
                    <span className={s.sortShort} aria-hidden>
                        Ordina
                    </span>
                    <ChevronDown size={14} aria-hidden className={s.chev} />
                </button>
            }
        >
            {sort.options.map(o => (
                <Menu.Item
                    key={o.value}
                    className={o.value === sort.value ? s.sortOn : undefined}
                    trailing={o.value === sort.value ? <Check size={15} strokeWidth={2.4} aria-hidden /> : undefined}
                    onSelect={() => sort.onChange(o.value)}
                >
                    {o.label}
                </Menu.Item>
            ))}
        </Menu>
    );
}

/** Un gruppo in più nel pannello «Mostra solo», col suo titolo (es. «Passati da»). */
export function FilterFitSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <>
            <p className={s.head}>{title}</p>
            <div className={s.panelPills} role="group" aria-label={title}>
                {children}
            </div>
        </>
    );
}
