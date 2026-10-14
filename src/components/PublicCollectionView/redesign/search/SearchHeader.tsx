import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { closeSheet } from "../sheets/sheetStack";
import styles from "./Search.module.scss";

type Props = {
    query: string;
    onQueryChange: (query: string) => void;
};

/**
 * Testata della pagina «Cerca» (spec §4): il campo, già attivo, e «Annulla».
 * Su desktop, a tendina sotto l'isola, è il campo dell'isola (mockup v38):
 * SheetHost lo posa lì sopra e «Annulla» non c'è (chiude Esc o il velo).
 * Il fuoco passa dal campo fantasma dell'isola (preso nel gesto della lente)
 * a questo prima del paint: su iOS la tastiera resta su.
 */
export default function SearchHeader({ query, onQueryChange }: Props) {
    const { t } = useTranslation("public");
    const inputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
        inputRef.current?.focus({ preventScroll: true });
        // Su desktop questo campo si posa su quello dell'isola, che si nasconde (Island.module.scss).
        const root = document.documentElement;
        root.dataset.searchHeader = "";
        return () => {
            delete root.dataset.searchHeader;
        };
    }, []);

    return (
        <div className={styles.header}>
            <label className={styles.field}>
                <Search size={16} strokeWidth={2} className={styles.fieldIcon} aria-hidden />
                <input
                    ref={inputRef}
                    type="search"
                    className={styles.input}
                    value={query}
                    onChange={event => onQueryChange(event.target.value)}
                    placeholder={t("header.search_field")}
                    aria-label={t("search.dialog_aria")}
                    enterKeyHint="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                />
                {query ? (
                    <button
                        type="button"
                        className={styles.clear}
                        onClick={() => {
                            onQueryChange("");
                            inputRef.current?.focus({ preventScroll: true });
                        }}
                        aria-label={t("search.clear_aria")}
                    >
                        <X size={14} strokeWidth={2.5} aria-hidden />
                    </button>
                ) : null}
            </label>
            <button type="button" className={styles.cancel} onClick={closeSheet}>
                {t("search.close_label")}
            </button>
        </div>
    );
}
