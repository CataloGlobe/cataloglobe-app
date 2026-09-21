/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { Inbox, Pencil, Plus, Trash2, Copy } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { DataTableDragHandle } from "@/components/ui/DataTable/SortableDataTableRow";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Badge } from "@/components/ui/Badge/Badge";
import { PrerequisitesRow } from "@/components/ui/PrerequisitesRow/PrerequisitesRow";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { QrCode } from "@/components/ui/QrCode/QrCode";
import { State, noop, type GallerySection } from "../gallery";

type Row = { id: string; name: string; status: "success" | "neutral" | "warning"; price: number };

const ROWS: Row[] = [
    { id: "1", name: "Menù pranzo", status: "success", price: 14 },
    { id: "2", name: "Menù cena", status: "neutral", price: 28 },
    { id: "3", name: "Carta dei vini", status: "warning", price: 0 }
];

const ROW_ACTIONS = [
    { label: "Modifica", icon: Pencil, onClick: noop },
    { label: "Duplica", icon: Copy, onClick: noop },
    { label: "Elimina", icon: Trash2, onClick: noop, variant: "destructive" as const, separator: true }
];

const COLUMNS: ColumnDefinition<Row>[] = [
    {
        id: "name",
        header: "Nome",
        accessor: r => r.name,
        cell: (v, row) => (
            <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                <span>{v}</span>
                <span>{row.status === "success" ? "Aggiornato ieri" : "Mai pubblicato"}</span>
            </div>
        )
    },
    {
        id: "status",
        header: "Stato",
        accessor: r => r.status,
        cell: (_v, row) => (
            <StatusBadge
                variant={row.status}
                label={row.status === "success" ? "Pubblicato" : row.status === "neutral" ? "Bozza" : "Senza prezzo"}
            />
        )
    },
    { id: "price", header: "Prezzo", accessor: r => r.price, align: "right", cell: v => `${v} €` },
    { id: "actions", header: "", width: "56px", align: "right", cell: () => <TableRowActions actions={ROW_ACTIONS} /> }
];

function SampleTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>>) {
    return <DataTable<Row> data={ROWS} columns={COLUMNS} pageSize={5} getRowId={r => r.id} {...props} />;
}

function CardSection() {
    return (
        <>
            <State label="con titolo" column>
                <Card title="Informazioni">
                    <Text variant="body-sm">Il contenuto della card.</Text>
                </Card>
            </State>
            <State label="con titolo, badge, sottotitolo, 2 azioni" column>
                <Card
                    title="Varianti"
                    badge={<Badge>3</Badge>}
                    subtitle="Visibili nella pagina pubblica"
                    actions={
                        <>
                            <Button variant="secondary" size="sm" onClick={noop}>
                                Riordina
                            </Button>
                            <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={noop}>
                                Aggiungi
                            </Button>
                        </>
                    }
                >
                    <Text variant="body-sm">Body della sezione.</Text>
                </Card>
            </State>
            <State label="senza titolo" column>
                <Card>
                    <Text variant="body-sm">Il body parte in alto: nessun header, nessun divisore.</Text>
                </Card>
            </State>
            <State label="danger: l'azione sta nell'header, il body resta neutro" column>
                <Card
                    title="Zona pericolosa"
                    variant="danger"
                    subtitle="Le azioni qui sotto non si annullano."
                    actions={
                        <Button variant="danger" size="sm" onClick={noop}>
                            Elimina sede
                        </Button>
                    }
                >
                    <Text variant="body-sm">Eliminando la sede perdi tavoli, prenotazioni e QR collegati.</Text>
                </Card>
            </State>
            <State label="flush + DataTable" column>
                <Card title="Cataloghi" flush>
                    <SampleTable />
                </Card>
            </State>
            <State label="alias deprecato: SectionCard · noHoverLift (warn in dev)" column>
                <SectionCard title="SectionCard">
                    <Text variant="body-sm">Rende una Card identica.</Text>
                </SectionCard>
                <Card noHoverLift>
                    <Text variant="body-sm">noHoverLift è ignorato: nessuna card ha più il lift.</Text>
                </Card>
            </State>
        </>
    );
}

