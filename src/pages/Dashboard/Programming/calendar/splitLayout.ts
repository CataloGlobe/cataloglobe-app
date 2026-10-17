import type { RuleType } from "@/services/supabase/layoutScheduling";
import { NEW_MODEL } from "./calendarFlags";

/** Col modello nuovo menù e stile si aggiungono dal Calendario: il dettaglio non li modifica. */
export const addsFromCalendar = (type: RuleType) => NEW_MODEL.splitLayout && type === "layout";
