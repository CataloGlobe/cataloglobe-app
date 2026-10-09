import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Lock } from "lucide-react";

import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { PageHeaderSection } from "@/context/PageHeaderContext";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity } from "@/lib/permissions";
import { usePlanFeatures, type PlanFeature } from "@/lib/planFeatures";
import { SERVIZIO_MODES, modeAccess, type ModeAccess, type ServizioMode } from "@/utils/servizioModes";

/** Le pagine che «In servizio» tiene insieme (artifact v4, primo giro). */
export type InServizioPart = Exclude<ServizioMode, "sala"> | "prenotazioni" | "comande";

const LOCKED_HINT = "Disponibile con il piano Pro";

/** Prenotazioni e Comande: pagine a sé, con i gate delle loro voci (`navModel.ts`). */
const PAGES: ReadonlyArray<{ part: "prenotazioni" | "comande"; label: string; permission: string; feature: PlanFeature }> = [
    { part: "prenotazioni", label: "Prenotazioni", permission: "reservations.read", feature: "table_reservation" },
    { part: "comande", label: "Comande", permission: "orders.read", feature: "table_ordering" }
];

type Entry = { part: InServizioPart; label: string; access: Exclude<ModeAccess, "hidden"> };

export interface InServizioSwitch {
    /** L'interruttore per la testata; null se c'è una parte sola. */
    leading: ReactNode;
    /** Le stesse parti per la testata compatta del telefono. */
    sections: PageHeaderSection[] | undefined;
    onSectionChange: (value: string) => void;
}

/**
 * «In servizio» è Elenco, Mappa, Prenotazioni e Comande: un interruttore solo
 * in cima alle tre pagine (un secondo livello è un interruttore, mai altre
 * tab). Elenco e Mappa sono modi di Servizio (`onModeChange`, che chiude il
 * dettaglio aperto); Prenotazioni e Comande sono pagine della sede.
 */
export function useInServizioSwitch(
    current: InServizioPart | null,
    onModeChange?: (mode: Exclude<ServizioMode, "sala">) => void
): InServizioSwitch {
    const { activityId = "", businessId = "" } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();

    const entries = useMemo<Entry[]>(() => {
        if (!permissions) return [];
        const modes = SERVIZIO_MODES.filter(m => m.mode !== "sala").map(m => ({
            part: m.mode as InServizioPart,
            label: m.label,
            access: modeAccess(m, permissions, hasFeature, activityId)
        }));
        const pages = PAGES.map(p => ({
            part: p.part,
            label: p.label,
            access: (!canDoOnActivity(permissions, p.permission, activityId)
                ? "hidden"
                : hasFeature(p.feature)
                  ? "usable"
                  : "locked") as ModeAccess
        }));
        return [...modes, ...pages].filter((e): e is Entry => e.access !== "hidden");
    }, [permissions, hasFeature, activityId]);

    const go = useCallback(
        (part: InServizioPart) => {
            if (part === current) return;
            const base = `/business/${businessId}/locations/${activityId}`;
            if (part === "prenotazioni" || part === "comande") navigate(`${base}/${part}`);
            else if (onModeChange && (current === "elenco" || current === "mappa")) onModeChange(part);
            else navigate(`${base}/servizio?modo=${part}`);
        },
        [current, businessId, activityId, navigate, onModeChange]
    );

    const show = current !== null && entries.length > 1;

    const leading = useMemo(
        () =>
            show ? (
                <SegmentedControl<InServizioPart>
                    value={current}
                    onChange={go}
                    size="sm"
                    label="Parti di In servizio"
                    options={entries.map(e => ({
                        value: e.part,
                        label: e.label,
                        disabled: e.access === "locked",
                        ariaLabel: e.access === "locked" ? `${e.label}: ${LOCKED_HINT}` : undefined,
                        icon: e.access === "locked" ? <Lock size={14} strokeWidth={1.75} aria-hidden /> : undefined
                    }))}
                />
            ) : null,
        [show, current, go, entries]
    );

    const sections = useMemo<PageHeaderSection[] | undefined>(
        () =>
            show
                ? entries.map(e => ({
                      value: e.part,
                      label: e.label,
                      disabled: e.access === "locked",
                      description: e.access === "locked" ? LOCKED_HINT : undefined
                  }))
                : undefined,
        [show, entries]
    );

    const onSectionChange = useCallback((value: string) => go(value as InServizioPart), [go]);

    return { leading, sections, onSectionChange };
}
