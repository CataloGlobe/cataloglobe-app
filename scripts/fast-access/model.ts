// Parte pura di fast-access (vedi cli.ts): argomenti, guardia «solo staging»,
// piano di cosa viene creato. Niente rete, niente env letti qui: si prova con
// vitest (src/tests/fastAccess.test.ts).

export const PLANS = ["base", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const SUBTYPES = ["restaurant", "bar", "pizzeria", "cafe"] as const;
export type Subtype = (typeof SUBTYPES)[number];

export type FastAccessOptions = {
    execute: boolean;
    email: string;
    name: string;
    activityName: string;
    slug: string;
    plan: Plan;
    seats: number;
    trialDays: number;
    subtype: Subtype;
};

export type ParseResult = { ok: true; options: FastAccessOptions } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Stesso formato del vincolo activities_slug_format / activities_slug_length.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Slug da un nome: minuscole, niente accenti, trattini singoli, max 60. */
export function slugify(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/g, "");
}

/** «prova-<nome>-<codice>», senza ripetere «prova» o il codice se il nome li ha già. */
export function defaultSlug(activityName: string, suffix: string): string {
    let slug = slugify(activityName);
    if (!slug.startsWith("prova")) slug = slugify(`prova-${slug}`);
    if (!slug.endsWith(suffix)) slug = slugify(`${slug.slice(0, 60 - suffix.length - 1)}-${suffix}`);
    return slug;
}

export function isValidSlug(slug: string): boolean {
    return slug.length >= 3 && slug.length <= 60 && SLUG_RE.test(slug) && !slug.includes("--");
}

function readFlag(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(`--${name}`);
    if (index < 0) return undefined;
    const value = argv[index + 1];
    return value === undefined || value.startsWith("--") ? "" : value;
}

function parseInteger(raw: string | undefined, fallback: number): number | null {
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) return null;
    return Number(raw);
}

/**
 * `--execute` scrive davvero; senza (o con `--dry-run`) stampa soltanto.
 * `suffix` rende unico lo slug di default (lo passa il CLI, casuale).
 */
export function parseArgs(argv: string[], suffix: string): ParseResult {
    const known = new Set([
        "execute",
        "dry-run",
        "email",
        "name",
        "activity-name",
        "slug",
        "plan",
        "seats",
        "trial-days",
        "subtype"
    ]);
    for (const token of argv) {
        if (token.startsWith("--") && !known.has(token.slice(2))) {
            return { ok: false, error: `opzione sconosciuta ${token}` };
        }
    }

    const execute = argv.includes("--execute");
    if (execute && argv.includes("--dry-run")) {
        return { ok: false, error: "--execute e --dry-run insieme: scegline uno" };
    }

    const email = readFlag(argv, "email");
    if (!email || !EMAIL_RE.test(email)) {
        return { ok: false, error: "serve --email con un indirizzo valido" };
    }

    const name = readFlag(argv, "name") || `Prova ${suffix}`;
    const activityName = readFlag(argv, "activity-name") || name;
    const slug = readFlag(argv, "slug") || defaultSlug(activityName, suffix);
    if (!isValidSlug(slug)) {
        return { ok: false, error: `slug non valido «${slug}» (3-60, a-z 0-9 e trattini singoli)` };
    }

    const plan = readFlag(argv, "plan") ?? "pro";
    if (!(PLANS as readonly string[]).includes(plan)) {
        return { ok: false, error: `--plan deve essere uno di: ${PLANS.join(", ")}` };
    }

    const subtype = readFlag(argv, "subtype") ?? "restaurant";
    if (!(SUBTYPES as readonly string[]).includes(subtype)) {
        return { ok: false, error: `--subtype deve essere uno di: ${SUBTYPES.join(", ")}` };
    }

    const seats = parseInteger(readFlag(argv, "seats"), 1);
    if (seats === null || seats < 1 || seats > 20) {
        return { ok: false, error: "--seats deve essere un intero da 1 a 20" };
    }

    const trialDays = parseInteger(readFlag(argv, "trial-days"), 30);
    if (trialDays === null || trialDays < 1 || trialDays > 90) {
        return { ok: false, error: "--trial-days deve essere un intero da 1 a 90" };
    }

    return {
        ok: true,
        options: {
            execute,
            email,
            name,
            activityName,
            slug,
            plan: plan as Plan,
            seats,
            trialDays,
            subtype: subtype as Subtype
        }
    };
}

