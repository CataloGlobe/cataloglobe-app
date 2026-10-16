import { Handshake, Laptop, Megaphone, Printer, Tag, type LucideIcon } from "lucide-react";
import type { CrmExpense, CrmExpenseCategory } from "@/types/crm";

/**
 * Icona e nome corto di ogni tipo di spesa: gli stessi nel form, sulle righe
 * e nella legenda di «Mese per mese», così l'icona si riconosce dal nome
 * (Alex, 2026-10-16: le icone devono dire il tipo di spesa).
 */
export const CATEGORY_META: Record<CrmExpenseCategory, { icon: LucideIcon; label: string }> = {
    software: { icon: Laptop, label: "Software" },
    advertising: { icon: Megaphone, label: "Pubblicità" },
    services: { icon: Handshake, label: "Servizi" },
    hardware: { icon: Printer, label: "Attrezzatura" },
    other: { icon: Tag, label: "Altro" }
};

/** Che cosa è una riga: abbonamento mensile o annuale, una tantum, movimento fra voi. */
export type RowKind = "month" | "year" | "one_off" | "move";

export function expenseKind(expense: CrmExpense): RowKind {
    if (expense.kind !== "subscription") return "one_off";
    return expense.billing_interval === "year" ? "year" : "month";
}
