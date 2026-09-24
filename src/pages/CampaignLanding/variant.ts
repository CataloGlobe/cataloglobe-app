import { createContext, useContext } from "react";

/**
 * Variante della landing di campagna: `form` (lead via «Parliamone») o
 * `signup` (self-service via «Provalo gratis»).
 *
 * Context locale, non provider di app-shell: lo monta solo `LandingPage`, lo
 * leggono solo `LandingCta` (e in Passata 1 la sezione 10). Le sezioni non
 * ricevono `variante` come prop: non hanno motivo di sapere in che variante
 * sono, e passarla a mano è il retrofit da evitare.
 */
export type Variante = "form" | "signup";

export const LandingVariantContext = createContext<Variante>("form");

export const useLandingVariant = (): Variante => useContext(LandingVariantContext);