function DataTableSection() {
    // Parte vuota: con una riga preselezionata la BulkBar (fixed) resterebbe
    // in fondo alla galleria per sempre. Si seleziona dalla checkbox.
    const [selected, setSelected] = useState<string[]>([]);
    return (
        <>
            <State label="3 righe, cella a due righe, azioni al hover/focus (ultima colonna)" column>
                <SampleTable />
            </State>
            <State label="colonna azioni dichiarata per prima: la tabella la sposta in coda · maniglia drag" column>
                <SampleTable
                    columns={[
                        COLUMNS[3],
                        { id: "drag", header: "", width: "40px", align: "center", cell: () => <DataTableDragHandle /> },
                        ...COLUMNS.slice(0, 3)
                    ]}
                />
            </State>
            <State label="selectable (una selezionata)" column>
                <SampleTable selectable selectedRowIds={selected} onSelectedRowsChange={setSelected} onBulkDelete={noop} />
            </State>
            <State label="riga disabilitata + riga evidenziata" column>
                <SampleTable disabledRowIds={["3"]} highlightedRowIds={["1"]} />
            </State>
            <State label="riga cliccabile" column>
                <SampleTable onRowClick={noop} />
            </State>
            <State label="loading: 5 righe Skeleton" column>
                <SampleTable data={[]} isLoading />
            </State>
            <State label="vuota: EmptyState inline dentro la tabella" column>
                <SampleTable
                    data={[]}
                    emptyState={{
                        icon: <Inbox />,
                        title: "Nessun catalogo",
                        description: "Crea il primo catalogo per vederlo qui.",
                        action: (
                            <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={noop}>
                                Nuovo catalogo
                            </Button>
                        )
                    }}
                />
            </State>
            <State label="vuota con filtro attivo (isFiltered): EmptyState filtered" column>
                <SampleTable data={[]} isFiltered onClearFilters={noop} emptyState={{ title: "Nessun catalogo per «vini»" }} />
            </State>
        </>
    );
}

function TableRowActionsSection() {
    return (
        <>
            <State label="⋯ con voce distruttiva (apri al click)">
                <TableRowActions actions={ROW_ACTIONS} />
            </State>
            <State label="con voce accent + hidden">
                <TableRowActions
                    actions={[
                        { label: "Pubblica", onClick: noop, variant: "accent" },
                        { label: "Nascosta", onClick: noop, hidden: true },
                        { label: "Elimina", icon: Trash2, onClick: noop, variant: "destructive", separator: true }
                    ]}
                />
            </State>
        </>
    );
}

function EmptyStateSection() {
    const action = (
        <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={noop}>
            Aggiungi sede
        </Button>
    );
    return (
        <>
            <State label="page (default): icona 32, titolo, riga, azione obbligatoria" column>
                <EmptyState icon={<Inbox />} title="Nessuna sede" description="Aggiungi la prima sede per pubblicare un menù." action={action} />
            </State>
            <State label="page con slot children fra riga e azione" column>
                <EmptyState icon={<Inbox />} title="Solo tu" description="Invita chi lavora con te: ognuno vede solo le sedi che gli assegni." action={action}>
                    <Text variant="caption" colorVariant="muted">
                        Manager · Staff · Visualizzatore
                    </Text>
                </EmptyState>
            </State>
            <State label="inline (in una card): icona 20, azione opzionale" column>
                <Card title="Cataloghi" flush>
                    <EmptyState icon={<Inbox />} title="Nessun catalogo" description="Questo prodotto non è incluso in nessun catalogo." variant="inline" action={action} />
                </Card>
                <Card title="Programmazione" flush>
                    <EmptyState icon={<Inbox />} title="Nessuna regola coinvolge questo prodotto." variant="inline" />
                </Card>
            </State>
            <State label="filtered: una riga + «Azzera filtri»" column>
                <Card flush>
                    <EmptyState title="Nessun risultato per «pizza»" variant="filtered" onClearFilters={noop} />
                </Card>
            </State>
            <State label="alias deprecato: compact (= inline, warn in dev)" column>
                <EmptyState icon={<Inbox />} title="Nessuna sede" compact action={action} />
            </State>
        </>
    );
}

