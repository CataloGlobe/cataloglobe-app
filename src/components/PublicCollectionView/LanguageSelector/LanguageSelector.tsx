import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useLanguage } from "@context/Language/useLanguage";
import styles from "./LanguageSelector.module.scss";

type LanguageSelectorProps = {
    /** Contenitore scrollabile (preview = device frame). Fallback window a runtime.
     *  Stessa logica dell'header: qualsiasi scroll chiude il dropdown. */
    scrollContainerEl?: HTMLElement | null;
};

export default function LanguageSelector({ scrollContainerEl }: LanguageSelectorProps = {}) {
    const { t } = useTranslation("public");
    const { currentLang, availableLanguages, setLang } = useLanguage();
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
            setLang(code);
        }
        setOpen(false);
    };

    if (availableLanguages.length <= 1) return null;

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

    const triggerClass = `${styles.trigger} ${styles.triggerHero}`;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={triggerClass}
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
                    {availableLanguages.map(lang => {
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
