import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLanguage } from "@context/Language/useLanguage";
import styles from "./LanguageSelector.module.scss";

type LanguageSelectorProps = {
    variant: "hero" | "compact";
};

export default function LanguageSelector({ variant }: LanguageSelectorProps) {
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

        document.addEventListener("mousedown", handleClick, true);
        return () => document.removeEventListener("mousedown", handleClick, true);
    }, [open]);

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
                aria-label={t("language_selector.trigger_aria")}
                aria-expanded={open}
            >
                {variant === "hero" ? (
                    <span className={styles.triggerCode}>
                        {currentLang.toUpperCase()}
                    </span>
                ) : (
                    <>
                        <Globe size={14} strokeWidth={2} />
                        <span className={styles.triggerLabel}>
                            {currentLang.toUpperCase()}
                        </span>
                        <ChevronDown size={12} strokeWidth={2} className={chevronClass} />
                    </>
                )}
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
