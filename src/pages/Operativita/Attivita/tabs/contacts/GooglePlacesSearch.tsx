import React, { useState, useRef, useEffect, useCallback } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Button } from "@/components/ui/Button/Button";
import { supabase } from "@/services/supabase/client";
import styles from "./GooglePlacesSearch.module.scss";

type PlaceResult = {
    place_id: string;
    name: string;
    address: string;
    review_url: string;
};

interface GooglePlacesSearchProps {
    value: string;
    onChange: (url: string, place?: { name: string; address: string }) => void;
    location?: { latitude: number; longitude: number } | null;
}

export const GooglePlacesSearch: React.FC<GooglePlacesSearchProps> = ({
    value,
    onChange,
    location
}) => {
    const [mode, setMode] = useState<"current" | "search" | "selected">(
        value ? "current" : "search"
    );
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PlaceResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const search = useCallback(async (q: string) => {
        if (q.trim().length < 3) {
            setResults([]);
            setShowDropdown(false);
            return;
        }

        setIsSearching(true);
        setErrorMsg(null);

        try {
            const { data, error } = await supabase.functions.invoke(
                "search-google-places",
                { body: { query: q.trim(), ...(location && { location }) } }
            );

            if (error) throw error;

            const items = (data as { results: PlaceResult[] }).results;
            setResults(items);
            setShowDropdown(true);
        } catch {
            setErrorMsg("Errore durante la ricerca. Riprova.");
            setResults([]);
            setShowDropdown(true);
        } finally {
            setIsSearching(false);
        }
    }, [location]);

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

    const handleSelect = (place: PlaceResult) => {
        setSelectedPlace(place);
        setShowDropdown(false);
        setQuery("");
        setMode("selected");
        onChange(place.review_url, { name: place.name, address: place.address });
    };

    const handleReset = () => {
        setMode("search");
        setSelectedPlace(null);
        setQuery("");
        setResults([]);
        setErrorMsg(null);
    };

    const handleRemove = () => {
        setMode("search");
        setSelectedPlace(null);
        setQuery("");
        setResults([]);
        setErrorMsg(null);
        onChange("");
    };

    // ── Already saved URL ──────────────────────────────────
    if (mode === "current") {
        return (
            <div className={styles.wrapper}>
                <span className={styles.label}>Google Reviews</span>
                <div className={styles.currentUrl}>
                    <span className={styles.currentUrlText}>{value}</span>
                    <div className={styles.currentUrlActions}>
                        <Button variant="secondary" size="sm" onClick={handleReset}>
                            Cambia
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleRemove}>
                            Rimuovi
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Place selected (not yet saved) ─────────────────────
    if (mode === "selected" && selectedPlace) {
        return (
            <div className={styles.wrapper}>
                <span className={styles.label}>Google Reviews</span>
                <div className={styles.selectedCard}>
                    <div className={styles.selectedInfo}>
                        <span className={styles.selectedName}>{selectedPlace.name}</span>
                        <span className={styles.selectedAddress}>{selectedPlace.address}</span>
                    </div>
                    <span className={styles.selectedUrl}>{selectedPlace.review_url}</span>
                    <div className={styles.selectedActions}>
                        <Button variant="secondary" size="sm" onClick={handleReset}>
                            Cambia
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleRemove}>
                            Rimuovi
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Search mode ────────────────────────────────────────
    return (
        <div className={styles.wrapper}>
            <span className={styles.label}>Google Reviews</span>
            <div className={styles.dropdownAnchor} ref={dropdownRef}>
                <TextInput
                    placeholder="Cerca la tua attività su Google..."
                    value={query}
                    onChange={handleQueryChange}
                    helperText="Cerca il nome della tua attività per collegare le recensioni Google."
                />

                {showDropdown && (
                    <div className={styles.dropdown}>
                        {isSearching && (
                            <div className={styles.dropdownMessage}>
                                Ricerca in corso...
                            </div>
                        )}

                        {!isSearching && errorMsg && (
                            <div className={styles.dropdownMessage}>{errorMsg}</div>
                        )}

                        {!isSearching && !errorMsg && results.length === 0 && (
                            <div className={styles.dropdownMessage}>
                                Nessuna attività trovata. Prova con un nome diverso.
                            </div>
                        )}

                        {!isSearching && !errorMsg && results.map(place => (
                            <div
                                key={place.place_id}
                                className={styles.dropdownItem}
                                onClick={() => handleSelect(place)}
                            >
                                <span className={styles.dropdownItemName}>{place.name}</span>
                                <span className={styles.dropdownItemAddress}>{place.address}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
