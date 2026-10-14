import { CalendarCheck, Globe, Receipt, Search, Star, type LucideIcon } from "lucide-react";
import type { RowKey } from "./andamentoRows";

/** L'icona di ogni riga (o voce) di Andamento. */
export const ROW_ICONS: Record<RowKey, LucideIcon> = {
    pagina: Globe,
    tavolo: Receipt,
    prenotazioni: CalendarCheck,
    recensioni: Star,
    ricerche: Search
};
