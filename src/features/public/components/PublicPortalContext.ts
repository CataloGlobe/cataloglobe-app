import { createContext } from "react";

/**
 * Target DOM node per il portal dei PublicSheet. È un nodo plain (nessun
 * z-index/transform/filter → nessuno stacking context) montato DENTRO il
 * wrapper che porta le --pub-* (vedi PublicThemeScope) così il sheet portalato
 * eredita comunque il tema. Vive a livello del theme scope (fuori da
 * .tabPatternSurface) → il z-900 del sheet risolve nello stacking context del
 * root e il suo scrim copre la bottom-bar (z-150) su tutti i tab. `null` finché
 * il nodo non è montato: PublicSheet fa fallback al render in-place
 * (transitorio, gli sheet si aprono ben dopo il mount).
 *
 * Context in modulo dedicato (non in PublicThemeScope.tsx) per la regola
 * react-refresh/only-export-components: un file di componenti non deve
 * esportare anche un context.
 */
export const PublicPortalContext = createContext<HTMLElement | null>(null);
