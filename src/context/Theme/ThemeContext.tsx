import { createContext } from "react";

/** Il tema che si vede. */
export type Theme = "light" | "dark";

/**
 * La scelta della persona (Account › Aspetto, come nell'artifact della
 * navigazione approvato da Alex il 2026-10-09): come il sistema, chiaro o scuro.
 */
export type ThemePreference = "system" | Theme;

export interface ThemeContextType {
    /** Il tema che si vede: quello scelto, o quello del sistema. */
    theme: Theme;
    preference: ThemePreference;
    setPreference: (p: ThemePreference) => void;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
    theme: "light",
    preference: "light",
    setPreference: () => {},
    toggleTheme: () => {},
    setTheme: () => {}
});
