import type { Review } from "@/types/database";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";

/**
 * La coda di moderazione di Recensioni (§34.9/1, lotto `ds-5-moderazione`):
 * parole, stati e azioni, puri. La pagina compone; qui si decide cosa dire e
 * cosa si può fare su una recensione.
 */

export type ReviewStatus = Review["status"];

/** L'ambra è dello stato che chiede un gesto (§34.9/4); le altre due sono parole. */
export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; variant: StatusBadgeVariant }> = {
    pending: { label: "In attesa", variant: "warning" },
    approved: { label: "Pubblicata", variant: "success" },
    hidden: { label: "Nascosta", variant: "neutral" }
};

/**
 * Cosa vuol dire la coda. Onesta (Q1 del censimento): la pagina pubblica
 * oggi non mostra recensioni, quindi «pubblicare» decide il riepilogo, non
 * cosa vede un cliente.
 */
export const QUEUE_EXPLANATION =
    "Le recensioni arrivano sempre in attesa. Quelle che pubblichi entrano nel riepilogo dei voti; " +
    "quelle che tieni nascoste restano fuori, e si possono eliminare.";

/** Filtro dell'elenco sotto la coda: le in attesa stanno nella coda, non qui. */
export type ListFilter = "all" | "approved" | "hidden";

const DAY_MS = 86_400_000;

/** Giorni interi passati dall'arrivo. */
export function waitingDays(createdAt: string, now: number): number {
    return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / DAY_MS));
}

function sinceLabel(days: number): string {
    if (days === 0) return "da oggi";
    return days === 1 ? "da 1 giorno" : `da ${days} giorni`;
}

/** «1 recensione in attesa da 23 giorni» · «3 recensioni in attesa, la prima da 7 giorni». */
export function queueTitle(count: number, oldestDays: number): string {
    if (count === 1) return `1 recensione in attesa ${sinceLabel(oldestDays)}`;
    return `${count} recensioni in attesa, la prima ${sinceLabel(oldestDays)}`;
}

/**
 * Le in attesa (la più vecchia per prima: si moderano nell'ordine in cui sono
 * arrivate) e le altre, nell'ordine ricevuto.
 */
export function splitByStatus(reviews: readonly Review[]): { pending: Review[]; others: Review[] } {
    const pending = reviews
        .filter(r => r.status === "pending")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const others = reviews.filter(r => r.status !== "pending");
    return { pending, others };
}

export type ModerationAction = "publish" | "hide" | "delete";

/**
 * Le azioni di una riga. Il distruttivo viene dopo il reversibile (§34.9/2):
 * Elimina solo su una nascosta, e solo con `reviews.delete`.
 */
export function rowActions(
    status: ReviewStatus,
    { canModerate, canDelete }: { canModerate: boolean; canDelete: boolean }
): ModerationAction[] {
    switch (status) {
        case "pending":
            return canModerate ? ["publish", "hide"] : [];
        case "approved":
            return canModerate ? ["hide"] : [];
        case "hidden":
            return [...(canModerate ? (["publish"] as const) : []), ...(canDelete ? (["delete"] as const) : [])];
    }
}

/** Il nuovo stato di un'azione reversibile. */
export const ACTION_STATUS: Record<Exclude<ModerationAction, "delete">, Exclude<ReviewStatus, "pending">> = {
    publish: "approved",
    hide: "hidden"
};

/** Il toast del successo; l'errore va nel banner della pagina. */
export const STATUS_CHANGE_TOAST: Record<Exclude<ReviewStatus, "pending">, { success: string; error: string }> = {
    approved: {
        success: "Recensione pubblicata",
        error: "Non è stato possibile pubblicare la recensione. Riprova."
    },
    hidden: {
        success: "Recensione nascosta",
        error: "Non è stato possibile nascondere la recensione. Riprova."
    }
};
