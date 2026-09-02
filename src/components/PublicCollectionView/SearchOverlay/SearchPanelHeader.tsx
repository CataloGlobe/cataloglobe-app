import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Search, X } from "lucide-react";
import styles from "./SearchOverlay.module.scss";

export type PanelView = "search" | "filters";

type Props = {
    view: PanelView;
    /** true quando la vista corrente è quella radice: niente freccia, solo X. */
    isRoot: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    onClearQuery: () => void;
    inputRef: RefObject<HTMLInputElement | null>;
    /** Etichetta del ritorno: «Ai risultati» con query attiva, «Cerca» senza. */
    backLabel: string;
    onBack: () => void;
    onClose: () => void;
    /** Ref sul bottone indietro: riceve il focus entrando nella vista filtri. */
    backButtonRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Intestazione del pannello. Ad altezza costante fra le due viste: la
 * transizione di vista anima solo il corpo, il chrome resta fermo.
 */
export default function SearchPanelHeader({
    view,
    isRoot,
    query,
    onQueryChange,
    onClearQuery,
    inputRef,
    backLabel,
    onBack,
    onClose,
    backButtonRef,
}: Props) {
    const { t } = useTranslation("public");

    return (
        <div className={styles.searchRow}>
            {view === "search" ? (
                <div className={styles.inputWrapper}>
                    <Search
                        className={styles.searchIcon}
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                    />
                    <input
                        ref={inputRef}
                        type="search"
                        className={styles.input}
                        placeholder={t("search.placeholder")}
                        value={query}
                        onChange={e => onQueryChange(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            type="button"
                            className={styles.clearBtn}
                            onClick={onClearQuery}
                            aria-label={t("search.clear_aria")}
                        >
                            <X size={13} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            ) : isRoot ? (
                // Radice «filters»: nessun ritorno possibile, solo il titolo.
                <span className={styles.viewTitle}>{t("search.filters_title")}</span>
            ) : (
                <button
                    ref={backButtonRef}
                    type="button"
                    className={styles.backBtn}
                    onClick={onBack}
                >
                    <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                    <span>{backLabel}</span>
                </button>
            )}

            <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label={t("search.close_aria")}
            >
                <X size={18} strokeWidth={2} />
            </button>
        </div>
    );
}
