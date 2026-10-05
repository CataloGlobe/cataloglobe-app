import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import ModalLayout, { ModalLayoutContent } from "@/components/ui/ModalLayout/ModalLayout";
import Text from "@/components/ui/Text/Text";
import type { CrmVenueListItem } from "@/types/crm";
import { CRM_STAGE_LABEL } from "@/utils/crm/stages";
import { searchVenues } from "@/utils/crm/crmSearch";
import styles from "./CrmShell.module.scss";

interface CrmSearchDialogProps {
    isOpen: boolean;
    onClose: () => void;
    venues: CrmVenueListItem[];
}

/** Cerca ⌘K: un locale per nome, città o referente; Invio apre la scheda. */
export function CrmSearchDialog({ isOpen, onClose, venues }: CrmSearchDialogProps) {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const results = useMemo(() => searchVenues(venues, query), [venues, query]);

    useEffect(() => {
        if (!isOpen) return;
        setQuery("");
        setActive(0);
        // Dopo il focus «neutro» della modale.
        const t = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [isOpen]);

    const open = (venue: CrmVenueListItem) => {
        onClose();
        navigate(`/admin/lead/${venue.id}`);
    };

    return (
        <ModalLayout isOpen={isOpen} onClose={onClose} width="sm" height="fit">
            <ModalLayoutContent>
                <div className={styles.search}>
                    <label className={styles.searchField}>
                        <Search size={18} aria-hidden="true" />
                        <input
                            ref={inputRef}
                            className={styles.searchInput}
                            type="search"
                            placeholder="Cerca un locale, una città, un referente"
                            aria-label="Cerca nel CRM"
                            aria-controls="crm-search-results"
                            aria-activedescendant={results[active] ? `crm-search-${results[active].id}` : undefined}
                            value={query}
                            onChange={e => {
                                setQuery(e.target.value);
                                setActive(0);
                            }}
                            onKeyDown={e => {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setActive(i => Math.min(i + 1, results.length - 1));
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setActive(i => Math.max(i - 1, 0));
                                } else if (e.key === "Enter" && results[active]) {
                                    e.preventDefault();
                                    open(results[active]);
                                }
                            }}
                        />
                    </label>
                    {query.trim() !== "" && (
                        <ul id="crm-search-results" className={styles.searchResults} role="listbox" aria-label="Locali trovati">
                            {results.length === 0 && (
                                <li className={styles.searchEmpty}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Nessun locale con questo nome.
                                    </Text>
                                </li>
                            )}
                            {results.map((venue, i) => (
                                <li
                                    key={venue.id}
                                    id={`crm-search-${venue.id}`}
                                    role="option"
                                    aria-selected={i === active}
                                    className={styles.searchResult}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => open(venue)}
                                >
                                    <Text variant="body-sm" weight={600}>
                                        {venue.name}
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        {[venue.city, CRM_STAGE_LABEL[venue.stage]].filter(Boolean).join(" · ")}
                                    </Text>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </ModalLayoutContent>
        </ModalLayout>
    );
}
