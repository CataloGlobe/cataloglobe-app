import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Variabili E2E lette da `.env.e2e.local` (ignorato da git via `*.local`).
 * Nessuna dipendenza `dotenv`: parser minimo `KEY=valore`, `#` commenti.
 * Le variabili già presenti in `process.env` hanno la precedenza (CI).
 */
export const E2E_ENV_FILE = path.resolve(process.cwd(), ".env.e2e.local");
export const E2E_STORAGE_STATE = path.resolve(process.cwd(), "e2e/.auth/user.json");

export type E2eEnv = {
    email: string;
    password: string;
    /** Opzionale: se assente il test apre la prima azienda del workspace. */
    businessId?: string;
};

function parseEnvFile(file: string): Record<string, string> {
    if (!existsSync(file)) return {};
    const out: Record<string, string> = {};
    for (const raw of readFileSync(file, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

export function loadE2eEnv(): E2eEnv {
    const file = parseEnvFile(E2E_ENV_FILE);
    const get = (key: string) => process.env[key] ?? file[key];
    const email = get("E2E_EMAIL");
    const password = get("E2E_PASSWORD");
    if (!email || !password) {
        throw new Error(
            `E2E_EMAIL / E2E_PASSWORD mancanti. Crea ${E2E_ENV_FILE} con:\n` +
                "E2E_EMAIL=<email utente di test su staging>\n" +
                "E2E_PASSWORD=<password>\n" +
                "E2E_BUSINESS_ID=<uuid azienda, opzionale>"
        );
    }
    return { email, password, businessId: get("E2E_BUSINESS_ID") || undefined };
}
