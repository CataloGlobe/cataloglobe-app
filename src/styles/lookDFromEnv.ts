// Senza import: la leggono l'app (`lookD.ts`) e gli e2e (`e2e/lookD.ts`), che girano in Node.

/** Spenta con `false`, `0`, `off` o `no`, senza badare a maiuscole e spazi; acceso tutto il resto, anche niente. */
export function lookDFromEnv(value: string | undefined): boolean {
    return !/^(false|0|off|no)$/i.test((value ?? "").trim());
}
