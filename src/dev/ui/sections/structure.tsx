/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { ChevronRight, MapPin, Store, CheckCircle2, Circle, Pencil, Trash2, Palette } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { FormGrid, FormSection, FORM_GRID_CLASSES } from "@/components/ui/FormGrid/FormGrid";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid/CardGrid";
import { IconButton } from "@/components/ui/Button/IconButton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { QrCode } from "@/components/ui/QrCode/QrCode";
import { Switch } from "@/components/ui/Switch/Switch";
import { Button } from "@/components/ui/Button/Button";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { State, noop, type GallerySection } from "../gallery";

const CITY_OPTIONS = [
    { value: "mi", label: "Milano" },
    { value: "to", label: "Torino" },
    { value: "bo", label: "Bologna" }
];

/* ------------------------------------------------------------------ */
/* FormGrid + FormSection                                              */
/* ------------------------------------------------------------------ */

function FormGridSection() {
    return (
        <>
            <State label="cols=1 (drawer sm/md)" column>
                <FormGrid cols={1}>
                    <TextInput label="Nome della sede" placeholder="Trattoria del Porto" onChange={noop} />
                    <TextInput label="Telefono" placeholder="+39 02 1234567" onChange={noop} />
                    <Select label="Città" options={CITY_OPTIONS} value="mi" onChange={noop} />
                </FormGrid>
            </State>
            <State label="cols=2 (drawer lg, pagina) · span a tutta riga · sotto 768 una colonna" column>
                <FormGrid cols={2}>
                    <TextInput label="Nome" placeholder="Mario" onChange={noop} />
                    <TextInput label="Cognome" placeholder="Rossi" onChange={noop} />
                    <TextInput label="Indirizzo" placeholder="Via Roma 1" containerClassName={FORM_GRID_CLASSES.span} onChange={noop} />
                    <Select label="Città" options={CITY_OPTIONS} value="mi" onChange={noop} />
                    <TextInput label="CAP" placeholder="20100" onChange={noop} />
                    <Textarea label="Note" placeholder="Ingresso dal cortile" containerClassName={FORM_GRID_CLASSES.span} onChange={noop} />
                </FormGrid>
            </State>
            <State label="due FormSection (gap 24) · titolo + riga muta" column>
                <FormSection title="Identità" description="Come si presenta la sede nella pagina pubblica.">
                    <FormGrid cols={2}>
                        <TextInput label="Nome" placeholder="Trattoria del Porto" onChange={noop} />
                        <TextInput label="Slug" placeholder="trattoria-del-porto" onChange={noop} />
                    </FormGrid>
                </FormSection>
                <FormSection title="Contatti">
                    <FormGrid cols={2}>
                        <TextInput label="Telefono" placeholder="+39 02 1234567" onChange={noop} />
                        <TextInput label="Email" placeholder="info@esempio.it" onChange={noop} />
                    </FormGrid>
                </FormSection>
            </State>
            <State label="con errore e disabled (stati dei campi, non del grid)" column>
                <FormGrid cols={2}>
                    <TextInput label="Email" defaultValue="non-valida" error="Inserisci un indirizzo valido." onChange={noop} />
                    <TextInput label="Codice" defaultValue="ABC-123" disabled onChange={noop} />
                </FormGrid>
            </State>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* ListRow                                                             */
/* ------------------------------------------------------------------ */

const ROW_ACTIONS = [
    { label: "Modifica", icon: Pencil, onClick: noop },
    { label: "Elimina", icon: Trash2, onClick: noop, variant: "destructive" as const, separator: true }
];

function ListRowSection() {
    const [selected, setSelected] = useState("mi");
    const [openNow, setOpenNow] = useState(true);
    return (
        <>
            <State label="gestione: icona · titolo · sottotitolo · chevron (cliccabile, in Card flush)" column>
                <Card flush>
                    <ListRow leading={<MapPin />} title="Trattoria del Porto" subtitle="Via Roma 1, Milano" trailing={<ChevronRight />} onClick={noop} />
                    <ListRow leading={<MapPin />} title="Osteria della Piazza" subtitle="Piazza Castello 12, Torino · un sottotitolo lunghissimo che va in ellissi perché la riga è una sola" trailing={<ChevronRight />} onClick={noop} />
                    <ListRow leading={<MapPin />} title="Sede senza indirizzo" trailing={<ChevronRight />} onClick={noop} />
                </Card>
            </State>
            <State label="membro: avatar · nome · ruolo (Badge) · sedi (meta) · azioni" column>
                <Card flush>
                    <ListRow
                        leading={<Avatar name="Lorenzo Calzi" size="sm" />}
                        title="Lorenzo Calzi"
                        subtitle="Può fare tutto"
                        meta={
                            <>
                                <Badge variant="brand">Admin</Badge>
                                <Badge>3 sedi</Badge>
                            </>
                        }
                        trailing={<TableRowActions actions={ROW_ACTIONS} />}
                    />
                    <ListRow
                        leading={<Avatar name="Giulia Verdi" size="sm" />}
                        title="Giulia Verdi"
                        subtitle="Gestisce menù e ordini"
                        meta={
                            <>
                                <Badge>Manager</Badge>
                                <Badge>1 sede</Badge>
                            </>
                        }
                        trailing={<TableRowActions actions={ROW_ACTIONS} />}
                    />
                </Card>
            </State>
            <State label="vetrina: QR · nome · URL · StatusBadge · azioni" column>
                <Card flush>
                    <ListRow
                        leading={<QrCode value="https://cataloglobe.com/trattoria-del-porto" size={40} fileName="qr-riga" showActions={false} />}
                        title="Trattoria del Porto"
                        subtitle="cataloglobe.com/trattoria-del-porto"
                        meta={<StatusBadge variant="success" label="Menù pubblicato" />}
                        trailing={<Button variant="ghost" size="sm" onClick={noop}>Apri</Button>}
                    />
                    <ListRow
                        leading={<QrCode value="https://cataloglobe.com/osteria" size={40} fileName="qr-riga-2" showActions={false} />}
                        title="Osteria della Piazza"
                        subtitle="cataloglobe.com/osteria"
                        meta={<StatusBadge variant="warning" label="Nessun menù" />}
                        trailing={<Button variant="ghost" size="sm" onClick={noop}>Apri</Button>}
                    />
                </Card>
            </State>
            <State label="checklist: spunta · titolo · «Fai ora» (nuda, in un drawer)" column>
                <div>
                    <ListRow leading={<CheckCircle2 />} title="Aggiungi il logo" subtitle="Fatto ieri" muted />
                    <ListRow leading={<Circle />} title="Pubblica il primo menù" subtitle="Serve un catalogo con almeno un prodotto" trailing={<Button variant="ghost" size="sm" onClick={noop}>Fai ora</Button>} />
                </div>
            </State>
            <State label="trailing Switch (la riga non è cliccabile, agisce il controllo)" column>
                <Card flush>
                    <ListRow leading={<Store />} title="Aperto ora" subtitle="Mostra il badge nella pagina pubblica" trailing={<Switch ariaLabel="Aperto ora" checked={openNow} onChange={setOpenNow} />} />
                </Card>
            </State>
            <State label="selezionata (click per cambiare) · link interno (to)" column>
                <Card flush>
                    {[
                        { id: "mi", name: "Milano" },
                        { id: "to", name: "Torino" },
                        { id: "bo", name: "Bologna" }
                    ].map(c => (
                        <ListRow key={c.id} leading={<MapPin />} title={c.name} subtitle="Sede" selected={selected === c.id} onClick={() => setSelected(c.id)} />
                    ))}
                    <ListRow leading={<MapPin />} title="Vai alla galleria (link)" subtitle="react-router Link" to="/dev/ui" trailing={<ChevronRight />} />
                </Card>
            </State>
            <State label="muted (la voce a zero, resta elencata) · caricamento" column>
                <Card flush>
                    <ListRow leading={<Store />} title="Prenotazioni" subtitle="0 questa settimana" meta={<Badge>0</Badge>} muted onClick={noop} />
                    <ListRow loading />
                    <ListRow loading />
                </Card>
            </State>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* CardGrid                                                            */
/* ------------------------------------------------------------------ */

// Copertine: SVG inline in data URI, niente asset da servire in galleria.
function cover(hue: number, label: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="hsl(${hue} 60% 80%)"/><text x="80" y="56" font-family="sans-serif" font-size="14" text-anchor="middle" fill="hsl(${hue} 40% 30%)">${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SEDI = [
    { id: "porto", name: "Trattoria del Porto", city: "Milano", hue: 210, status: "success" as const },
    { id: "piazza", name: "Osteria della Piazza", city: "Torino", hue: 30, status: "neutral" as const },
    { id: "lago", name: "Bar del Lago", city: "Como", hue: 140, status: "success" as const }
];

function CardGridSection() {
    const [selected, setSelected] = useState("porto");
    const actions = (
        <>
            <IconButton icon={<Pencil size={16} />} variant="ghost" size="sm" aria-label="Modifica" onClick={noop} />
            <IconButton icon={<Trash2 size={16} />} variant="ghost" size="sm" aria-label="Elimina" onClick={noop} />
        </>
    );
    return (
        <>
            <State label="sedi: immagine · titolo · riga · StatusBadge · azioni al hover (3 → 2 sotto 1024 → 1 sotto 768)" column>
                <CardGrid aria-label="Sedi">
                    {SEDI.map(s => (
                        <CardGridItem
                            key={s.id}
                            image={cover(s.hue, s.city)}
                            title={s.name}
                            subtitle={`${s.city} · aggiornata ieri`}
                            badge={<StatusBadge variant={s.status} label={s.status === "success" ? "Pubblicata" : "Bozza"} />}
                            actions={actions}
                            to="/dev/ui"
                        />
                    ))}
                </CardGrid>
            </State>
            <State label="selezionata (click per cambiare) · sospesa (media attenuata + StatusBadge danger)" column>
                <CardGrid>
                    {SEDI.slice(0, 2).map(s => (
                        <CardGridItem
                            key={s.id}
                            image={cover(s.hue, s.city)}
                            title={s.name}
                            subtitle={s.city}
                            selected={selected === s.id}
                            onClick={() => setSelected(s.id)}
                        />
                    ))}
                    <CardGridItem
                        image={cover(0, "Sospesa")}
                        title="Pizzeria chiusa"
                        subtitle="Roma · sospesa il 3 settembre"
                        badge={<StatusBadge variant="danger" label="Sospesa" />}
                        suspended
                        actions={<TableRowActions actions={ROW_ACTIONS} />}
                    />
                </CardGrid>
            </State>
            <State label="media custom (campione di stile) · senza sottotitolo · titolo lungo in ellissi" column>
                <CardGrid>
                    <CardGridItem
                        media={<Palette size={40} strokeWidth={1.25} />}
                        title="Stile «Classico»"
                        badge={<Badge variant="brand">Predefinito</Badge>}
                        onClick={noop}
                    />
                    <CardGridItem media={<Palette size={40} strokeWidth={1.25} />} title="Stile «Notte»" subtitle="Scuro, serif" onClick={noop} />
                    <CardGridItem
                        media={<Palette size={40} strokeWidth={1.25} />}
                        title="Uno stile con un nome davvero troppo lungo per stare su una riga sola"
                        subtitle="Anche il sottotitolo va in ellissi quando la card è stretta come qui"
                        onClick={noop}
                    />
                </CardGrid>
            </State>
            <State label="caricamento (card Skeleton)" column>
                <CardGrid loading skeletonCount={3} />
            </State>
            <State label="vuoto: la pagina rende EmptyState page, non il grid" column>
                <EmptyState
                    icon={<Store />}
                    title="Nessuna sede"
                    description="Crea la prima sede per pubblicare un menù."
                    action={<Button onClick={noop}>Aggiungi sede</Button>}
                />
            </State>
        </>
    );
}

export const structureSections: GallerySection[] = [
    { id: "formgrid", title: "FormGrid + FormSection", sheet: "FormGrid", Component: FormGridSection },
    { id: "listrow", title: "ListRow", sheet: "ListRow", Component: ListRowSection },
    { id: "cardgrid", title: "CardGrid", sheet: "CardGrid", Component: CardGridSection }
];
