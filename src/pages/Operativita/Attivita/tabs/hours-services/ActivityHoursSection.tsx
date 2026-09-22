import React from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Switch } from "@/components/ui/Switch/Switch";
import type { V2ActivityHours } from "@/types/activity-hours";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface ActivityHoursSectionProps {
    hours: V2ActivityHours[];
    isLoading: boolean;
    hoursPublic: boolean;
    /** Interruttore immediato della visibilità pubblica; assente = sola lettura. */
    onHoursPublicChange?: (next: boolean) => void;
    isHoursPublicSaving?: boolean;
    onEditRequest?: () => void;
}

function describeDay(dayIndex: number, slots: V2ActivityHours[]): React.ReactNode {
    const open = slots.filter(s => !s.is_closed && s.opens_at && s.closes_at);
    if (slots.length === 0 || open.length === 0) return <Badge variant="neutral">Chiuso</Badge>;
    return open
        .sort((a, b) => a.slot_index - b.slot_index)
        .map((s, i) => (
            <React.Fragment key={s.id ?? i}>
                {i > 0 && " · "}
                {s.opens_at!.slice(0, 5)} – {s.closes_at!.slice(0, 5)}
                {s.closes_next_day && (
                    <>
                        {" "}
                        <Badge variant="neutral">→ {DAY_SHORT[(dayIndex + 1) % 7]}</Badge>
                    </>
                )}
            </React.Fragment>
        ));
}

/**
 * Card «Settimana» della pagina Orari (registro Sedi #54): la visibilità
 * pubblica è la prima riga, con l'interruttore nel trailing come ogni altro
 * controllo di riga; poi un `ListRow` per giorno con le fasce. Nella testata
 * resta solo «Modifica», che apre l'editor: un interruttore lì dentro
 * competeva con il bottone e si leggeva come un'azione sulla card.
 */
export const ActivityHoursSection: React.FC<ActivityHoursSectionProps> = ({
    hours,
    isLoading,
    hoursPublic,
    onHoursPublicChange,
    isHoursPublicSaving = false,
    onEditRequest
}) => {
    const byDay = new Map<number, V2ActivityHours[]>();
    for (const h of hours) {
        const list = byDay.get(h.day_of_week) ?? [];
        list.push(h);
        byDay.set(h.day_of_week, list);
    }
    const hasHours = hours.length > 0;
    const openDays = DAY_NAMES.filter((_, i) => (byDay.get(i) ?? []).some(s => !s.is_closed && s.opens_at)).length;

    return (
        <Card
            title="Settimana"
            subtitle={isLoading ? undefined : hasHours ? `${openDays} ${openDays === 1 ? "giorno aperto" : "giorni aperti"}` : "Nessun orario ancora"}
            actions={
                onEditRequest ? (
                    <Button variant="secondary" size="sm" onClick={onEditRequest}>
                        {hasHours ? "Modifica" : "Imposta orari"}
                    </Button>
                ) : undefined
            }
            flush={isLoading || hasHours}
        >
            {isLoading ? (
                DAY_NAMES.map(name => <ListRow key={name} loading />)
            ) : !hasHours ? (
                <EmptyState
                    variant="inline"
                    icon={<Clock />}
                    title="Nessun orario configurato"
                    description="Imposta gli orari per mostrarli nella pagina pubblica e per le prenotazioni."
                    action={
                        onEditRequest ? (
                            <Button variant="secondary" size="sm" onClick={onEditRequest}>
                                Imposta orari
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <>
                    <ListRow
                        title="Orari visibili sulla pagina pubblica"
                        subtitle={
                            hoursPublic
                                ? "Chi apre la pagina pubblica legge la settimana sotto il menù."
                                : "La settimana resta privata: serve alle prenotazioni, non si mostra."
                        }
                        wrapSubtitle
                        trailing={
                            <Switch
                                ariaLabel="Orari visibili sulla pagina pubblica"
                                size="sm"
                                checked={hoursPublic}
                                onChange={next => onHoursPublicChange?.(next)}
                                disabled={!onHoursPublicChange || isHoursPublicSaving}
                            />
                        }
                    />
                    {DAY_NAMES.map((name, i) => (
                        <ListRow key={name} title={name} subtitle={describeDay(i, byDay.get(i) ?? [])} />
                    ))}
                </>
            )}
        </Card>
    );
};
