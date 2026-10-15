import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import s from "./FilterFit.module.scss";

export type FilterFitSort<T extends string> = {
    /** Inizio del nome per i lettori di schermo, «Ordina»: contiene la parola che si vede (WCAG 2.5.3). */
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
    const pillsRef = useRef<HTMLDivElement>(null);
    const asideRef = useRef<HTMLDivElement>(null);
    const [zip, setZip] = useState(false);
    const zipRef = useRef(false);
    // La larghezza che serviva alla riga intera l'ultima volta che non ci stava.
    const needRef = useRef(0);

    // Si toglie il segno, si misura la riga intera e lo si rimette se non ci
    // sta: tutto prima del disegno, quindi senza sfarfallio. Chiusa, la riga ha
    // il pulsante e l'ordine a icona, più stretti: misurarla così la farebbe
    // riaprire e richiudere di continuo. Si riapre solo quando c'è lo spazio
    // che serviva alla riga intera.
    const fit = useCallback(() => {
        const row = rowRef.current;
        if (!row) return;
        if (zipRef.current && row.clientWidth < needRef.current) return;
        row.removeAttribute("data-zip");
        const tooWide = row.scrollWidth > row.clientWidth + 1;
        if (tooWide) {
            needRef.current = row.scrollWidth;
            row.setAttribute("data-zip", "");
        }
        zipRef.current = tooWide;
        setZip(tooWide);
    }, []);

    // Quando cambia il contenuto la soglia vecchia non vale più: una riga
    // accorciata (un filtro tolto, numeri più corti, `short`) si deve poter
    // riaprire anche senza che la pagina si allarghi.
    const refit = useCallback(() => {
        needRef.current = 0;
        fit();
    }, [fit]);

    // Prima del disegno solo quando cambia ciò che decide la riga; i numeri
    // nelle pill e il resto del contenuto li segue il MutationObserver qui sotto.
    const sortValue = sort?.value;
    useLayoutEffect(refit, [refit, active, short, sortValue]);

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
        // testi e figli delle pill e di `aside`, non della riga intera: il
        // pulsante coi cursori e «Ordina» a icona li cambia `fit` stesso, e
        // guardarli lo farebbe ripartire senza fine (la riga si apre e si chiude)
        const mo = new MutationObserver(refit);
        for (const el of [pillsRef.current, asideRef.current]) if (el) mo.observe(el, { childList: true, subtree: true, characterData: true });
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            mo.disconnect();
        };
    }, [fit, refit]);

    return (
        <div ref={rowRef} className={`${s.row} ${className ?? ""}`} data-zip={zip ? "" : undefined}>
            <div ref={pillsRef} className={s.pills} aria-hidden={zip || undefined} inert={zip || undefined}>
                {children}
            </div>
            {aside && (
                <div ref={asideRef} className={s.aside} aria-hidden={zip || undefined} inert={zip || undefined}>
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

    // il foglio copre la pagina: il Tab resta dentro finché è aperto
    useFocusTrap(popRef, open && sheet);

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

    // il fuoco sul pannello: Tab porta alle pill, senza accendere l'anello su una
    // scelta; di nuovo se il pannello rinasce passando la soglia dei 641
    useEffect(() => {
        if (open) popRef.current?.focus({ preventScroll: true });
    }, [open, sheet]);

    // si chiude cliccando fuori o con Esc, e il fuoco torna al pulsante
    useEffect(() => {
        if (!open) return setPos(AWAY);
        const off = (ev: MouseEvent) => {
            const t = ev.target as Node;
            if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
            setOpen(false);
            // il fuoco torna al pulsante; se il clic cade su un altro comando, il fuoco va lì
            btnRef.current?.focus({ preventScroll: true });
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
            aria-modal={sheet || undefined}
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
            <Tooltip content="Mostra solo">
                <button
                    ref={btnRef}
                    type="button"
                    className={s.fzBtn}
                    data-on={active ? "" : undefined}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? id : undefined}
                    aria-label={label}
                    onClick={() => setOpen(o => !o)}
                >
                    <svg viewBox="0 0 24 24" aria-hidden className={s.fzIcon}>
                        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
                        <circle cx="15" cy="7" r="2.2" />
                        <circle cx="9" cy="17" r="2.2" />
                    </svg>
                    {active > 0 && <i className={s.count}>{active}</i>}
                </button>
            </Tooltip>
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
                <SortTrigger
                    tip={icon}
                    type="button"
                    className={s.sortBtn}
                    data-icon={icon ? "" : undefined}
                    data-short={short ? "" : undefined}
                    aria-label={`${sort.label}: ${current}`}
                >
                    <ArrowUpDown size={18} aria-hidden className={s.sortIcon} />
                    <span className={s.sortName}>{current}</span>
                    <span className={s.sortShort} aria-hidden>
                        Ordina
                    </span>
                    <ChevronDown size={14} aria-hidden className={s.chev} />
                </SortTrigger>
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

/**
 * Il pulsante di «Ordina». Il trigger del Menu gli passa `ref` e gestori, e
 * da icona il nome lo dice il Tooltip, che si aggancia allo stesso pulsante.
 */
function SortTrigger({ tip, ...props }: ComponentProps<"button"> & { tip: boolean }) {
    const btn = <button {...props} />;
    return tip ? <Tooltip content="Ordina">{btn}</Tooltip> : btn;
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
