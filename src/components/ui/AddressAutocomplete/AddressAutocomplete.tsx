import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { supabase } from "@services/supabase/client";
import styles from "./AddressAutocomplete.module.scss";

export type AddressResult = {
    address: string;
    street_number: string;
    postal_code: string;
    city: string;
    province: string;
};

type SearchResult = {
    place_id: string;
    name: string;
    address: string;
};

interface AddressAutocompleteProps {
    onSelect: (result: AddressResult) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function AddressAutocomplete({ onSelect, placeholder, disabled }: AddressAutocompleteProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Chiudi dropdown su click esterno
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Chiudi dropdown su Escape
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") setShowDropdown(false);
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, []);

    const search = useCallback(async (q: string) => {
        setIsSearching(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                "search-google-places",
                { body: { query: q.trim() } }
            );
            if (fnError) throw fnError;
            const items = (data as { results: SearchResult[] }).results ?? [];
            setResults(items);
            setShowDropdown(true);
        } catch {
            setError("Errore durante la ricerca.");
            setResults([]);
            setShowDropdown(true);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (val.trim().length < 3) {
            setResults([]);
            setShowDropdown(false);
            return;
        }
        debounceRef.current = setTimeout(() => search(val), 400);
    };

    const handleSelect = async (place: SearchResult) => {
        setShowDropdown(false);
        setIsLoadingDetails(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                "search-google-places",
                { body: { place_id: place.place_id } }
            );
            if (fnError) throw fnError;
            const result = data as AddressResult;
            onSelect(result);
            setQuery("");
            setSelectedAddress(
                [result.address, result.street_number].filter(Boolean).join(" ") +
                (result.city ? ` — ${result.city}` : "")
            );
        } catch {
            setError("Errore nel recupero dell'indirizzo.");
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const isLoading = isSearching || isLoadingDetails;

    const handleClear = () => {
        setSelectedAddress(null);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
        <div className={styles.wrapper}>
            <span className={styles.label}>Cerca indirizzo</span>
            {selectedAddress !== null ? (
                <div className={styles.selectedPill} role="status" aria-label="Indirizzo selezionato">
                    <MapPin size={15} strokeWidth={2} className={styles.pillIcon} aria-hidden="true" />
                    <span className={styles.pillText}>{selectedAddress}</span>
                    <button
                        type="button"
                        className={styles.pillClearBtn}
                        onClick={handleClear}
                        aria-label="Rimuovi indirizzo selezionato"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>
            ) : (
            <>
            <div ref={dropdownRef} className={styles.dropdownAnchor}>
                <div className={styles.inputShell}>
                    <MapPin
                        size={15}
                        strokeWidth={2}
                        className={styles.icon}
                        aria-hidden="true"
                    />
                    <input
                        ref={inputRef}
                        type="text"
                        className={styles.input}
                        placeholder={placeholder ?? "Cerca via, piazza, corso..."}
                        value={query}
                        onChange={handleQueryChange}
                        disabled={disabled || isLoadingDetails}
                        aria-label="Cerca indirizzo"
                        aria-haspopup="listbox"
                        aria-expanded={showDropdown}
                        aria-autocomplete="list"
                        autoComplete="off"
                    />
                    {isLoading && <span className={styles.spinner} aria-hidden="true" />}
                </div>

                {showDropdown && (
                    <div
                        className={styles.dropdown}
                        role="listbox"
                        aria-label="Risultati ricerca indirizzo"
                    >
                        {isSearching && (
                            <div className={styles.dropdownMessage}>Ricerca in corso...</div>
                        )}

                        {!isSearching && error && (
                            <div className={styles.dropdownMessage}>{error}</div>
                        )}

                        {!isSearching && !error && results.length === 0 && (
                            <div className={styles.dropdownMessage}>Nessun risultato</div>
                        )}

                        {!isSearching && !error && results.map(place => (
                            <div
                                key={place.place_id}
                                className={styles.dropdownItem}
                                role="option"
                                aria-selected={false}
                                onClick={() => handleSelect(place)}
                            >
                                <span className={styles.dropdownItemName}>{place.name}</span>
                                <span className={styles.dropdownItemAddress}>{place.address}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {error && !showDropdown && (
                <span className={styles.errorMessage}>{error}</span>
            )}
            </>
            )}
        </div>
    );
}
