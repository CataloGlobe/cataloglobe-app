import { useTranslation } from "react-i18next";
import { useNow } from "@/hooks/useNow";
import { minutesUntil } from "@/services/translation/waiting";
import type { SidebarSignals } from "./sidebarItems";

/**
 * Le traduzioni in attesa dei 10 minuti come segnale della sidebar: il numero
 * e il titolo «N traduzioni in attesa · partono tra X min». Il titolo scorre
 * da solo (un render al minuto, solo finché c'è qualcosa in attesa).
 */
export function useTranslationWaitingSignal(
    waiting: { count: number; nextRunAt: string | null } | undefined
): Pick<SidebarSignals, "translationWaitingCount" | "translationWaitingLabel"> {
    const { t } = useTranslation("admin");
    const count = waiting?.count ?? 0;
    const now = useNow(60_000, count > 0);
    if (count === 0) return { translationWaitingCount: 0 };
    return {
        translationWaitingCount: count,
        translationWaitingLabel: t("sidebar.translations_waiting", {
            count,
            minutes: waiting?.nextRunAt ? minutesUntil(waiting.nextRunAt, now) : 10
        })
    };
}
