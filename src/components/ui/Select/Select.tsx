import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { LOOK_D } from "@styles/lookD";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { FormField } from "../FormField/FormField";
import menuStyles from "../Menu/Menu.module.scss";
import styles from "./Select.module.scss";

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
    label?: string;
    tooltip?: React.ReactNode;
    helperText?: string;
    error?: string;
    options?: SelectOption[];
    children?: React.ReactNode;

    containerClassName?: string;
    selectClassName?: string;
}

/** Una voce della tendina, con il gruppo (`<optgroup>`) a cui appartiene. */
type Choice = SelectOption & { group?: string };

function textOf(node: React.ReactNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
    return "";
}

type OptionLike = { children?: React.ReactNode; value?: unknown; disabled?: boolean; label?: string };

/** Le voci da `options` o dai figli `<option>`/`<optgroup>`, come le leggerebbe il `<select>`. */
function readChoices(options: SelectOption[] | undefined, children: React.ReactNode, group?: string): Choice[] {
    if (options) return options;
    const out: Choice[] = [];
    React.Children.forEach(children, child => {
        if (!React.isValidElement<OptionLike>(child)) return;
        if (child.type === "optgroup") {
            out.push(...readChoices(undefined, child.props.children, child.props.label));
        } else if (child.type === "option") {
            const label = textOf(child.props.children);
            const value = child.props.value == null ? label : String(child.props.value);
            out.push({ value, label, disabled: child.props.disabled, group });
        } else if (child.type === React.Fragment) {
            out.push(...readChoices(undefined, child.props.children, group));
        }
    });
    return out;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    (
        {
            id,
            label,
            tooltip,
            helperText,
            error,
            required,
            disabled,
            options,
            children,
            containerClassName,
            selectClassName,
            className,
            ...props
        },
        ref
    ) => {
        // Nella D la tendina è quella di CataloGlobe (copia «Visual Redesign PR 3»,
        // `.dd.f`), mai quella di sistema (decisione di Alex del 2026-10-16). Il
        // `<select>` vero resta sotto, nascosto, e tiene il valore: chi lo usa
        // (onChange, ref, name nei moduli) non cambia. `multiple` resta nativo.
        if (LOOK_D && !props.multiple) {
            return (
                <SelectD
                    ref={ref}
                    id={id}
                    label={label}
                    tooltip={tooltip}
                    helperText={helperText}
                    error={error}
                    required={required}
                    disabled={disabled}
                    options={options}
                    containerClassName={containerClassName}
                    selectClassName={selectClassName ?? className}
                    {...props}
                >
                    {children}
                </SelectD>
            );
        }
        return (
            <FormField
                id={id}
                label={label}
                tooltip={tooltip}
                helperText={helperText}
                error={error}
                required={required}
                disabled={disabled}
                className={containerClassName}
            >
                {({ inputId, describedById, hasError, isDisabled }) => (
                    <div
                        className={`${styles.selectWrapper} ${hasError ? styles.hasError : ""} ${
                            isDisabled ? styles.disabled : ""
                        }`}
                    >
                        <select
                            ref={ref}
                            id={inputId}
                            disabled={isDisabled}
                            aria-invalid={hasError}
                            aria-required={required || undefined}
                            aria-describedby={describedById}
                            className={`${styles.select} ${selectClassName ?? className ?? ""}`}
                            {...props}
                        >
                            {options
                                ? options.map(opt => (
                                      <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                                          {opt.label}
                                      </option>
                                  ))
                                : children}
                        </select>

                        <div className={styles.caret} aria-hidden="true">
                            <ChevronDown size={16} />
                        </div>
                    </div>
                )}
            </FormField>
        );
    }
);

Select.displayName = "Select";

/**
 * La tendina della D: un pulsante (ruolo combobox, col nome dell'etichetta e
 * il valore scelto come testo) che apre il pannello `.pop` della copia, con la
 * spunta sulla voce scelta; sotto i 641 px il pannello è un foglio al centro
 * sopra un velo, come i menù. Scegliere una voce imposta il valore sul
 * `<select>` nascosto e manda il suo evento `change`, così l'`onChange` di chi
 * usa il Select resta quello di sempre.
 */
