// Server-side per-order ceilings. See FASE 2 plan TRANCHE 1 §1.3.
export const MAX_ORDER_TOTAL = 500;   // EUR
export const MAX_ORDER_LINES = 50;    // distinct line items

export type OrderCapCode = "ORDER_TOTAL_EXCEEDED" | "TOO_MANY_LINES";

export class OrderCapError extends Error {
  code: OrderCapCode;
  constructor(code: OrderCapCode, message: string) { super(message); this.code = code; }
}

export function enforceOrderCaps(totalAmount: number, lineCount: number): void {
  if (lineCount > MAX_ORDER_LINES) {
    throw new OrderCapError("TOO_MANY_LINES",
      `L'ordine supera il numero massimo di ${MAX_ORDER_LINES} prodotti distinti.`);
  }
  if (totalAmount > MAX_ORDER_TOTAL) {
    throw new OrderCapError("ORDER_TOTAL_EXCEEDED",
      `L'importo dell'ordine supera il massimo consentito di €${MAX_ORDER_TOTAL}.`);
  }
}