function PrerequisitesRowSection() {
    return (
        <>
            <State label="tutto a posto" column>
                <PrerequisitesRow
                    items={[
                        { id: "hours", label: "Orari di apertura configurati", ok: true },
                        { id: "tables", label: "Almeno un tavolo", ok: true }
                    ]}
                />
            </State>
            <State label="manca un prerequisito (href + onAction)" column>
                <PrerequisitesRow
                    items={[
                        { id: "hours", label: "Orari di apertura configurati", ok: true },
                        {
                            id: "tables",
                            label: "Almeno un tavolo",
                            ok: false,
                            consequence: "Senza tavoli il QR non porta da nessuna parte.",
                            actionLabel: "Vai alla sala",
                            href: "#"
                        },
                        { id: "plan", label: "Piano attivo", ok: false, consequence: "Il canale resta spento.", actionLabel: "Vedi piano", onAction: noop }
                    ]}
                />
            </State>
            <State label="loading" column>
                <PrerequisitesRow items={[{ id: "hours", label: "Orari", ok: false }]} loading />
            </State>
        </>
    );
}

function BreadcrumbSection() {
    return (
        <State label="con genitore e icona">
            <Breadcrumb items={[{ label: "Sedi", to: "#" }, { label: "Trattoria del Porto" }]} />
        </State>
    );
}

function AvatarSection() {
    return (
        <>
            <State label="sm / md / lg con iniziali">
                <Avatar name="Lorenzo Calzi" size="sm" />
                <Avatar name="Lorenzo Calzi" size="md" />
                <Avatar name="Lorenzo Calzi" size="lg" />
            </State>
            <State label="con immagine · rounded · gradient">
                <Avatar name="CataloGlobe" imageUrl="/favicon/cataloglobe_icon_flat_primary_180.png" />
                <Avatar name="Lorenzo Calzi" rounded />
                <Avatar name="Anna Rossi" gradient="linear-gradient(135deg, #f59e0b, #dc2626)" />
                <Avatar />
            </State>
        </>
    );
}

function QrCodeSection() {
    return (
        <>
            <State label="taglie della scheda: sm 40 · md 96 · lg 160, con cornice e quiet zone bianca">
                <QrCode value="https://cataloglobe.com/trattoria-del-porto" size="sm" fileName="qr-sm" />
                <QrCode value="https://cataloglobe.com/trattoria-del-porto" size="md" fileName="qr-md" label="Tavolo 12" />
                <QrCode value="https://cataloglobe.com/trattoria-del-porto" size="lg" fileName="qr-lg" label="Trattoria del Porto" />
            </State>
            <State label="lg con le azioni: Scarica (PNG/SVG) · Copia link · Apri">
                <QrCode value="https://cataloglobe.com/trattoria-del-porto" size="lg" fileName="qr-azioni" label="Trattoria del Porto" showActions onCopyLink={noop} openHref="https://cataloglobe.com/trattoria-del-porto" />
            </State>
            <State label="in caricamento (Skeleton della stessa taglia) · non disponibile (sede sospesa)">
                <QrCode value="https://cataloglobe.com/x" size="md" fileName="qr-loading" status="loading" label="Tavolo 12" />
                <QrCode value="https://cataloglobe.com/x" size="md" fileName="qr-off" status="unavailable" label="Sede sospesa" onCopyLink={noop} />
            </State>
            <State label="taglia numerica (storica): nudo, la cornice la mette il chiamante">
                <QrCode value="https://cataloglobe.com/trattoria-del-porto" size={96} fileName="qr-nudo" />
            </State>
        </>
    );
}

export const containersSections: GallerySection[] = [
    { id: "card", title: "Card", sheet: "Card", Component: CardSection },
    { id: "datatable", title: "DataTable", sheet: "DataTable", Component: DataTableSection },
    { id: "tablerowactions", title: "TableRowActions", sheet: "Menu", Component: TableRowActionsSection },
    { id: "emptystate", title: "EmptyState", sheet: "EmptyState", Component: EmptyStateSection },
    { id: "prerequisitesrow", title: "PrerequisitesRow", Component: PrerequisitesRowSection },
    { id: "breadcrumb", title: "Breadcrumb", sheet: "PageHeader", Component: BreadcrumbSection },
    { id: "avatar", title: "Avatar", Component: AvatarSection },
    { id: "qrcode", title: "QrCode", sheet: "QrCode", Component: QrCodeSection }
];
