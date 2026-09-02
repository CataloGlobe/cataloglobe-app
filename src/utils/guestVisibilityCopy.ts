// Come si scrivono i numeri della rubrica clienti.
//
// IL PROBLEMA CHE QUESTO FILE RISOLVE
// Le view della rubrica sono `security_invoker`: le visite sono filtrate riga
// per riga dalla RLS di `reservations`. Sullo stesso profilo l'owner legge 7
// visite e un manager assegnato a una sola sede ne legge 3. Nessuno dei due
// numeri è sbagliato — sono risposte a domande diverse.
//
// Stampare "3 visite" a un manager senza dire rispetto a cosa è però una
// bugia per omissione, e porta a decisioni sbagliate: un cliente con 5 assenze
// che al manager ne risulta 1 viene trattato come un cliente affidabile.
//
// Regola: OGNI numero della rubrica mostrato a un ruolo activity-scoped porta
// con sé l'ambito. Owner e admin vedono l'intera azienda e non hanno bisogno
// della precisazione (dirgliela sarebbe rumore).
//
// LESSICO — mai "no-show". L'agenda chiama quello stato "Non presentato" e la
// rubrica usa "assenze" per il conteggio: due parole per la stessa cosa
// confondono più del gergo. Il termine inglese resta solo nei nomi di colonna
// del database (`visible_no_shows`), che non arrivano all'utente.
//
// `tenantWide` arriva da `isTenantWide(permissions)` (src/lib/permissions.ts).

/** Suffisso da appendere a un conteggio. Vuoto per owner/admin. */
export function visitScopeSuffix(tenantWide: boolean): string {
    return tenantWide ? "" : " nelle tue sedi";
}

/** "7 visite" per owner/admin, "3 visite nelle tue sedi" per gli altri. */
export function formatVisitCount(visits: number, tenantWide: boolean): string {
    const noun = visits === 1 ? "visita" : "visite";
    return `${visits} ${noun}${visitScopeSuffix(tenantWide)}`;
}

/**
 * "2 assenze" / "1 assenza", con l'ambito quando serve.
 *
 * In elenco compare solo se > 0 (una pill "0 assenze" su ogni riga renderebbe
 * invisibile il caso che conta), ma la funzione formatta anche lo zero: nella
 * scheda il valore va mostrato comunque, perché lì l'assenza di assenze è
 * un'informazione.
 */
export function formatAbsenceCount(absences: number, tenantWide: boolean): string {
    const noun = absences === 1 ? "assenza" : "assenze";
    return `${absences} ${noun}${visitScopeSuffix(tenantWide)}`;
}

/**
 * "Cliente dal" — mese e anno della prima visita visibile.
 *
 * Solo mese e anno: il giorno esatto della prima prenotazione non serve a
 * nessuna decisione, e un formato lungo competerebbe con i due numeri accanto.
 */
export function formatCustomerSince(isoDate: string | null): string {
    if (!isoDate) return "—";
    const [y, m] = isoDate.split("-").map(n => parseInt(n, 10));
    if (!y || !m) return "—";
    return new Intl.DateTimeFormat("it-IT", {
        month: "long",
        year: "numeric"
    }).format(new Date(y, m - 1, 1));
}

/**
 * Nota estesa, da mettere una volta per schermata (non su ogni numero).
 * Spiega perché due colleghi possono leggere numeri diversi sullo stesso
 * cliente, così la differenza non viene scambiata per un errore del sistema.
 */
export function visibilityFootnote(tenantWide: boolean): string | null {
    if (tenantWide) return null;
    return "I conteggi riguardano solo le sedi a cui hai accesso: sullo stesso cliente un collega con più sedi può vedere più visite.";
}
