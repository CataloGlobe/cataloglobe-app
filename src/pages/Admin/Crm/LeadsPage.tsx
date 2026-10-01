import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import {
    DataTable,
    DATA_TABLE_CLASSES,
    type ColumnDefinition
} from "@/components/ui/DataTable/DataTable";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
    getCrmSettings,
    listCrmTeamMembers,
    listCrmVenues,
    logCrmWhatsappOpened,
    moveCrmStage
} from "@/services/supabase/crm";
import { crmWhatsappLink } from "@/utils/crm/whatsapp";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import {
    CRM_SOURCE_LABEL,
    CRM_STAGE_LABEL,
    CRM_STAGE_VARIANT,
    crmErrorMessage
} from "@/utils/crm/stages";
import { CRM_STAGES, type CrmStage, type CrmTeamMember, type CrmVenueListItem } from "@/types/crm";
import { AddLeadDrawer } from "./AddLeadDrawer";
import { ImportMetaCsvDrawer } from "./ImportMetaCsvDrawer";
import { SettingsDrawer } from "./SettingsDrawer";
import { LostStageDialog } from "./LostStageDialog";
import { PipelineBoard } from "./PipelineBoard";
import styles from "./Crm.module.scss";

/**
 * Elenco dei lead del CRM: un locale per riga, l'ultimo toccato in cima.
 *
 * Due viste in `?vista=`: elenco (default) e pipeline a 8 colonne. Nell'elenco
 * il filtro di default è «Da lavorare»: tutto tranne Cliente pagante e Perso,
 * cioè le carte su cui c'è ancora qualcosa da fare.
 */

type View = "elenco" | "pipeline";

const VIEW_OPTIONS: { value: View; label: string }[] = [
    { value: "elenco", label: "Elenco" },
    { value: "pipeline", label: "Pipeline" }
];

type StageFilter = CrmStage | "open" | "all";

const CLOSED_STAGES: CrmStage[] = ["cliente_pagante", "perso"];

function matchesFilter(venue: CrmVenueListItem, filter: StageFilter): boolean {
    if (filter === "all") return true;
    if (filter === "open") return !CLOSED_STAGES.includes(venue.stage);
    return venue.stage === filter;
}

