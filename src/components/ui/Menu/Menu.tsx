import React, { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import styles from "./Menu.module.scss";

type MenuAlign = "start" | "end";
type MenuSide = "top" | "bottom" | "right";

interface MenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: MenuAlign;
    side?: MenuSide;
    /** Classe in più sul pannello: serve a chi lo apre sopra un overlay (sidebar al telefono). */
    contentClassName?: string;
    /** `compact`: righe 32, icone 14, divisori rientrati (menù dell'account, Officina). */
    density?: "default" | "compact";
}

export function Menu({
    trigger,
    children,
    align = "start",
    side = "bottom",
    contentClassName,
    density = "default"
}: MenuProps) {
    const className = [styles.content, density === "compact" && styles.compact, contentClassName]
        .filter(Boolean)
        .join(" ");
    return (
        <RadixDropdownMenu.Root>
            <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
            <RadixDropdownMenu.Portal>
                <RadixDropdownMenu.Content
                    className={className}
                    align={align}
                    side={side}
                    sideOffset={6}
                >
                    {children}
                </RadixDropdownMenu.Content>
            </RadixDropdownMenu.Portal>
        </RadixDropdownMenu.Root>
    );
}

interface MenuItemProps {
    children: ReactNode;
    icon?: React.ComponentType<{ size?: number }>;
    /** Icona già resa (le voci di sidebar portano un elemento, non un componente): portata a 16. */
    leading?: ReactNode;
    /** `destructive` in --danger (va in fondo, dopo un divisore); `accent` in brand per l'azione che fa avanzare (es. «Pubblica»). */
    variant?: "default" | "destructive" | "accent";
    onSelect?: () => void;
    disabled?: boolean;
    /**
     * Sotto-testo `caption` sotto l'etichetta (scheda «Menu», anatomia). Per
     * una voce spenta è il perché: un tooltip non si legge sul telefono e non
     * deve essere l'unico posto di un'informazione necessaria.
     */
    description?: string;
    /**
     * Voce che porta altrove invece di eseguire qualcosa: rende un `<a>` vero,
     * così restano il middle-click, "apri in nuova scheda" e l'anteprima
     * dell'URL — un `window.open()` in `onSelect` li perderebbe tutti.
     */
    href?: string;
    target?: string;
    /** In coda alla voce: un contatore o un pallino (menù dell'account). */
    trailing?: ReactNode;
    /**
     * La spiegazione più lunga della voce (D173): una «i» in coda col tooltip,
     * che si apre passando sopra e anche al clic, così si legge al telefono.
     * La voce la dice anche ai lettori di schermo.
     */
    info?: string;
}

/**
 * La «i» in coda alla voce: un bottone. Il clic apre il tooltip e non
 * sceglie la voce; da tastiera ci si arriva con → dalla voce (come a un
 * sottomenù), il fuoco apre il tooltip, Invio o Spazio lo chiudono e
 * riaprono, ← o Esc tornano alla voce, ↑ ↓ vanno alle voci vicine.
 */
function MenuItemInfo({ text, ref }: { text: string; ref?: React.Ref<HTMLSpanElement> }) {
    const [open, setOpen] = useState(false);
    const stop = (e: React.SyntheticEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
        const item = e.currentTarget.closest<HTMLElement>("[role='menuitem']");
        if (e.key === "Enter" || e.key === " ") {
            stop(e);
            setOpen(o => !o);
        } else if (e.key === "ArrowLeft" || e.key === "Escape") {
            stop(e);
            setOpen(false);
            item?.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            // Le frecce le gestisce la voce: si torna lì e si ripete il tasto.
            stop(e);
            item?.focus();
            item?.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, bubbles: true }));
        }
    };
    return (
        <Tooltip content={text} side="bottom" align="end" open={open} onOpenChange={setOpen}>
            <span
                ref={ref}
                role="button"
                tabIndex={-1}
                aria-label="Cosa fa questa voce"
                aria-expanded={open}
                className={styles.itemInfo}
                onPointerDown={stop}
                onPointerUp={stop}
                onKeyDown={onKeyDown}
                onClick={e => {
                    stop(e);
                    setOpen(o => !o);
                }}
            >
                <Info size={15} aria-hidden />
            </span>
        </Tooltip>
    );
}

function MenuItem({
    children,
    icon: Icon,
    variant = "default",
    onSelect,
    disabled,
    description,
    href,
    target,
    trailing,
    leading,
    info
}: MenuItemProps) {
    const infoRef = useRef<HTMLSpanElement>(null);
    const className = `${styles.item}${variant === "destructive" ? ` ${styles.danger}` : variant === "accent" ? ` ${styles.accent}` : ""}${description ? ` ${styles.withDescription}` : ""}`;
    const content = (
        <>
            {Icon && <Icon size={16} />}
            {!Icon && leading && <span className={styles.itemLeading}>{leading}</span>}
            <span className={styles.itemLabel}>
                {children}
                {description && (
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.itemDescription}>
                        {description}
                    </Text>
                )}
            </span>
            {trailing && <span className={styles.itemTrailing}>{trailing}</span>}
            {info && <MenuItemInfo ref={infoRef} text={info} />}
        </>
    );

    if (href) {
        return (
            <RadixDropdownMenu.Item asChild disabled={disabled}>
                <a
                    className={className}
                    href={href}
                    target={target}
                    rel={target === "_blank" ? "noopener noreferrer" : undefined}
                >
                    {content}
                </a>
            </RadixDropdownMenu.Item>
        );
    }

    return (
        <RadixDropdownMenu.Item
            className={className}
            disabled={disabled}
            onSelect={onSelect}
            aria-description={info}
            aria-keyshortcuts={info ? "ArrowRight" : undefined}
            onKeyDown={
                info
                    ? e => {
                          if (e.key !== "ArrowRight" || e.target !== e.currentTarget) return;
                          e.preventDefault();
                          infoRef.current?.focus();
                      }
                    : undefined
            }
        >
            {content}
        </RadixDropdownMenu.Item>
    );
}

function MenuSeparator() {
    return <RadixDropdownMenu.Separator className={styles.separator} />;
}

interface MenuLabelProps {
    children: ReactNode;
}

function MenuLabel({ children }: MenuLabelProps) {
    return <RadixDropdownMenu.Label className={styles.label}>{children}</RadixDropdownMenu.Label>;
}

Menu.Item = MenuItem;
Menu.Separator = MenuSeparator;
Menu.Label = MenuLabel;
