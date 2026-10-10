/**
 * Interruttore del redesign della pagina pubblica (VITE_PUBLIC_REDESIGN).
 *
 * Acceso solo su staging; in produzione resta la pagina di oggi fino all'ultima
 * PR del piano. Letto in un posto solo: Vite sostituisce `import.meta.env` al
 * build, quindi con il flag spento il ramo del redesign è codice morto e non
 * entra nel bundle (lo prova `npm run public:budget:check`).
 */
export const PUBLIC_REDESIGN_ENABLED = import.meta.env.VITE_PUBLIC_REDESIGN === "true";
