import React from "react";
import styles from "./FilterBar.module.scss";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { List, LayoutGrid, SlidersHorizontal, ChevronDown } from "lucide-react";

export type FilterBarProps = {
    search?: {
        value: string;
        onChange: (value: string) => void;
        placeholder?: string;
    };
    view?: {
        value: "list" | "grid";
        onChange: (value: "list" | "grid") => void;
    };
    advancedFilters?: React.ReactNode;
    activeFilters?: React.ReactNode;
    className?: string;
};

export default function FilterBar({
    search,
    view,
    advancedFilters,
    activeFilters,
    className
}: FilterBarProps) {
    const [isInternalOpen, setIsInternalOpen] = React.useState(false);

    // Only open if we have content to show
    const isOpen = Boolean(advancedFilters) && isInternalOpen;

    React.useEffect(() => {
        if (!advancedFilters && isInternalOpen) {
            setIsInternalOpen(false);
        }
    }, [advancedFilters, isInternalOpen]);

    const handleToggle = () => {
        setIsInternalOpen(prev => !prev);
    };

    return (
        <div className={`${styles.filterBar} ${isOpen ? styles.open : ""} ${className ?? ""}`}>
            <div className={styles.topRow}>
                {/* Search Input */}
                {search && (
                    <div className={styles.searchContainer}>
                        <SearchInput
                            value={search.value}
                            onChange={e => search.onChange(e.target.value)}
                            placeholder={search.placeholder ?? "Cerca..."}
                            allowClear
                            onClear={() => search.onChange("")}
                            // Custom styling for the "pill" look
                            inputClassName={styles.searchInput}
                            containerClassName={styles.searchInputContainer}
                        />
                    </div>
                )}

                <div className={styles.actions}>
                    {/* Filter Button - Only show if advancedFilters is provided */}
                    {advancedFilters && (
                        <Button
                            variant="outline"
                            leftIcon={<SlidersHorizontal size={16} />}
                            rightIcon={
                                <ChevronDown
                                    size={14}
                                    className={`${styles.chevron} ${isOpen ? styles.rotate : ""}`}
                                />
                            }
                            onClick={handleToggle}
                            className={`${styles.filterBtn} ${isOpen ? styles.active : ""}`}
                            aria-expanded={isOpen}
                            aria-controls="filterbar-advanced"
                        >
                            Filtra
                        </Button>
                    )}

                    {advancedFilters && view && <div className={styles.divider} />}

                    {/* View Toggle */}
                    {view && (
                        <div className={styles.viewToggle}>
                            <IconButton
                                icon={<LayoutGrid size={18} />}
                                aria-label="Vista griglia"
                                variant="ghost"
                                className={`${styles.toggleBtn} ${
                                    view.value === "grid" ? styles.active : ""
                                }`}
                                onClick={() => view.onChange("grid")}
                            />
                            <IconButton
                                icon={<List size={18} />}
                                aria-label="Vista lista"
                                variant="ghost"
                                className={`${styles.toggleBtn} ${
                                    view.value === "list" ? styles.active : ""
                                }`}
                                onClick={() => view.onChange("list")}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Active Filters Row */}
            {activeFilters && <div className={styles.activeFilters}>{activeFilters}</div>}

            {/* Expandable Area */}
            {isOpen && (
                <div id="filterbar-advanced" className={styles.expandedArea}>
                    <div className={styles.expandedContent}>{advancedFilters}</div>
                </div>
            )}
        </div>
    );
}
