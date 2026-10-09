import { forwardRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { TextInput, type TextInputProps } from "@/components/ui/Input/TextInput";

type PasswordFieldProps = Omit<TextInputProps, "type" | "startAdornment" | "endAdornment" | "onEndAdornmentClick">;

/** Password delle pagine di accesso: lucchetto davanti e «mostra» in fondo. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
        <TextInput
            ref={ref}
            {...props}
            type={visible ? "text" : "password"}
            startAdornment={<Lock size={18} aria-hidden="true" />}
            endAdornment={visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            endAdornmentAriaLabel={visible ? "Nascondi la password" : "Mostra la password"}
            onEndAdornmentClick={() => setVisible(v => !v)}
        />
    );
});
