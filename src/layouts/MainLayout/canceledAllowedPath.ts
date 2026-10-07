/**
 * Percorsi che un tenant disdetto (`subscription_status === "canceled"`) può
 * aprire senza essere rimandato ad Abbonamento.
 *
 * - `/settings/abbonamento`: la pagina di riattivazione (e il ritorno dopo il
 *   pagamento, anche prima che il webhook rimetta lo stato ad `active`).
 * - `/subscription`: il vecchio indirizzo, che rimanda lì tenendo la query.
 * - `/settings` esatto: i dati di fatturazione. `stripe-checkout` rifiuta la
 *   riattivazione con P.IVA non valida o senza SDI/PEC: senza questa pagina il
 *   disdetto non poteva correggerli e restava bloccato.
 */
export function isCanceledAllowedPath(pathname: string, tenantId: string): boolean {
    const path = pathname.replace(/\/+$/, "");
    return (
        path.endsWith("/settings/abbonamento") ||
        path.endsWith("/subscription") ||
        path === `/business/${tenantId}/settings`
    );
}
