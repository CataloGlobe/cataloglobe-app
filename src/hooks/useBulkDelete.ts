import { useCallback, useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { isPostgrestFKError } from "@/utils/supabaseErrors";

type Nouns = { one: string; many: string; deletedOne: string; deletedMany: string };

type Options = {
    deleteOne: (id: string) => Promise<void>;
    /** Ricarica dopo l'esito, anche parziale. */
    onDone: () => Promise<void> | void;
    /** «1 ingrediente», «3 ingredienti»; «eliminato» / «eliminati». */
    nouns: Nouns;
    /** Il motivo di un rifiuto per vincolo (23503), detto nel toast. */
    blockedReason?: string;
};

/**
 * Eliminazione multipla con conferma (lotto Prodotti P1, come Menù #235): la
 * `BulkBar` chiede, il `ConfirmDialog` conferma, l'esito si dice per numero.
 * La selezione è controllata: annullare la rimette com'era.
 */
export function useBulkDelete({ deleteOne, onDone, nouns, blockedReason }: Options) {
    const { showToast } = useToast();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [pendingIds, setPendingIds] = useState<string[] | null>(null);

    const count = useCallback(
        (n: number) => `${n} ${n === 1 ? nouns.one : nouns.many}`,
        [nouns.one, nouns.many]
    );
    const verb = useCallback(
        (n: number) => (n === 1 ? nouns.deletedOne : nouns.deletedMany),
        [nouns.deletedOne, nouns.deletedMany]
    );

    const request = useCallback((ids: string[]) => setPendingIds(ids), []);

    const cancel = useCallback(() => {
        setPendingIds(prev => {
            if (prev) setSelectedIds(prev);
            return null;
        });
    }, []);

    const confirm = useCallback(async (): Promise<false> => {
        const ids = pendingIds ?? [];
        if (ids.length === 0) return false;
        const results = await Promise.allSettled(ids.map(id => deleteOne(id)));
        const ok = results.filter(r => r.status === "fulfilled").length;
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        const blocked = rejected.filter(r => isPostgrestFKError(r.reason)).length;
        const failed = rejected.length - blocked;

        if (ok > 0) showToast({ message: `${count(ok)} ${verb(ok)}.`, type: "success" });
        if (blocked > 0) {
            showToast({
                message: `${count(blocked)} non ${verb(blocked)}${blockedReason ? `: ${blockedReason}` : ""}.`,
                type: "error"
            });
        }
        if (failed > 0) {
            rejected.forEach(r => {
                if (!isPostgrestFKError(r.reason)) console.error("Eliminazione multipla:", r.reason);
            });
            showToast({ message: `${count(failed)} non ${verb(failed)} per errore.`, type: "error" });
        }
        setPendingIds(null);
        setSelectedIds([]);
        await onDone();
        return false;
    }, [pendingIds, deleteOne, showToast, count, verb, blockedReason, onDone]);

    return {
        selectedIds,
        setSelectedIds,
        request,
        pendingCount: pendingIds?.length ?? 0,
        dialog: {
            isOpen: pendingIds !== null,
            onClose: cancel,
            onConfirm: confirm,
            title: `Eliminare ${count(pendingIds?.length ?? 0)}?`,
            confirmLabel: `Elimina ${count(pendingIds?.length ?? 0)}`
        }
    };
}
