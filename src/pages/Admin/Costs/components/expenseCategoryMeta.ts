import { Handshake, Laptop, Megaphone, Printer, Tag, type LucideIcon } from "lucide-react";
import type { CrmExpenseCategory } from "@/types/crm";

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
