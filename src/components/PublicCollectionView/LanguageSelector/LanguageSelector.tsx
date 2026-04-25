import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Globe } from "lucide-react";
import styles from "./LanguageSelector.module.scss";

type LanguageSelectorProps = {
    selectedLang?: string;
    onSelectLang?: (code: string) => void;
    variant: "hero" | "compact";
};

const LANGUAGES = [
    { code: "it", label: "Italiano", flag: "🇮🇹", enabled: true },
    { code: "en", label: "English", flag: "🇬🇧", enabled: false },
    { code: "fr", label: "Français", flag: "🇫🇷", enabled: false },
    { code: "de", label: "Deutsch", flag: "🇩🇪", enabled: false },
];

export default function LanguageSelector({
    selectedLang: selectedLangProp,
    onSelectLang,
    variant,
}: LanguageSelectorProps) {
    const [internalLang, setInternalLang] = useState("it");
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

    const selectedLang = selectedLangProp ?? internalLang;

    // Calcola posizione dropdown rispetto al viewport
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 6,
            right: window.innerWidth - rect.right,
        });
    }, []);

    // Aggiorna posizione all'apertura
    useEffect(() => {
        if (!open) return;
        updatePosition();
    }, [open, updatePosition]);

    // Chiudi dropdown al click esterno
    useEffect(() => {
        if (!open) return;

        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current?.contains(target) ||
                dropdownRef.current?.contains(target)
            ) return;
            setOpen(false);
        };

        document.addEventListener("mousedown", handleClick, true);
        return () => document.removeEventListener("mousedown", handleClick, true);
    }, [open]);

    const handleSelect = (code: string, enabled: boolean) => {
        if (!enabled) return;
        setInternalLang(code);
        onSelectLang?.(code);
        setOpen(false);
    };

    // Read theme CSS vars from in-tree trigger element so the portal inherits them.
    const portalStyle: Record<string, string> = triggerRef.current
        ? (() => {
            const cs = getComputedStyle(triggerRef.current!);
            const get = (v: string) => cs.getPropertyValue(v).trim();
            return {
                "--pub-radius": get("--pub-radius"),
                "--pub-btn-radius": get("--pub-btn-radius"),
                "--pub-surface": get("--pub-surface"),
                "--pub-surface-border": get("--pub-surface-border"),
                "--pub-surface-text": get("--pub-surface-text"),
                "--pub-accent": get("--pub-accent"),
                "--pub-font-family": get("--pub-font-family"),
            };
        })()
        : {};

    const triggerClass = [
        styles.trigger,
        variant === "hero" ? styles.triggerHero : styles.triggerCompact,
    ].join(" ");

    const chevronClass = [
        styles.triggerChevron,
        open ? styles.triggerChevronOpen : "",
    ].filter(Boolean).join(" ");

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={triggerClass}
                onClick={() => setOpen(prev => !prev)}
                aria-label="Seleziona lingua"
                aria-expanded={open}
            >
                <Globe size={14} strokeWidth={2} />
                <span className={styles.triggerLabel}>
                    {selectedLang.toUpperCase()}
                </span>
                <ChevronDown size={12} strokeWidth={2} className={chevronClass} />
            </button>

            {open && createPortal(
                <div
                    ref={dropdownRef}
                    className={styles.dropdown}
                    style={{ top: dropdownPos.top, right: dropdownPos.right, ...portalStyle } as React.CSSProperties}
                    role="listbox"
                    aria-label="Lingue disponibili"
                >
                    {LANGUAGES.map(lang => {
                        const isActive = lang.code === selectedLang;
                        const itemClass = [
                            styles.item,
                            isActive ? styles.itemActive : "",
                            !lang.enabled ? styles.itemDisabled : "",
                        ].filter(Boolean).join(" ");

                        return (
                            <button
                                key={lang.code}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                aria-disabled={!lang.enabled}
                                className={itemClass}
                                onClick={() => handleSelect(lang.code, lang.enabled)}
                            >
                                <span className={styles.itemFlag}>{lang.flag}</span>
                                <span className={styles.itemLabel}>{lang.label}</span>
                                {!lang.enabled && (
                                    <span className={styles.itemSoon}>presto</span>
                                )}
                                {isActive && (
                                    <Check size={14} strokeWidth={2.5} className={styles.itemCheck} />
                                )}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}
