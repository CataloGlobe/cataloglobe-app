/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { FormGrid, FormSection, FORM_GRID_CLASSES } from "@/components/ui/FormGrid/FormGrid";
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

export const structureSections: GallerySection[] = [
    { id: "formgrid", title: "FormGrid + FormSection", sheet: "FormGrid", Component: FormGridSection }
];
