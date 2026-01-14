import React, { forwardRef } from "react";
import { InputBase } from "./InputBase";
import styles from "./TextInput.module.scss";
import { Search } from "lucide-react";

export type SearchInputProps = Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "size"
> & {
    label?: string;
    helperText?: string;
    error?: string;

    /** Mostra il pulsante clear quando c’è valore */
    allowClear?: boolean;
    onClear?: () => void;

    /** Icona custom (default: search) */
    searchIcon?: React.ReactNode;

    containerClassName?: string;
    inputClassName?: string;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
    (
        {
            id,
            label,
            helperText,
            error,
            required,
            disabled,

            value,
            allowClear = true,
            onClear,
            searchIcon,

            containerClassName,
            inputClassName,
            className,
            ...props
        },
        ref
    ) => {
        const hasValue = value !== undefined && value !== "";

        return (
            <InputBase
                id={id}
                label={label}
                helperText={helperText}
                error={error}
                required={required}
                disabled={disabled}
                className={containerClassName}
            >
                {({ inputId, describedById, hasError, isDisabled }) => (
                    <div
                        className={`${styles.inputShell} ${hasError ? styles.hasError : ""} ${
                            isDisabled ? styles.isDisabled : ""
                        }`}
                    >
                        {/* SEARCH ICON */}
                        <div className={styles.startAdornment}>
                            {searchIcon ?? <Search size={16} />}
                        </div>

                        <input
                            ref={ref}
                            id={inputId}
                            type="search"
                            disabled={isDisabled}
                            value={value}
                            aria-invalid={hasError}
                            aria-describedby={describedById}
                            className={`${styles.input} ${inputClassName ?? className ?? ""}`}
                            {...props}
                        />

                        {/* CLEAR */}
                        {allowClear && hasValue && onClear && (
                            <button
                                type="button"
                                className={styles.endAction}
                                onClick={onClear}
                                aria-label="Cancella ricerca"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                )}
            </InputBase>
        );
    }
);

SearchInput.displayName = "SearchInput";
