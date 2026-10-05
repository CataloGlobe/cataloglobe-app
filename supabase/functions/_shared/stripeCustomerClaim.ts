/**
 * Salvataggio del customer Stripe appena creato, senza doppioni.
 *
 * Due checkout partiti insieme per lo stesso tenant (doppio clic, due
 * schede) vedono entrambi `stripe_customer_id` NULL e creano due customer.
 * Prima vinceva l'ultimo UPDATE e il primo customer restava orfano su
 * Stripe, magari con l'abbonamento appeso sopra.
 *
 * Qui l'UPDATE è condizionato a `stripe_customer_id IS NULL`: lo scrive solo
 * il primo. Chi perde rilegge il customer del vincitore, usa quello e
 * cancella il proprio (best-effort: un orfano senza abbonamento non costa
 * nulla, un checkout bloccato sì).
 *
 * Dipendenze iniettate: la edge passa Supabase e Stripe, i test dei finti.
 */

export interface StripeCustomerClaimDeps {
    /** UPDATE tenants SET stripe_customer_id = id WHERE id = tenant AND stripe_customer_id IS NULL. */
    saveIfEmpty: (customerId: string) => Promise<{ saved: boolean; error: string | null }>;
    /** Rilettura di tenants.stripe_customer_id dopo un UPDATE che non ha scritto. */
    readCurrent: () => Promise<{ customerId: string | null; error: string | null }>;
    /** Cancellazione del customer creato in più. */
    deleteCustomer: (customerId: string) => Promise<void>;
}

export type StripeCustomerClaimResult =
    | { kind: "ok"; customerId: string; lostRace: boolean }
    | { kind: "db_error"; message: string };

export async function claimStripeCustomer(
    createdCustomerId: string,
    deps: StripeCustomerClaimDeps
): Promise<StripeCustomerClaimResult> {
    const save = await deps.saveIfEmpty(createdCustomerId);
    if (save.error) return { kind: "db_error", message: save.error };
    if (save.saved) return { kind: "ok", customerId: createdCustomerId, lostRace: false };

    const current = await deps.readCurrent();
    if (current.error) return { kind: "db_error", message: current.error };
    if (!current.customerId) {
        // Nessuno ha scritto ma l'UPDATE non ha toccato righe: tenant sparito
        // o stato inatteso. Meglio fermarsi che usare un customer non salvato.
        return { kind: "db_error", message: "stripe_customer_id not saved and still empty" };
    }

    try {
        await deps.deleteCustomer(createdCustomerId);
    } catch {
        // Best-effort: l'orfano resta senza abbonamento, il checkout va avanti.
    }
    return { kind: "ok", customerId: current.customerId, lostRace: true };
}