const SelectD = forwardRef<HTMLSelectElement, Omit<SelectProps, "className">>(
    (
        {
            id,
            label,
            tooltip,
            helperText,
            error,
            required,
            disabled,
            options,
            children,
            containerClassName,
            selectClassName,
            "aria-label": ariaLabel,
            "aria-labelledby": ariaLabelledBy,
            title,
            onChange,
            onFocus,
            onBlur,
            autoFocus,
            ...props
        },
        ref
    ) => {
        const nativeRef = useRef<HTMLSelectElement | null>(null);
        const setRefs = useCallback(
            (el: HTMLSelectElement | null) => {
                nativeRef.current = el;
                if (typeof ref === "function") ref(el);
                else if (ref) ref.current = el;
            },
            [ref]
        );
        const choices = readChoices(options, children);
        const [inner, setInner] = useState<string | undefined>(
            props.defaultValue == null ? undefined : String(props.defaultValue)
        );
        const controlled = props.value !== undefined;
        const firstEnabled = choices.find(c => !c.disabled)?.value;
        const current = controlled ? String(props.value ?? "") : (inner ?? firstEnabled ?? "");
        const chosen = choices.find(c => c.value === current);
        const sheet = useMediaQuery("(max-width: 640px)");

        // Senza `value` il valore sta nel `<select>` nascosto: un reset del
        // modulo lo cambia senza `change`, e il pulsante lo segue da qui.
        useEffect(() => {
            const form = nativeRef.current?.form;
            if (!form || controlled) return;
            const onReset = () => window.setTimeout(() => setInner(nativeRef.current?.value));
            form.addEventListener("reset", onReset);
            return () => form.removeEventListener("reset", onReset);
        }, [controlled]);

        const pick = (value: string) => {
            const el = nativeRef.current;
            if (!el || value === current) return;
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
            el.dispatchEvent(new Event("change", { bubbles: true }));
        };

        // Le voci in ordine, col titolo del gruppo dove il gruppo cambia.
        const rows: React.ReactNode[] = [];
        let lastGroup: string | undefined;
        choices.forEach(c => {
            if (c.group && c.group !== lastGroup) {
                rows.push(
                    <RadixDropdownMenu.Label key={`g-${c.group}-${c.value}`} className={styles.groupLabel}>
                        {c.group}
                    </RadixDropdownMenu.Label>
                );
            }
            lastGroup = c.group;
            rows.push(
                <RadixDropdownMenu.RadioItem
                    key={c.value}
                    value={c.value}
                    disabled={c.disabled}
                    role="option"
                    aria-selected={c.value === current}
                    className={`${menuStyles.item} ${styles.option}`}
                >
                    <span className={styles.optionText}>{c.label}</span>
                    <Check className={styles.check} size={15} strokeWidth={2.4} aria-hidden="true" />
                </RadixDropdownMenu.RadioItem>
            );
        });

        return (
            <FormField
                id={id}
                label={label}
                tooltip={tooltip}
                helperText={helperText}
                error={error}
                required={required}
                disabled={disabled}
                className={containerClassName}
            >
                {({ inputId, describedById, hasError, isDisabled }) => (
                    <div
                        className={`${styles.selectWrapper} ${hasError ? styles.hasError : ""} ${
                            isDisabled ? styles.disabled : ""
                        }`}
                    >
                        <select
                            ref={setRefs}
                            className="visually-hidden"
                            aria-hidden="true"
                            tabIndex={-1}
                            disabled={isDisabled}
                            required={required}
                            onChange={e => {
                                if (!controlled) setInner(e.target.value);
                                onChange?.(e);
                            }}
                            {...props}
                        >
                            {choices.map(c => (
                                <option key={c.value} value={c.value} disabled={c.disabled}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                        <RadixDropdownMenu.Root>
                            <RadixDropdownMenu.Trigger asChild disabled={isDisabled}>
                                <button
                                    type="button"
                                    id={inputId}
                                    role="combobox"
                                    aria-haspopup="listbox"
                                    aria-label={ariaLabel}
                                    aria-labelledby={ariaLabelledBy}
                                    aria-invalid={hasError || undefined}
                                    aria-required={required || undefined}
                                    aria-describedby={describedById}
                                    title={title}
                                    autoFocus={autoFocus}
                                    onFocus={onFocus as React.FocusEventHandler<HTMLElement> | undefined}
                                    onBlur={onBlur as React.FocusEventHandler<HTMLElement> | undefined}
                                    className={`${styles.trigger} ${selectClassName ?? ""}`}
                                >
                                    <span className={styles.value}>{chosen?.label ?? ""}</span>
                                    <ChevronDown className={styles.triggerCaret} size={16} aria-hidden="true" />
                                </button>
                            </RadixDropdownMenu.Trigger>
                            <RadixDropdownMenu.Portal>
                                <RadixDropdownMenu.Content
                                    role="listbox"
                                    aria-label={ariaLabel ?? label}
                                    align="start"
                                    sideOffset={6}
                                    className={`${menuStyles.content} ${styles.pop} ${sheet ? menuStyles.sheet : ""}`}
                                >
                                    <RadixDropdownMenu.RadioGroup value={current} onValueChange={pick}>
                                        {rows}
                                    </RadixDropdownMenu.RadioGroup>
                                </RadixDropdownMenu.Content>
                            </RadixDropdownMenu.Portal>
                        </RadixDropdownMenu.Root>
                    </div>
                )}
            </FormField>
        );
    }
);

SelectD.displayName = "SelectD";
