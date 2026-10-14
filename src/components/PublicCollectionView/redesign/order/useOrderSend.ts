import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SelectionItem } from "@components/PublicCollectionView/OrderingSheet/OrderingSheet";
import type { OrderingContext } from "../slots";
import { getSheetState, pushSheetPage, useSheetState } from "../sheets/sheetStack";
import { isBareTableNumber, ORDER_SENT_PREFIX, selectionTotal, type SendFailure } from "./orderSend";

/** Ciò che la conferma mostra dell'ordine appena inviato: le righe com'erano al tocco. */
export type SentReceipt = {
    orderId: string;
    lines: SelectionItem[];
    total: number;
};

/**
 * L'invio alla cucina, condiviso fra la pagina «Il tuo ordine» (avviso, esito)
 * e il suo piede (pulsante). Vive nel foglio: l'errore si spegne quando la
 * pagina rientra nella pila. Riuscito, spinge la conferma «Ordine N · Tavolo»
 * (mockup v38); `knownOrders` è quanti ordini il tavolo aveva già, per N.
 */
export function useOrderSend(ordering: OrderingContext | undefined, knownOrders: () => number | null) {
    const { t } = useTranslation("public");
    const [sending, setSending] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    // Piatti rifiutati dal server all'ultimo invio: le righe restano segnate finché il foglio è aperto.
    const [refused, setRefused] = useState<ReadonlySet<string>>(() => new Set());
    const [receipts, setReceipts] = useState<Record<string, SentReceipt>>({});
    // Due tocchi nello stesso frame vedono ancora `sending` falso: il ref no.
    const inFlight = useRef(false);
    const inStack = useSheetState().pages.some(page => page.key === "order");
    const [wasInStack, setWasInStack] = useState(inStack);
    if (inStack !== wasInStack) {
        setWasInStack(inStack);
        if (inStack) {
            setFailure(null);
            setRefused(new Set());
        }
    }
    // Tolti i piatti rifiutati, l'avviso non ha più niente da dire.
    if (refused.size > 0 && !ordering?.selection.some(line => refused.has(line.id))) {
        setRefused(new Set());
        setFailure(null);
    }

    const messageOf = (result: SendFailure): string => {
        switch (result.kind) {
            case "maintenance":
            case "closed":
                return result.message;
            case "session":
                return t("ordering.err_session_expired_table");
            case "items":
                return t("ordering.err_items_unavailable");
            case "empty":
                return t("ordering.err_empty_cart");
            case "other":
                return result.message ?? t("ordering.err_submit");
        }
    };

    const titleOf = (number: number | null): string => {
        const label = ordering?.tableLabel?.trim();
        const table = label ? (isBareTableNumber(label) ? t("order_sheet.table", { label }) : label) : null;
        if (number == null) return t("order_sheet.sent");
        return [t("order_sheet.order_title", { number }), table].filter(Boolean).join(" · ");
    };

    const send = async () => {
        if (!ordering || inFlight.current) return;
        inFlight.current = true;
        setSending(true);
        setFailure(null);
        // Le righe e il numero di prima: dopo l'invio la selezione è vuota.
        const lines = ordering.selection;
        const before = knownOrders();
        try {
            const result = await ordering.send();
            if (result.kind !== "sent") {
                setFailure(messageOf(result));
                if (result.kind === "items") setRefused(new Set(result.productIds));
                return;
            }
            setReceipts(prev => ({ ...prev, [result.orderId]: { orderId: result.orderId, lines, total: selectionTotal(lines) } }));
            // Solo se si è ancora su «Il tuo ordine»: chiuso il foglio nel frattempo, niente.
            if (getSheetState().pages.at(-1)?.key === "order") {
                pushSheetPage({
                    key: `${ORDER_SENT_PREFIX}${result.orderId}`,
                    title: titleOf(before == null ? null : before + 1),
                    size: "large"
                });
            }
        } finally {
            inFlight.current = false;
            setSending(false);
        }
    };

    return { sending, failure, refused, receipts, send };
}

export type OrderSendState = ReturnType<typeof useOrderSend>;
