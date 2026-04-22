import { Check, Minus } from "lucide-react";
import styles from "../aiMenuImport.module.scss";

interface CheckboxProps {
    checked: boolean;
    indeterminate?: boolean;
    onChange: () => void;
    className?: string;
}

export function Checkbox({ checked, indeterminate, onChange, className }: CheckboxProps) {
    const cls = [
        styles.checkbox,
        checked ? styles.checkboxChecked : "",
        indeterminate && !checked ? styles.checkboxIndeterminate : "",
        className
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <button type="button" className={cls} onClick={onChange} role="checkbox" aria-checked={indeterminate ? "mixed" : checked}>
            {checked && <Check size={12} strokeWidth={3} />}
            {indeterminate && !checked && <Minus size={12} strokeWidth={3} />}
        </button>
    );
}
