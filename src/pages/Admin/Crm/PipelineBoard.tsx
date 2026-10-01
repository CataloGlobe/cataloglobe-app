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
import { CRM_SOURCE_LABEL, CRM_STAGE_LABEL } from "@/utils/crm/stages";
import { CRM_STAGES, type CrmStage, type CrmVenueListItem } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Pipeline a 8 colonne (wiki: pipeline-crm). Si trascina una carta in
 * un'altra colonna; Perso apre il dialogo del motivo (lo gestisce la pagina
 * con `onMove`). Clic sulla carta = scheda del locale. Da tastiera: Tab sulla
 * carta, spazio per prenderla, frecce, spazio per lasciarla.
 *
 * Nessuno stile inline: la carta trascinata resta ferma (attenuata) e si
 * muove la sua copia nel DragOverlay, che dnd-kit posiziona da sé.
 */

type Props = {
    venues: CrmVenueListItem[];
    teamName: (userId: string | null) => string;
    onMove: (venue: CrmVenueListItem, stage: CrmStage) => void;
    onOpen: (venueId: string) => void;
};

export function PipelineBoard({ venues, teamName, onMove, onOpen }: Props) {
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
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragging(null)}
        >
            <div className={styles.board} role="list" aria-label="Pipeline">
                {CRM_STAGES.map(stage => (
                    <Column
                        key={stage}
                        stage={stage}
                        venues={venues.filter(v => v.stage === stage)}
                        teamName={teamName}
                        onOpen={onOpen}
                    />
                ))}
            </div>
            <DragOverlay>
                {dragging ? <CardBody venue={dragging} teamName={teamName} /> : null}
            </DragOverlay>
        </DndContext>
    );
}

type ColumnProps = {
    stage: CrmStage;
    venues: CrmVenueListItem[];
    teamName: (userId: string | null) => string;
    onOpen: (venueId: string) => void;
};

export function Column({ stage, venues, teamName, onOpen }: ColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id: stage });
    return (
        <section
            ref={setNodeRef}
            className={styles.column}
            data-over={isOver || undefined}
            role="listitem"
            aria-label={`${CRM_STAGE_LABEL[stage]}, ${venues.length}`}
        >
            <header className={styles.columnHeader}>
                <Text variant="body-sm" weight={600}>
                    {CRM_STAGE_LABEL[stage]}
                </Text>
                <Text variant="caption" colorVariant="muted">
                    {venues.length}
                </Text>
            </header>
            <div className={styles.columnBody}>
                {venues.map(venue => (
                    <DraggableCard key={venue.id} venue={venue} teamName={teamName} onOpen={onOpen} />
                ))}
            </div>
        </section>
    );
}

type CardProps = {
    venue: CrmVenueListItem;
    teamName: (userId: string | null) => string;
    onOpen: (venueId: string) => void;
};

export function DraggableCard({ venue, teamName, onOpen }: CardProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: venue.id });
    return (
        <button
            ref={setNodeRef}
            type="button"
            className={styles.boardCard}
            data-dragging={isDragging || undefined}
            onClick={() => onOpen(venue.id)}
            {...attributes}
            {...listeners}
        >
            <CardBody venue={venue} teamName={teamName} />
        </button>
    );
}

export function CardBody({
    venue,
    teamName
}: {
    venue: CrmVenueListItem;
    teamName: (userId: string | null) => string;
}) {
    const contact = venue.crm_contacts[0];
    const lead = venue.crm_leads[0];
    const account = crmAccountLabel(venue);
    return (
        <span className={styles.boardCardBody}>
            <Text as="span" variant="body-sm" weight={600}>
                {venue.name}
            </Text>
            <Text as="span" variant="caption" colorVariant="muted">
                {[contact?.name, venue.city].filter(Boolean).join(" · ")}
            </Text>
            <Text as="span" variant="caption" colorVariant="muted">
                {[lead ? CRM_SOURCE_LABEL[lead.source] : null, teamName(venue.assigned_to)]
                    .filter(Boolean)
                    .join(" · ")}
            </Text>
            {(account || venue.stage_locked_at) && (
                <span className={styles.boardCardBadges}>
                    {account && <StatusBadge variant={account.variant} label={account.label} />}
                    {venue.stage_locked_at && <StatusBadge variant="warning" label="Fase bloccata a mano" />}
                </span>
            )}
        </span>
    );
}
