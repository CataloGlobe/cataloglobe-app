import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
    DEFAULT_PERIOD,
    parsePeriod,
    type PeriodKey
} from "@/pages/Dashboard/Analytics/utils/periodComparison";

/** Le voci del periodo in Clienti e numeri (D154): uguali in Andamento e Recensioni. */
export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
    { value: "today", label: "Oggi" },
    { value: "7d", label: "7 giorni" },
    { value: "30d", label: "30 giorni" },
    { value: "90d", label: "90 giorni" },
    { value: "all", label: "Sempre" }
];

/**
 * Il periodo nell'indirizzo (`?period=`): il refresh non lo perde, si può
 * linkare e passando da Andamento a Recensioni resta lo stesso.
 */
export function usePeriodParam(): [PeriodKey, (next: PeriodKey) => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const period = parsePeriod(searchParams.get("period"));
    const setPeriod = useCallback(
        (next: PeriodKey) => {
            setSearchParams(
                prev => {
                    const params = new URLSearchParams(prev);
                    if (next === DEFAULT_PERIOD) params.delete("period");
                    else params.set("period", next);
                    return params;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );
    return [period, setPeriod];
}
