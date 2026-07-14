import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { AvailableLanguage } from "@context/Language/LanguageContext";
import PublicSheet from "../PublicSheet/PublicSheet";
import Text from "@components/ui/Text/Text";
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
     *  Qualsiasi scroll chiude il dropdown. Usato solo da `renderAs="dropdown"`. */
    scrollContainerEl?: HTMLElement | null;
    /** Trattamento visivo del trigger. `glass` (default) = pill 44×44 semi-
     *  trasparente del menu catalogo. `solid` = gemello del pulsante "Menu"
     *  in prenotazione (pill 36px + blur, più visibile su cover chiara). */
    variant?: "glass" | "solid";
    /** `dropdown` (default) = portale ancorato al trigger, usato da `ReservationPage`
     *  (provider-free). `sheet` = `PublicSheet` (bottom sheet mobile / dialog
     *  desktop), usato dal menu catalogo pubblico in vista di >5 lingue. */
    renderAs?: "dropdown" | "sheet";
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
    renderAs = "dropdown",
}: LanguageSelectorViewProps) {
    const { t } = useTranslation("public");
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
    const isDropdown = renderAs === "dropdown";

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 6,
            right: window.innerWidth - rect.right,
        });
    }, []);

    useEffect(() => {
        if (!isDropdown || !open) return;
        updatePosition();
    }, [isDropdown, open, updatePosition]);

    useEffect(() => {
        if (!isDropdown || !open) return;

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
    }, [isDropdown, open, scrollContainerEl]);

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

    const renderOption = (lang: AvailableLanguage, itemClassName: string) => {
        const isActive = lang.code === currentLang;
        const itemClass = [itemClassName, isActive ? styles.itemActive : ""]
            .filter(Boolean).join(" ");

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
    };

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

            {isDropdown && open && createPortal(
                <div
                    ref={dropdownRef}
                    className={styles.dropdown}
                    style={{ top: dropdownPos.top, right: dropdownPos.right, ...portalStyle } as React.CSSProperties}
                    role="listbox"
                    aria-label={t("language_selector.list_aria")}
                >
                    {languages.map(lang => renderOption(lang, styles.item))}
                </div>,
                document.body
            )}

            {!isDropdown && (
                <PublicSheet
                    isOpen={open}
                    onClose={() => setOpen(false)}
                    ariaLabel={t("language_selector.sheet_title")}
                    headerContent={
                        <div className={styles.sheetHeader}>
                            <Text
                                variant="body"
                                weight={700}
                                className={styles.sheetHeaderTitle}
                                color="var(--pub-surface-text)"
                            >
                                {t("language_selector.sheet_title")}
                            </Text>
                            <button
                                type="button"
                                className={styles.sheetCloseBtn}
                                onClick={() => setOpen(false)}
                                aria-label={t("language_selector.close_aria")}
                            >
                                {t("language_selector.close_label")}
                            </button>
                        </div>
                    }
                >
                    <div
                        className={styles.sheetBody}
                        role="listbox"
                        aria-label={t("language_selector.list_aria")}
                    >
                        {languages.map(lang => renderOption(lang, styles.sheetItem))}
                    </div>
                </PublicSheet>
            )}
        </>
    );
}
