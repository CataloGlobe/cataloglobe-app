/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { Inbox, Pencil, Plus, Trash2, Copy } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Badge } from "@/components/ui/Badge/Badge";
import { PrerequisitesRow } from "@/components/ui/PrerequisitesRow/PrerequisitesRow";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { QrCode } from "@/components/ui/QrCode/QrCode";
import { State, noop, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

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
    { id: "name", header: "Nome", accessor: r => r.name },
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
            <State label="Card con titolo" column>
                <Card title="Informazioni">
                    <Text variant="body-sm">Il contenuto della card.</Text>
                </Card>
            </State>
            <State label="Card senza titolo · noHoverLift" column>
                <Card noHoverLift>
                    <Text variant="body-sm">Senza titolo, senza lift.</Text>
                </Card>
            </State>
            <State label="SectionCard con titolo, badge, sottotitolo, 2 azioni" column>
                <SectionCard
                    title="Varianti"
                    badge={<Badge variant="secondary">3</Badge>}
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
                </SectionCard>
            </State>
            <State label="SectionCard senza titolo" column>
                <SectionCard>
                    <Text variant="body-sm">Il body parte in alto: nessun header, nessun divisore.</Text>
                </SectionCard>
            </State>
            <State label="SectionCard danger" column>
                <SectionCard title="Zona pericolosa" variant="danger" subtitle="Le azioni qui sotto non si annullano.">
                    <Button variant="danger" size="sm" onClick={noop}>
                        Elimina sede
                    </Button>
                </SectionCard>
            </State>
            <State label="SectionCard flush + DataTable" column>
                <SectionCard title="Cataloghi" flush>
                    <SampleTable />
                </SectionCard>
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
            <State label="3 righe + TableRowActions" column>
                <SampleTable />
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
            <State label="loading" column>
                <SampleTable data={[]} isLoading />
            </State>
            <State label="vuota" column>
                <SampleTable
                    data={[]}
                    emptyState={{
                        icon: <Inbox size={32} />,
                        title: "Nessun catalogo",
                        description: "Crea il primo catalogo per vederlo qui."
                    }}
                />
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
            <State label="default con azione" column>
                <EmptyState icon={<Inbox size={32} />} title="Nessuna sede" description="Aggiungi la prima sede per pubblicare un menù." action={action} />
            </State>
            <State label="default senza azione" column>
                <EmptyState icon={<Inbox size={32} />} title="Nessuna sede" description="Nessuna sede ancora." />
            </State>
            <State label="compact" column>
                <EmptyState icon={<Inbox size={24} />} title="Nessuna sede" compact action={action} />
            </State>
            <State label="inline con e senza azione" column>
                <EmptyState icon={<Inbox size={16} />} title="Nessun risultato" variant="inline" action={action} />
                <EmptyState icon={<Inbox size={16} />} title="Nessun risultato" description="Nessun risultato per «pizza»." variant="inline" />
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
        <State label="tre taglie (96 / 160 / 240), senza azioni">
            {[96, 160, 240].map(size => (
                <QrCode key={size} value="https://cataloglobe.com/trattoria-del-porto" size={size} fileName="qr-galleria" showActions={false} />
            ))}
        </State>
    );
}

function QrCodeWithActionsSection() {
    return (
        <State label="con azioni di download" column>
            <div className={styles.narrow}>
                <QrCode value="https://cataloglobe.com/trattoria-del-porto" size={160} fileName="qr-galleria" />
            </div>
        </State>
    );
}

export const containersSections: GallerySection[] = [
    { id: "card", title: "Card · SectionCard", sheet: "Card", Component: CardSection },
    { id: "datatable", title: "DataTable", sheet: "DataTable", Component: DataTableSection },
    { id: "tablerowactions", title: "TableRowActions", sheet: "Menu", Component: TableRowActionsSection },
    { id: "emptystate", title: "EmptyState", sheet: "EmptyState", Component: EmptyStateSection },
    { id: "prerequisitesrow", title: "PrerequisitesRow", Component: PrerequisitesRowSection },
    { id: "breadcrumb", title: "Breadcrumb", sheet: "PageHeader", Component: BreadcrumbSection },
    { id: "avatar", title: "Avatar", Component: AvatarSection },
    {
        id: "qrcode",
        title: "QrCode",
        Component: () => (
            <>
                <QrCodeSection />
                <QrCodeWithActionsSection />
            </>
        )
    }
];