export type StagingGuardInput = {
    /** SUPABASE_URL */
    url: string | undefined;
    /** SUPABASE_SERVICE_ROLE_KEY */
    serviceKey: string | undefined;
    /** STAGING_PROJECT_REF: il ref atteso, mai scritto nel codice. */
    stagingRef: string | undefined;
    /** PRODUCTION_PROJECT_REF, facoltativo: se c'è, un secondo no esplicito. */
    productionRef: string | undefined;
    /** Contenuto di supabase/.temp/project-ref, se il file c'è. */
    linkedRef: string | undefined;
};

export type StagingGuardResult = { ok: true; ref: string } | { ok: false; reasons: string[] };

/** Payload di una chiave JWT (chiavi legacy), o null se non è un JWT. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
        const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const payload: unknown = JSON.parse(json);
        return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/**
 * Si scrive solo se tutto dice staging: l'host dell'URL è `<STAGING_PROJECT_REF>.supabase.co`,
 * la chiave (se è un JWT) è service_role dello stesso ref, il ref non è quello di
 * produzione e la cartella, se collegata, è collegata a quel ref.
 */
export function checkStaging(input: StagingGuardInput): StagingGuardResult {
    const reasons: string[] = [];
    const stagingRef = input.stagingRef?.trim();
    const productionRef = input.productionRef?.trim();

    if (!stagingRef) reasons.push("manca STAGING_PROJECT_REF");
    if (!input.url) reasons.push("manca SUPABASE_URL");
    if (!input.serviceKey) reasons.push("manca SUPABASE_SERVICE_ROLE_KEY");
    if (reasons.length > 0 || !stagingRef || !input.url || !input.serviceKey) return { ok: false, reasons };

    if (productionRef && productionRef === stagingRef) {
        reasons.push("STAGING_PROJECT_REF è uguale a PRODUCTION_PROJECT_REF");
    }
    if (productionRef && input.url.includes(productionRef)) {
        reasons.push("SUPABASE_URL punta a produzione");
    }

    let host: string | null = null;
    try {
        const parsed = new URL(input.url);
        host = parsed.protocol === "https:" ? parsed.host : null;
    } catch {
        host = null;
    }
    if (host !== `${stagingRef}.supabase.co`) {
        reasons.push("SUPABASE_URL non è https://<STAGING_PROJECT_REF>.supabase.co");
    }

    const payload = decodeJwtPayload(input.serviceKey);
    if (payload) {
        if (payload.ref !== stagingRef) reasons.push("la chiave è di un altro progetto");
        if (payload.role !== "service_role") reasons.push("la chiave non è service_role");
    }

    const linkedRef = input.linkedRef?.trim();
    if (linkedRef && linkedRef !== stagingRef) {
        reasons.push("supabase/.temp/project-ref non è staging");
    }

    return reasons.length > 0 ? { ok: false, reasons } : { ok: true, ref: stagingRef };
}

export type PlannedRows = {
    tenant: {
        name: string;
        vertical_type: "food_beverage";
        business_subtype: Subtype;
        creation_idempotency_key: string;
        plan: Plan;
        paid_seats: number;
        billing_interval: "month";
        subscription_status: "trialing";
        trial_until: string;
    };
    activity: {
        name: string;
        slug: string;
        status: "active";
    };
};

/**
 * Le righe da scrivere, come il wizard (tenant + sede) più l'abbonamento di prova
 * senza Stripe: `trialing` con `trial_until`, `stripe_subscription_id` NULL. È lo
 * stato che il cron `expire-tenant-trials` porta a `past_due` alla scadenza.
 */
export function plannedRows(options: FastAccessOptions, now: Date): PlannedRows {
    const trialUntil = new Date(now.getTime() + options.trialDays * 24 * 60 * 60 * 1000);
    return {
        tenant: {
            name: options.name,
            vertical_type: "food_beverage",
            business_subtype: options.subtype,
            creation_idempotency_key: `fast-access:${options.slug}`,
            plan: options.plan,
            paid_seats: options.seats,
            billing_interval: "month",
            subscription_status: "trialing",
            trial_until: trialUntil.toISOString()
        },
        activity: {
            name: options.activityName,
            slug: options.slug,
            status: "active"
        }
    };
}

/** Il riepilogo che il dry-run stampa (e l'esecuzione prima di scrivere). */
export function describePlan(options: FastAccessOptions, rows: PlannedRows): string[] {
    return [
        `utente     ${options.email} (creato confermato se non esiste, verifica OTP di 30 giorni; se esiste si riusa)`,
        `azienda    «${rows.tenant.name}», ${rows.tenant.business_subtype}, owner l'utente sopra`,
        `prova      piano ${rows.tenant.plan}, ${rows.tenant.paid_seats} sede/i, trialing fino al ${rows.tenant.trial_until.slice(0, 10)}, senza Stripe`,
        `sede       «${rows.activity.name}», slug ${rows.activity.slug}, online`
    ];
}
