import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { AvailableLanguage } from "@context/Language/LanguageContext";
import styles from "./LanguageSelector.module.scss";

type LanguageSelectorViewProps = {
    /** Lingue selezionabili (base-first). Nessun selettore se length <= 1. */
    languages: AvailableLanguage[];
    /** Codice lingua attualmente attivo (lowercase). */
    currentLang: string;
    /** Callback su scelta lingua. Sorgente-agnostica: context `setLang`
     *  (menu) o `navigate` per segmento URL (prenotazione, provider-free). */
    onSelect: (code: string) => void;
    /** Contenitore scrollabile (preview = device frame). Fallback window a runtime.
     *  Qualsiasi scroll chiude il dropdown. */
    scrollContainerEl?: HTMLElement | null;
    /** Trattamento visivo del trigger. `glass` (default) = pill 44×44 semi-
     *  trasparente del menu catalogo. `solid` = gemello del pulsante "Menu"
     *  in prenotazione (pill 36px + blur, più visibile su cover chiara). */
    variant?: "glass" | "solid";
};

/**
 * Presentational language selector. Nessuna dipendenza da `LanguageProvider`:
 * lingue + lingua attiva + azione arrivano via props. Usato da:
 *  - `LanguageSelector` (container context, menu pubblico → `setLang`)
 *  - `ReservationPage` (provider-free → `navigate` sul segmento URL)
 * Markup e SCSS sono condivisi (un solo file UI), così menu e prenotazione
 * restano allineati per sempre.
 */
export default function LanguageSelectorView({
    languages,
    currentLang,
    onSelect,
    scrollContainerEl,
    variant = "glass",
}: LanguageSelectorViewProps) {
    const { t } = useTranslation("public");
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 6,
            right: window.innerWidth - rect.right,
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        updatePosition();
    }, [open, updatePosition]);

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

        // Qualsiasi scroll chiude il dropdown (trackpad desktop + touch mobile).
        // Il dropdown lingue NON usa scroll-lock: lo scroll resta normale → basta
        // intercettare l'evento. Sorgente: scrollContainerEl (preview) ?? window.
        const scrollTarget: HTMLElement | Window = scrollContainerEl ?? window;
        const handleScroll = () => setOpen(false);

        document.addEventListener("mousedown", handleClick, true);
        scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            document.removeEventListener("mousedown", handleClick, true);
            scrollTarget.removeEventListener("scroll", handleScroll);
        };
    }, [open, scrollContainerEl]);

    const handleSelect = (code: string) => {
        if (code !== currentLang) {
            onSelect(code);
        }
        setOpen(false);
    };

    if (languages.length <= 1) return null;

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
                "--pub-primary": get("--pub-primary"),
                "--pub-font-family": get("--pub-font-family"),
            };
        })()
        : {};

    const triggerClass = `${styles.trigger} ${styles.triggerHero}`;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={triggerClass}
                data-variant={variant}
                onClick={() => setOpen(prev => !prev)}
                aria-label={t("language_selector.trigger_aria")}
                aria-expanded={open}
            >
                <span className={styles.triggerCode}>
                    {currentLang.toUpperCase()}
                </span>
            </button>

            {open && createPortal(
                <div
                    ref={dropdownRef}
                    className={styles.dropdown}
                    style={{ top: dropdownPos.top, right: dropdownPos.right, ...portalStyle } as React.CSSProperties}
                    role="listbox"
                    aria-label={t("language_selector.list_aria")}
                >
                    {languages.map(lang => {
                        const isActive = lang.code === currentLang;
                        const itemClass = [
                            styles.item,
                            isActive ? styles.itemActive : "",
                        ].filter(Boolean).join(" ");

                        return (
                            <button
                                key={lang.code}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                className={itemClass}
                                onClick={() => handleSelect(lang.code)}
                            >
                                {lang.flag_emoji && (
                                    <span className={styles.itemFlag}>{lang.flag_emoji}</span>
                                )}
                                <span className={styles.itemLabel}>{lang.name_native}</span>
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
