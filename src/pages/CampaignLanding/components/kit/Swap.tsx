import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./Swap.module.scss";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** Durata del cambio. ⚠️ Stessa durata di --ld-dur-swap (styles/_tokens.scss). */
const SWAP_MS = 250;

// Sul server niente layout effect (prerender).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Shown = { id: string | number; node: ReactNode };

/**
 * Cambio di contenuto senza scatti: quando `id` cambia, il vecchio contenuto
 * resta per SWAP_MS mentre esce e il nuovo entra nello stesso posto (stessa
 * cella di griglia). `roll`: il vecchio sale e il nuovo arriva dal basso, come
 * un contatore; `soft`: il vecchio svanisce salendo appena e il nuovo entra
 * poco dopo dal basso, senza che i due si vedano sovrapposti (blocchi grandi,
 * come il menù dell'hero); altrimenti solo dissolvenza. `block` per i
 * contenuti a blocco.
 * Con `prefers-reduced-motion` il vecchio non si vede: cambio secco.
 */
export function Swap({
    id,
    children,
    roll = false,
    soft = false,
    block = false,
    className
}: {
    id: string | number;
    children: ReactNode;
    roll?: boolean;
    soft?: boolean;
    block?: boolean;
    className?: string;
}) {
    // Ultimo contenuto mostrato: diventa il vecchio al prossimo cambio di `id`.
    const last = useRef<Shown>({ id, node: children });
    const [old, setOld] = useState<Shown | null>(null);

    // Prima del disegno: il vecchio è già al suo posto quando il nuovo compare.
    useIsoLayoutEffect(() => {
        if (last.current.id !== id) setOld(last.current);
        last.current = { id, node: children };
    });

    useEffect(() => {
        if (!old) return;
        const t = window.setTimeout(() => setOld(null), SWAP_MS);
        return () => window.clearTimeout(t);
    }, [old]);

    const Tag = block ? "div" : "span";
    return (
        <Tag className={cx(styles.swap, block && styles.block, roll && styles.roll, soft && styles.soft, className)}>
            {old && (
                <Tag key={`old-${old.id}`} className={styles.out} aria-hidden="true">
                    {old.node}
                </Tag>
            )}
            <Tag key={id} className={cx(old && styles.in)}>
                {children}
            </Tag>
        </Tag>
    );
}
