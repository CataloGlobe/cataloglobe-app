import React, { useMemo } from "react";
import { CalendarOff, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";

const IT_MONTH_LONG = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
];

function parseDateStr(s: string): Date {
    return new Date(s + "T12:00:00");
}

function formatDate(dateStr: string, withYear: boolean): string {
    const d = parseDateStr(dateStr);
    return `${d.getDate()} ${IT_MONTH_LONG[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

function formatSlots(slots: ClosureSlot[]): string {
    return slots.map(s => `${s.opens_at}–${s.closes_at}`).join(", ");
}

function buildSubtitle(c: V2ActivityClosure, today: string): string {
    const withYear = c.closure_date.slice(0, 4) !== today.slice(0, 4);
    const dateStr = c.end_date
        ? `dal ${formatDate(c.closure_date, false)} al ${formatDate(c.end_date, withYear)}`
        : formatDate(c.closure_date, withYear);
    if (c.is_closed) return dateStr;
    return `${dateStr} · aperti ${c.slots ? formatSlots(c.slots) : ""}`;
}

function getTodayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

function isPast(c: V2ActivityClosure, today: string): boolean {
    return (c.end_date ?? c.closure_date) < today;
}

interface ActivityClosuresSectionProps {
    closures: V2ActivityClosure[];
    isLoading: boolean;
    onCreateRequest?: () => void;
    /** «Blocca una fascia»: chiusura parziale calcolata dagli orari del giorno. */
    onBlockRequest?: () => void;
    onEditRequest?: (closure: V2ActivityClosure) => void;
    onDeleteRequest?: (closure: V2ActivityClosure) => void;
}

/**
 * Card «Chiusure straordinarie» della pagina Orari (registro Sedi #56): le
 * future prima, poi le passate; una riga per chiusura con lo stato.
 */
export const ActivityClosuresSection: React.FC<ActivityClosuresSectionProps> = ({
    closures,
    isLoading,
    onCreateRequest,
    onBlockRequest,
    onEditRequest,
    onDeleteRequest
}) => {
    const today = getTodayISO();

    const sorted = useMemo(() => {
        const future = closures.filter(c => !isPast(c, today));
        const past = closures.filter(c => isPast(c, today));
        future.sort((a, b) => a.closure_date.localeCompare(b.closure_date));
        past.sort((a, b) => b.closure_date.localeCompare(a.closure_date));
        return [...future, ...past];
    }, [closures, today]);

    const hasRows = !isLoading && sorted.length > 0;

    return (
        <Card
            title="Chiusure straordinarie"
            subtitle={isLoading ? undefined : sorted.length > 0 ? `${sorted.length} · le future prima` : "Ferie, festività, orari speciali"}
            actions={
                <>
                    {onBlockRequest && (
                        <Button variant="ghost" size="sm" onClick={onBlockRequest}>
                            Blocca una fascia
                        </Button>
                    )}
                    {onCreateRequest && (
                        <Button variant="secondary" size="sm" onClick={onCreateRequest}>
                            Nuova chiusura
                        </Button>
                    )}
                </>
            }
            flush={isLoading || hasRows}
        >
            {isLoading ? (
                <>
                    <ListRow loading />
                    <ListRow loading />
                </>
            ) : sorted.length === 0 ? (
                <EmptyState
                    variant="inline"
                    icon={<CalendarOff />}
                    title="Nessuna chiusura programmata"
                    description="Una chiusura ha una data e, se vuoi, una data di fine o orari speciali propri."
                    action={
                        onCreateRequest ? (
                            <Button variant="secondary" size="sm" onClick={onCreateRequest}>
                                Nuova chiusura
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                sorted.map(c => {
                    const past = isPast(c, today);
                    const title = c.label ?? (c.is_closed ? "Chiusura" : "Orari speciali");
                    const actions = [
                        ...(onEditRequest ? [{ label: "Modifica", icon: Pencil, onClick: () => onEditRequest(c) }] : []),
                        ...(onDeleteRequest
                            ? [{ label: "Elimina", icon: Trash2, variant: "destructive" as const, onClick: () => onDeleteRequest(c) }]
                            : [])
                    ];
                    return (
                        <ListRow
                            key={c.id}
                            title={
                                <>
                                    {title}
                                    {!c.is_closed && (
                                        <>
                                            {" "}
                                            <Badge variant="neutral">Orari speciali</Badge>
                                        </>
                                    )}
                                </>
                            }
                            subtitle={buildSubtitle(c, today)}
                            muted={past}
                            meta={past ? <Badge variant="neutral">passata</Badge> : <Badge variant="success">programmata</Badge>}
                            trailing={actions.length > 0 ? <TableRowActions ariaLabel={`Azioni chiusura ${title}`} actions={actions} /> : undefined}
                            onClick={onEditRequest ? () => onEditRequest(c) : undefined}
                        />
                    );
                })
            )}
        </Card>
    );
};
