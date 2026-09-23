import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState
} from "react";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { Badge } from "@/components/ui/Badge/Badge";
import { useHorizontalOverflow } from "@/hooks/useHorizontalOverflow";
import styles from "./Tabs.module.scss";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type TabsValue = string | number;
/**
 * `primary` (di pagina, sotto l'header, 44) · `line` (dentro un drawer o una
 * card, 38). `secondary` non esiste più nel sistema: resta accettata e rende
 * come `primary`, con avviso in dev. Si toglie nel lotto 6.
 */
export type TabsVariant = "primary" | "secondary" | "line";
export type TabsBadgeTone = "neutral" | "brand" | "outline";

let warnedSecondary = false;
function resolveVariant(variant: TabsVariant | undefined): TabsVariant | undefined {
    if (variant !== "secondary") return variant;
    if (import.meta.env.DEV && !warnedSecondary) {
        warnedSecondary = true;
        console.warn('[Tabs] variant="secondary" deprecata: rende come "primary", usa primary o line');
    }
    return "primary";
}

/**
 * Context NON generico
 */
interface TabsContextValue {
    value: TabsValue;
    setValue: (value: TabsValue) => void;
    variant?: TabsVariant;
    // Registrazione degli span-label per misurare l'underline dinamico.
    registerTab: (value: TabsValue, el: HTMLElement | null) => void;
    itemRefs: React.RefObject<Map<TabsValue, HTMLElement>>;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
    const ctx = useContext(TabsContext);
    if (!ctx) {
        throw new Error("Tabs components must be used inside <Tabs>");
    }
    return ctx;
}

/* ------------------------------------------------------------------ */
/* Tabs (root) */
/* ------------------------------------------------------------------ */

interface TabsProps<T extends TabsValue> {
    value: T;
    onChange: (value: T) => void;
    variant?: TabsVariant;
    children: React.ReactNode;
}

export function Tabs<T extends TabsValue>({ value, onChange, variant: rawVariant, children }: TabsProps<T>) {
    const variant = resolveVariant(rawVariant);
    /**
     * Wrapper che rende onChange compatibile con TabsValue
     */
    const setValue = useCallback(
        (next: TabsValue) => {
            onChange(next as T);
        },
        [onChange]
    );

    // Mappa value -> span-label della tab, per misurare l'underline dinamico.
    // Popolata dai ref-callback di ogni <Tab>.
    const itemRefs = useRef<Map<TabsValue, HTMLElement>>(new Map());

    const registerTab = useCallback((tabValue: TabsValue, el: HTMLElement | null) => {
        if (el) {
            itemRefs.current.set(tabValue, el);
        } else {
            itemRefs.current.delete(tabValue);
        }
    }, []);

    const rootClassName = `${styles.root} ${styles[`variant_${variant ?? "default"}`]}`;

    return (
        <TabsContext.Provider value={{ value, setValue, variant, registerTab, itemRefs }}>
            <div className={rootClassName}>{children}</div>
        </TabsContext.Provider>
    );
}

/* ------------------------------------------------------------------ */
/* Tabs.List */
/* ------------------------------------------------------------------ */

interface TabsListProps {
    children: React.ReactNode;
    /** Nome del tablist, quando la pagina ne ha più d'uno (es. testata + stati). */
    "aria-label"?: string;
}

