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
import styles from "./Tabs.module.scss";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type TabsValue = string | number;
export type TabsVariant = "primary" | "secondary" | "line";

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

export function Tabs<T extends TabsValue>({ value, onChange, variant, children }: TabsProps<T>) {
    /**
     * Wrapper che rende onChange compatibile con TabsValue
     */
    const setValue = useCallback(
        (next: TabsValue) => {
            onChange(next as T);
        },
        [onChange]
    );

    // Mappa value -> span-label della tab, per misurare l'underline dinamico
    // (variant `line`/default). Popolata dai ref-callback di ogni <Tab>.
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
}

function TabsList({ children }: TabsListProps) {
    const { value, variant, itemRefs } = useTabsContext();
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

    // Underline dinamico solo per le varianti con indicatore (`line` + default).
    // `primary`/`secondary` usano background pill, nessun trattino.
    const showIndicator = variant === undefined || variant === "line";

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
        setIndicator({ width: box.width, left: box.left - listBox.left, animate });

        prevSig.current = sig;
    }, [value, itemRefs]);

    // Posiziona prima del paint per evitare il flash iniziale da width 0.
    useLayoutEffect(() => {
        if (!showIndicator) {
            setIndicator(null);
            prevSig.current = null;
            return;
        }
        measure();
    }, [measure, showIndicator]);

    // Ricalcolo su resize/reflow (finestra, cambio testo, load font, badge).
    // value invariato → `animate` resta false → resize snappa senza slide.
    useEffect(() => {
        if (!showIndicator) return;
        const listEl = listRef.current;
        if (!listEl) return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(listEl);
        return () => observer.disconnect();
    }, [measure, showIndicator]);

    return (
        <div className={styles.list} role="tablist" ref={listRef}>
            {children}
            {showIndicator && indicator && (
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
    badge?: React.ReactNode;
}

function Tab<T extends TabsValue>({ value, children, disabled = false, disabledTooltip, badge }: TabProps<T>) {
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
                <span className={styles.tabBadge}>{badge}</span>
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
