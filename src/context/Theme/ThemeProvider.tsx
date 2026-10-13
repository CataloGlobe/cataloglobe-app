import { useEffect, useState, type ReactNode } from "react";
import { ThemeContext, type Theme, type ThemePreference } from "./ThemeContext";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Senza una scelta salvata si resta sul chiaro, come finora: lo scuro non è
 * mai uscito e va guardato pagina per pagina prima di seguire il sistema per
 * tutti.
 */
const DEFAULT_PREFERENCE: ThemePreference = "light";

function readPreference(): ThemePreference {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "system" || saved === "light" || saved === "dark") return saved;
    } catch {
        // Storage chiuso (navigazione privata): si resta sul predefinito.
    }
    return DEFAULT_PREFERENCE;
}

function systemTheme(): Theme {
    return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
    const [system, setSystem] = useState<Theme>(systemTheme);

    // «Come il sistema» segue il cambio del sistema anche a pagina aperta.
    useEffect(() => {
        const media = window.matchMedia?.(DARK_QUERY);
        if (!media) return;
        const onChange = () => setSystem(media.matches ? "dark" : "light");
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    const theme: Theme = preference === "system" ? system : preference;

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    const setPreference = (p: ThemePreference) => {
        setPreferenceState(p);
        try {
            localStorage.setItem(STORAGE_KEY, p);
        } catch {
            // Vale per questa visita.
        }
    };

    const setTheme = (t: Theme) => setPreference(t);
    const toggleTheme = () => setPreference(theme === "light" ? "dark" : "light");

    return (
        <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
