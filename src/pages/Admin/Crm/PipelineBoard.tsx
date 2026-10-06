import { useState } from "react";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent
} from "@dnd-kit/core";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { crmAccountLabel } from "@/utils/crm/accountLabels";
import { CRM_STAGE_LABEL } from "@/utils/crm/stages";
import type { ContactLine } from "@/utils/crm/leadViews";
import { initials, PIPELINE_STAGES } from "@/utils/crm/leadViews";
import type { CrmStage, CrmVenueListItem } from "@/types/crm";
import styles from "./Leads.module.scss";

/**
 * Le colonne dei lead (canvas R4a): nove fasi da Nuovo a Pagante, Perso è un
 * filtro. Carte corte (nome, città con l'attesa o l'appuntamento, chi lo
 * segue); il bordo arancio vuol dire «fermo da troppo». Dopo cinque carte
 * «+ altri N» apre la colonna.
 *
 * Si trascina una carta in un'altra colonna (la pagina decide con `onMove`:
 * fase bloccata, conferma). Clic sulla carta = scheda del locale. Da
 * tastiera: Tab sulla carta, spazio per prenderla, frecce, spazio per lasciarla.
 * Nessuno stile inline: si muove la copia nel DragOverlay.
 */

const COLUMN_LIMIT = 5;

/** «Pagante» nella testata della colonna: «Cliente pagante» non ci sta. */
const COLUMN_LABEL: Partial<Record<CrmStage, string>> = { cliente_pagante: "Pagante" };

type CardInfo = {
    meta: (venue: CrmVenueListItem) => ContactLine;
    teamName: (userId: string | null) => string | null;
};

type Props = CardInfo & {
    venues: CrmVenueListItem[];
    onMove: (venue: CrmVenueListItem, stage: CrmStage) => void;
    onOpen: (venueId: string) => void;
};

export function PipelineBoard({ venues, meta, teamName, onMove, onOpen }: Props) {
    const [dragging, setDragging] = useState<CrmVenueListItem | null>(null);
    const sensors = useSensors(
        // 6 px prima di iniziare il trascinamento: sotto è un clic.
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor)
    );

    function handleDragStart(event: DragStartEvent) {
        setDragging(venues.find(v => v.id === event.active.id) ?? null);
    }

    function handleDragEnd(event: DragEndEvent) {
        setDragging(null);
        const venue = venues.find(v => v.id === event.active.id);
        const stage = event.over?.id as CrmStage | undefined;
        if (venue && stage && stage !== venue.stage) onMove(venue, stage);
    }

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
            <div className={styles.board} role="list" aria-label="Colonne dei lead">
                {PIPELINE_STAGES.map(stage => (
                    <Column
                        key={stage}
                        stage={stage}
                        venues={venues.filter(v => v.stage === stage)}
                        meta={meta}
                        teamName={teamName}
                        onOpen={onOpen}
                    />
                ))}
            </div>
            <DragOverlay>
                {dragging ? (
                    <div className={styles.overlay}>
                        <CardBody venue={dragging} meta={meta} teamName={teamName} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

export function Column({
    stage,
    venues,
    meta,
    teamName,
    onOpen
}: CardInfo & { stage: CrmStage; venues: CrmVenueListItem[]; onOpen: (venueId: string) => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: stage });
    const [open, setOpen] = useState(false);
    const shown = open ? venues : venues.slice(0, COLUMN_LIMIT);
    const hidden = venues.length - shown.length;
    const label = COLUMN_LABEL[stage] ?? CRM_STAGE_LABEL[stage];
    return (
        <section
            ref={setNodeRef}
            className={styles.column}
            data-over={isOver || undefined}
            data-stage={stage}
            role="listitem"
            aria-label={`${CRM_STAGE_LABEL[stage]}, ${venues.length}`}
        >
            <header className={styles.columnHeader}>
                <Text as="span" variant="caption" weight={600}>
                    {label}
                </Text>
                <Text as="span" variant="caption" className={styles.columnCount}>
                    {venues.length}
                </Text>
            </header>
            <div className={styles.columnBody}>
                {shown.map(venue => (
                    <DraggableCard key={venue.id} venue={venue} meta={meta} teamName={teamName} onOpen={onOpen} />
                ))}
            </div>
            {hidden > 0 && (
                <button type="button" className={styles.more} onClick={() => setOpen(true)}>
                    <Text as="span" variant="caption" color="inherit">
                        + altri {hidden}
                    </Text>
                </button>
            )}
        </section>
    );
}

export function DraggableCard({
    venue,
    meta,
    teamName,
    onOpen
}: CardInfo & { venue: CrmVenueListItem; onOpen: (venueId: string) => void }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: venue.id });
    const line = meta(venue);
    return (
        <button
            ref={setNodeRef}
            type="button"
            className={styles.card}
            data-dragging={isDragging || undefined}
            data-warn={line.warn || undefined}
            onClick={() => onOpen(venue.id)}
            {...attributes}
            {...listeners}
        >
            <CardBody venue={venue} meta={meta} teamName={teamName} />
        </button>
    );
}

export function CardBody({ venue, meta, teamName }: CardInfo & { venue: CrmVenueListItem }) {
    const line = meta(venue);
    const owner = teamName(venue.assigned_to);
    const account = crmAccountLabel(venue);
    return (
        <span className={styles.cardBody}>
            <Text as="span" variant="body-sm" weight={600} className={styles.cardName}>
                {venue.name}
            </Text>
            <span className={styles.cardMeta}>
                <Text as="span" variant="caption" color="inherit">
                    {[venue.city, line.text].filter(Boolean).join(" · ")}
                </Text>
                {owner && (
                    <Text as="span" variant="caption-xs" weight={700} className={styles.ownerDot} aria-label={`Lo segue ${owner}`}>
                        {initials(owner)}
                    </Text>
                )}
            </span>
            {(account || venue.stage_locked_at || venue.name_pending || venue.name_to_verify) && (
                <span className={styles.cardBadges}>
                    {venue.name_pending && <StatusBadge variant="warning" label="Da completare" />}
                    {venue.name_to_verify && <StatusBadge variant="warning" label="Da verificare" />}
                    {account && <StatusBadge variant={account.variant} label={account.label} />}
                    {venue.stage_locked_at && <StatusBadge variant="warning" label="Bloccata a mano" />}
                </span>
            )}
        </span>
    );
}