function TabsList({ children, "aria-label": ariaLabel }: TabsListProps) {
    const { value, itemRefs } = useTabsContext();
    const listRef = useRef<HTMLDivElement>(null);
    const [indicator, setIndicator] = useState<{ width: number; left: number; animate: boolean } | null>(null);

    // Firma del set di tab dell'ultima misura. Distingue un cambio-tab/resize
    // nella STESSA pagina (deve animare) da un cambio pagina: questa <Tabs> vive
    // nel PageHeaderSlot persistente di MainLayout, quindi navigando tra pagine
    // React RIUSA l'istanza (stesso tipo, stessa posizione) invece di rimontarla.
    // Senza questo gate l'indicatore scivolerebbe dalla posizione della pagina
    // precedente a quella nuova (bug). NB: si gatta sul SET di tab, non sul
    // `value`, perché al passaggio active la tab si fa bold → reflow → il
    // ResizeObserver rimisura, e un gate sul value spegnerebbe l'animazione appena
    // partita.
    const prevSig = useRef<string | null>(null);

    // Ogni variante ha l'indicatore (scheda «Tabs»): la pill di sfondo della
    // vecchia `primary` non esiste più.

    // Le tab non vanno mai a capo né si comprimono: scrollano. La sfumatura sul
    // bordo destro compare solo quando c'è davvero altro da scorrere — è l'unico
    // affordance previsto (niente freccine di navigazione).
    const { atEnd } = useHorizontalOverflow(listRef, children);

    const measure = useCallback(() => {
        const listEl = listRef.current;
        const activeEl = itemRefs.current.get(value);
        if (!listEl || !activeEl) {
            setIndicator(null);
            prevSig.current = null;
            return;
        }
        // Set corrente di tab (chiavi registrate). Diverso set = pagina diversa.
        const sig = Array.from(itemRefs.current.keys()).sort().join("|");
        // Anima solo se il set è lo STESSO della misura precedente (cambio-tab o
        // resize in-page). Primo mount (prevSig null) o cambio pagina (set diverso,
        // istanza riusata dal PageHeaderSlot) → snap istantaneo.
        const animate = prevSig.current !== null && prevSig.current === sig;

        const listBox = listEl.getBoundingClientRect();
        const box = activeEl.getBoundingClientRect();
        // `+ scrollLeft`: la lista è uno scroller e l'indicatore è posizionato in
        // assoluto rispetto al suo box di contenuto — che scorre. La differenza
        // fra rect è invece relativa al viewport, quindi senza il compenso
        // l'underline si sposterebbe di quanto si è scrollato.
        setIndicator({
            width: box.width,
            left: box.left - listBox.left + listEl.scrollLeft,
            animate
        });

        prevSig.current = sig;
    }, [value, itemRefs]);

    // Posiziona prima del paint per evitare il flash iniziale da width 0.
    useLayoutEffect(() => {
        measure();
    }, [measure]);

    // Ricalcolo su resize/reflow (finestra, cambio testo, load font, badge).
    // value invariato → `animate` resta false → resize snappa senza slide.
    useEffect(() => {
        const listEl = listRef.current;
        if (!listEl) return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(listEl);
        return () => observer.disconnect();
    }, [measure]);

    return (
        <div
            className={`${styles.list} ${!atEnd ? styles.overflowEnd : ""}`}
            role="tablist"
            aria-label={ariaLabel}
            ref={listRef}
        >
            {children}
            {indicator && (
                <span
                    className={styles.indicator}
                    style={{
                        width: indicator.width,
                        transform: `translateX(${indicator.left}px)`,
                        // Snap istantaneo su mount/cambio pagina; slide solo sul
                        // cambio-tab in-page. La transition base vive nel CSS.
                        transition: indicator.animate ? undefined : "none"
                    }}
                    aria-hidden="true"
                />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Tabs.Tab */
/* ------------------------------------------------------------------ */

interface TabProps<T extends TabsValue> {
    value: T;
    children: React.ReactNode;
    disabled?: boolean;
    disabledTooltip?: React.ReactNode;
    /** Contatore accanto all'etichetta, reso con `Badge`. */
    badge?: React.ReactNode;
    /** `neutral` (default) · `brand` se il contatore sono cose da fare ·
     *  `outline` su un fondo `hover-bg`. */
    badgeTone?: TabsBadgeTone;
}

function Tab<T extends TabsValue>({
    value,
    children,
    disabled = false,
    disabledTooltip,
    badge,
    badgeTone = "neutral"
}: TabProps<T>) {
    const { value: active, setValue, registerTab } = useTabsContext();
    const isActive = active === value;

    const className = [
        styles.tab,
        isActive ? styles.active : "",
        disabled ? styles.disabled : ""
    ].filter(Boolean).join(" ");

    // Niente attributo `disabled` nativo: Radix Tooltip non rileva hover su
    // trigger nativamente disabilitato. Usiamo solo `aria-disabled` + guard onClick.
    const button = (
        <button
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            className={className}
            onClick={disabled ? undefined : () => setValue(value)}
        >
            <span
                ref={(el) => {
                    registerTab(value, el);
                }}
                className={styles.tabLabel}
            >
                {children}
            </span>
            {badge !== undefined && badge !== null && badge !== false && (
                // `presentation`: il contatore fa parte del nome del tab
                // («Nuove 1»), non è una regione live a sé.
                <Badge variant={badgeTone} className={styles.tabBadge} role="presentation">
                    {badge}
                </Badge>
            )}
        </button>
    );

    if (disabled && disabledTooltip) {
        return <Tooltip content={disabledTooltip}>{button}</Tooltip>;
    }
    return button;
}

/* ------------------------------------------------------------------ */
/* Tabs.Panel (lazy support) */
/* ------------------------------------------------------------------ */

interface PanelProps<T extends TabsValue> {
    value: T;
    children: React.ReactNode;
    lazy?: boolean;
}

function TabsPanel<T extends TabsValue>({ value, children, lazy = false }: PanelProps<T>) {
    const { value: active } = useTabsContext();
    const [mounted, setMounted] = useState(false);

    const isActive = active === value;

    useEffect(() => {
        if (isActive) setMounted(true);
    }, [isActive]);

    if (lazy && !mounted) return null;
    if (!isActive) return null;

    return (
        <div role="tabpanel" className={styles.panel}>
            {children}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Compound exports */
/* ------------------------------------------------------------------ */

Tabs.List = TabsList;
Tabs.Tab = Tab;
Tabs.Panel = TabsPanel;