export default function LeadsPage() {
    usePageTitle("Lead");
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const view: View = searchParams.get("vista") === "pipeline" ? "pipeline" : "elenco";
    const setView = useCallback(
        (next: View) =>
            setSearchParams(next === "elenco" ? {} : { vista: next }, {
                replace: true
            }),
        [setSearchParams]
    );
    const [lostVenueId, setLostVenueId] = useState<string | null>(null);

    const [venues, setVenues] = useState<CrmVenueListItem[]>([]);
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [whatsappTemplate, setWhatsappTemplate] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [filter, setFilter] = useState<StageFilter>("open");
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const load = useCallback(async () => {
        setPageError(null);
        try {
            const [rows, members, settings] = await Promise.all([
                listCrmVenues(),
                listCrmTeamMembers(),
                // Il testo di WhatsApp non deve far cadere la pagina.
                getCrmSettings().catch(() => null)
            ]);
            setVenues(rows);
            setTeam(members);
            setWhatsappTemplate(settings?.whatsapp_template ?? null);
        } catch (err) {
            setPageError(
                `Non è stato possibile caricare i lead: ${err instanceof Error ? err.message : String(err)}`
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const teamName = useMemo(() => {
        const names = new Map(team.map(m => [m.user_id, m.display_name]));
        return (userId: string | null) => (userId ? (names.get(userId) ?? "—") : "Nessuno");
    }, [team]);

    const handleWhatsapp = useCallback(
        (venue: CrmVenueListItem) => {
            const contact = venue.crm_contacts[0];
            if (!contact?.phone_e164) return;
            // Prima la finestra (gesto dell'utente), poi la registrazione.
            window.open(
                crmWhatsappLink(contact.phone_e164, whatsappTemplate, {
                    contactName: contact.name,
                    venueName: venue.name
                }),
                "_blank",
                "noopener"
            );
            setPageError(null);
            void logCrmWhatsappOpened(venue.id, venue.crm_leads[0]?.id ?? null)
                .then(() => load())
                .catch(err => setPageError(crmErrorMessage(err)));
        },
        [whatsappTemplate, load]
    );

    const handleMove = useCallback(
        async (venue: CrmVenueListItem, stage: CrmStage) => {
            if (stage === "perso") {
                setLostVenueId(venue.id);
                return;
            }
            setPageError(null);
            try {
                // Fase attesa = quella che si vede: se un altro l'ha appena
                // spostata (o il sistema), non si sovrascrive.
                const moved = await moveCrmStage(venue.id, stage, undefined, venue.stage);
                await load();
                if (!moved) {
                    setPageError(`${venue.name} era già stata spostata: ecco dove si trova ora.`);
                    return;
                }
                showToast({
                    message: `${venue.name}: ${CRM_STAGE_LABEL[stage]}.`,
                    type: "success"
                });
            } catch (err) {
                setPageError(crmErrorMessage(err));
            }
        },
        [load, showToast]
    );

    const filterOptions = useMemo<ChipOption<StageFilter>[]>(() => {
        const count = (f: StageFilter) => venues.filter(v => matchesFilter(v, f)).length;
        return [
            { value: "open", label: "Da lavorare", count: count("open") },
            ...CRM_STAGES.map(stage => ({
                value: stage,
                label: CRM_STAGE_LABEL[stage],
                count: count(stage),
                disabled: count(stage) === 0
            })),
            { value: "all", label: "Tutti", count: venues.length }
        ];
    }, [venues]);

    const visible = useMemo(() => venues.filter(v => matchesFilter(v, filter)), [venues, filter]);

    const columns = useMemo<ColumnDefinition<CrmVenueListItem>[]>(
        () => [
            {
                id: "venue",
                header: "Locale",
                cell: (_v, row) => (
                    <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                        <span>{row.name}</span>
                        <span>{row.city ?? ""}</span>
                    </div>
                )
            },
            {
                id: "contact",
                header: "Contatto",
                hideOnPhone: true,
                cell: (_v, row) => {
                    const contact = row.crm_contacts[0];
                    return (
                        <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                            <span>{contact?.name ?? "—"}</span>
                            <span>{contact?.phone_e164 ?? ""}</span>
                        </div>
                    );
                }
            },
            {
                id: "stage",
                header: "Fase",
                cell: (_v, row) => (
                    <StatusBadge
                        variant={CRM_STAGE_VARIANT[row.stage]}
                        label={CRM_STAGE_LABEL[row.stage]}
                    />
                )
            },
            {
                id: "source",
                header: "Fonte",
                hideOnPhone: true,
                cell: (_v, row) => {
                    const lead = row.crm_leads[0];
                    if (!lead) return "—";
                    return (
                        <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                            <span>
                                {CRM_SOURCE_LABEL[lead.source]}
                                {row.crm_leads.length > 1
                                    ? ` · ${row.crm_leads.length} richieste`
                                    : ""}
                            </span>
                            <span>{lead.ad_name ?? ""}</span>
                        </div>
                    );
                }
            },
            {
                id: "assigned",
                header: "Assegnato",
                hideOnPhone: true,
                accessor: row => teamName(row.assigned_to)
            },
            {
                id: "activity",
                header: "Ultima attività",
                hideOnPhone: true,
                accessor: row => formatDateTimeIt(row.last_activity_at)
            },
            {
                id: "actions",
                header: "",
                width: "56px",
                align: "right",
                cell: (_v, row) => (
                    <TableRowActions
                        actions={[
                            {
                                label: "Scrivi su WhatsApp",
                                onClick: () => handleWhatsapp(row),
                                hidden:
                                    !row.crm_contacts[0]?.phone_e164 ||
                                    (row.stage === "perso" && row.lost_kind === "stop")
                            },
                            { label: "Apri", onClick: () => navigate(row.id) }
                        ]}
                    />
                )
            }
        ],
        [teamName, handleWhatsapp, navigate]
    );

    const newCount = useMemo(() => venues.filter(v => v.stage === "nuovo").length, [venues]);

    const subtitle = useMemo(() => {
        if (isLoading) return undefined;
        if (newCount === 0) return "Nessun lead in Nuovo.";
        return newCount === 1 ? "1 lead in Nuovo." : `${newCount} lead in Nuovo.`;
    }, [isLoading, newCount]);

    // MEMOIZZATO: usePageHeader confronta `actions` per reference.
    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <Button variant="secondary" onClick={() => setIsSettingsOpen(true)}>
                    Impostazioni
                </Button>
                <Button variant="secondary" onClick={() => setIsImportOpen(true)}>
                    Importa CSV Meta
                </Button>
                <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                    Aggiungi lead
                </Button>
            </div>
        ),
        []
    );

    const headerCompact = useMemo<PageHeaderCompactConfig>(
        () => ({
            primaryAction: {
                label: "Aggiungi lead",
                onClick: () => setIsAddOpen(true)
            },
            secondaryActions: [
                { label: "Importa CSV Meta", onClick: () => setIsImportOpen(true) },
                { label: "Impostazioni", onClick: () => setIsSettingsOpen(true) }
            ]
        }),
        []
    );

    const headerLeading = useMemo(
        () => <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} size="sm" />,
        [view, setView]
    );

    usePageHeader({
        title: "Lead",
        subtitle,
        leading: headerLeading,
        actions: headerActions,
        compact: headerCompact
    });

    const handleCreated = useCallback(
        (venueId: string) => {
            setIsAddOpen(false);
            navigate(venueId);
        },
        [navigate]
    );

    const handleImported = useCallback(async () => {
        await load();
    }, [load]);

    return (
        <div className={styles.page}>
            {pageError && (
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void load()}>
                            Riprova
                        </Button>
                    }
                >
                    {pageError}
                </InlineBanner>
            )}
            {view === "pipeline" ? (
                <PipelineBoard
                    venues={venues}
                    teamName={teamName}
                    onMove={(venue, stage) => void handleMove(venue, stage)}
                    onOpen={id => navigate(id)}
                />
            ) : (
                <>
                    <ChipGroupSingle
                        options={filterOptions}
                        value={filter}
                        onChange={setFilter}
                        ariaLabel="Filtra per fase"
                    />

                    <DataTable
                        data={visible}
                        columns={columns}
                        isLoading={isLoading}
                        onRowClick={row => navigate(row.id)}
                        ariaLabel="Lead"
                        isFiltered={filter !== "all"}
                        onClearFilters={() => setFilter("all")}
                        emptyState={{
                            title:
                                venues.length === 0
                                    ? "Ancora nessun lead"
                                    : "Nessun lead con questo filtro",
                            description:
                                venues.length === 0
                                    ? "I lead della landing arrivano qui da soli entro un minuto. Quelli delle chat WhatsApp si aggiungono a mano."
                                    : undefined,
                            icon: <UserPlus size={32} strokeWidth={1.5} />
                        }}
                    />
                </>
            )}

            <LostStageDialog
                venueId={lostVenueId}
                onClose={() => setLostVenueId(null)}
                onMoved={async () => {
                    await load();
                    showToast({ message: "Spostato in Perso.", type: "success" });
                }}
            />

            <AddLeadDrawer
                open={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onCreated={handleCreated}
            />
            <ImportMetaCsvDrawer
                open={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                onImported={handleImported}
            />
            <SettingsDrawer
                open={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onChanged={() => void load()}
            />
        </div>
    );
}
