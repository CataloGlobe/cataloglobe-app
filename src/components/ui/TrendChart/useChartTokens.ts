import { useEffect, useState } from "react";

export interface ChartTokens {
    brand: string;
    brandSoft: string;
    border: string;
    textMuted: string;
    surface: string;
}

const NAMES: Record<keyof ChartTokens, string> = {
    brand: "--brand-primary",
    brandSoft: "--brand-primary-soft",
    border: "--border",
    textMuted: "--text-muted",
    surface: "--surface"
};

function read(): ChartTokens {
    const cs = getComputedStyle(document.documentElement);
    const out = {} as ChartTokens;
    (Object.keys(NAMES) as (keyof ChartTokens)[]).forEach(k => {
        out[k] = cs.getPropertyValue(NAMES[k]).trim();
    });
    return out;
}

/**
 * I colori del grafico dai token del tema. Recharts scrive attributi SVG,
 * non CSS: var() lì non è garantito, quindi si leggono i valori risolti e si
 * rileggono quando cambia `data-theme` sulla radice.
 */
export function useChartTokens(): ChartTokens {
    const [tokens, setTokens] = useState<ChartTokens>(read);
    useEffect(() => {
        const obs = new MutationObserver(() => setTokens(read()));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
        return () => obs.disconnect();
    }, []);
    return tokens;
}
