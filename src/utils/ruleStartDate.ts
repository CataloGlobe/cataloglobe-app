/**
 * La data di inizio di una regola non può essere nel passato — ma solo quando
 * la si sceglie: alla creazione o se cambia. Una regola già partita ha per
 * forza l'inizio nel passato, e deve restare salvabile (rinominarla, cambiare
 * i prodotti, spostarne la fine).
 *
 * Date come stringhe `YYYY-MM-DD` locali (quelle del form): il confronto
 * lessicografico coincide con quello cronologico.
 *
 * @param startAt        data di inizio nel form
 * @param initialStartAt data di inizio salvata quando la pagina si è aperta ("" se assente)
 * @param today          oggi, `YYYY-MM-DD`
 */
export function isStartDateInPast(startAt: string, initialStartAt: string, today: string): boolean {
    if (!startAt || startAt === initialStartAt) return false;
    return startAt < today;
}
