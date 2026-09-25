/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { Euro } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { ColorInput } from "@/components/ui/Input/ColorInput";
import { FileInput } from "@/components/ui/Input/FileInput";
import { RangeInput } from "@/components/ui/Input/RangeInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { InputBase } from "@/components/ui/Input/InputBase";
import { FormField } from "@/components/ui/FormField/FormField";
import { Select } from "@/components/ui/Select/Select";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Switch } from "@/components/ui/Switch/Switch";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { RoleSelector } from "@/components/ui/RoleSelector/RoleSelector";
import { ActivityMultiSelect } from "@/components/ui/ActivityMultiSelect/ActivityMultiSelect";
import { ImageUploadField } from "@/components/ui/ImageUploadField/ImageUploadField";
import type { UserRole } from "@/lib/permissions";
import { State, noop, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

/**
 * I 5 stati della scheda FormField per un controllo: default · focus (si
 * ottiene con Tab, `autoFocus` non è replicabile su più campi) · error ·
 * disabled · con helper. Il focus si guarda navigando con la tastiera.
 */
function HourRange() {
    const [minutes, setMinutes] = useState(12 * 60);
    return (
        <RangeInput
            aria-label="Ora del giorno"
            min={0}
            max={24 * 60}
            step={30}
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            showValue={false}
            marks={["00", "06", "12", "18", "24"]}
        />
    );
}

function FiveStates({
    label,
    render
}: {
    label: string;
    render: (props: { helperText?: string; error?: string; disabled?: boolean }) => React.ReactNode;
}) {
    return (
        <State label={label} column>
            <div className={styles.narrow}>{render({})}</div>
            <div className={styles.narrow}>{render({ helperText: "Un aiuto che previene l'errore." })}</div>
            <div className={styles.narrow}>{render({ error: "Valore non valido." })}</div>
            <div className={styles.narrow}>{render({ disabled: true })}</div>
        </State>
    );
}

function FormFieldSection() {
    const control = (
        <input className={styles.nakedInput} placeholder="controllo qualsiasi" />
    );
    return (
        <>
            <State label="label + helper" column>
                <div className={styles.narrow}>
                    <FormField label="Nome della sede" helperText="Compare nella pagina pubblica.">
                        {({ inputId, describedById }) => (
                            <input id={inputId} aria-describedby={describedById} className={styles.nakedInput} placeholder="Trattoria del Porto" />
                        )}
                    </FormField>
                </div>
            </State>
            <State label="required + error (sostituisce l'helper)" column>
                <div className={styles.narrow}>
                    <FormField label="Email" required helperText="Non la vedrai mai: l'errore vince." error="Inserisci un'email valida.">
                        {({ inputId, describedById, hasError }) => (
                            <input id={inputId} aria-describedby={describedById} aria-invalid={hasError} className={styles.nakedInput} placeholder="nome@esempio.it" />
                        )}
                    </FormField>
                </div>
            </State>
            <State label="disabled · senza label" column>
                <div className={styles.narrow}>
                    <FormField label="Coperti" disabled>
                        {({ inputId, isDisabled }) => <input id={inputId} disabled={isDisabled} className={styles.nakedInput} placeholder="40" />}
                    </FormField>
                </div>
                <div className={styles.narrow}>
                    <FormField helperText="Solo l'aiuto, niente etichetta.">{() => control}</FormField>
                </div>
            </State>
        </>
    );
}

function InputSection() {
    const [color, setColor] = useState("#6366f1");
    const [file, setFile] = useState<File | null>(null);
    return (
        <>
            <FiveStates label="TextInput" render={p => <TextInput label="Nome della sede" placeholder="Trattoria del Porto" {...p} />} />
            <FiveStates
                label="TextInput con adornment"
                render={p => <TextInput label="Prezzo" placeholder="0,00" startAdornment={<Euro size={16} />} {...p} />}
            />
            <FiveStates label="NumberInput" render={p => <NumberInput label="Coperti" placeholder="40" {...p} />} />
            <FiveStates label="SearchInput" render={p => <SearchInput label="Cerca" placeholder="Cerca un piatto" allowClear {...p} />} />
            <FiveStates label="DateInput" render={p => <DateInput label="Data" {...p} />} />
            <FiveStates label="TimeInput" render={p => <TimeInput label="Ora" {...p} />} />
            <FiveStates
                label="ColorInput"
                render={p => <ColorInput label="Colore primario" value={color} onChange={setColor} allowTextInput {...p} />}
            />
            <FiveStates
                label="FileInput"
                render={p => <FileInput label="Logo" value={file} onChange={setFile} accept="image/*" maxSizeMb={2} {...p} />}
            />
            <FiveStates label="RangeInput" render={p => <RangeInput label="Zoom" min={1} max={3} step={0.1} defaultValue={1} showValue {...p} />} />
            <State label="RangeInput con tacche (il cursore dell'ora di Programmazione): a passi di 30 minuti, valore nascosto" column>
                <div className={styles.narrow}>
                    <HourRange />
                </div>
            </State>
            <FiveStates
                label="CheckboxInput"
                render={p => <CheckboxInput label="Accetto i termini" description="Obbligatorio per procedere" {...p} />}
            />
            <State label="required (asterisco nella label)">
                <div className={styles.narrow}>
                    <TextInput label="Email" required placeholder="nome@esempio.it" />
                </div>
            </State>
            <State label="InputBase (render prop)">
                <div className={styles.narrow}>
                    <InputBase label="Controllo custom" helperText="InputBase avvolge qualsiasi controllo.">
                        {({ inputId, describedById, hasError, isDisabled }) => (
                            <input
                                id={inputId}
                                aria-describedby={describedById}
                                aria-invalid={hasError}
                                disabled={isDisabled}
                                placeholder="input nudo"
                            />
                        )}
                    </InputBase>
                </div>
            </State>
        </>
    );
}

const SELECT_OPTIONS = [
    { value: "ristorante", label: "Ristorante" },
    { value: "bar", label: "Bar" },
    { value: "negozio", label: "Negozio", disabled: true }
];

function SelectSection() {
    return <FiveStates label="Select" render={p => <Select label="Tipo di sede" options={SELECT_OPTIONS} defaultValue="bar" {...p} />} />;
}

function TextareaSection() {
    return (
        <FiveStates
            label="Textarea"
            render={p => <Textarea label="Descrizione" placeholder="Racconta la sede in due righe" rows={3} {...p} />}
        />
    );
}

function SwitchSection() {
    const [on, setOn] = useState(true);
    return (
        <>
            <State label="off / on">
                <Switch label="Mostra nella pagina pubblica" checked={false} onChange={noop} />
                <Switch label="Mostra nella pagina pubblica" checked onChange={noop} />
            </State>
            <State label="controllato">
                <Switch label="Ordini dal tavolo" checked={on} onChange={setOn} description="Si attiva subito, senza salvare." />
            </State>
            <State label="helper / error / disabled">
                <Switch label="Prenotazioni" checked onChange={noop} helperText="Richiede gli orari di apertura." />
                <Switch label="Prenotazioni" checked={false} onChange={noop} error="Mancano gli orari di apertura." />
                <Switch label="Prenotazioni" checked onChange={noop} disabled />
            </State>
            <State label="senza label (ariaLabel)">
                <Switch ariaLabel="Attiva" checked onChange={noop} />
            </State>
            <State label="size=sm (nelle righe)">
                <Switch ariaLabel="Attiva" checked onChange={noop} size="sm" />
                <Switch ariaLabel="Attiva" checked={false} onChange={noop} size="sm" />
            </State>
        </>
    );
}

function RadioGroupSection() {
    const [value, setValue] = useState("auto");
    const [plan, setPlan] = useState("pro");
    const options = [
        { value: "auto", label: "Automatica", description: "Conferma subito se c'è posto." },
        { value: "manual", label: "Manuale", description: "Confermi tu ogni richiesta." },
        { value: "off", label: "Disattivata", disabled: true, disabledReason: "Serve almeno una sede con la sala configurata." }
    ];
    const plans = [
        { value: "base", label: "Base", description: "Una sede, menù pubblico, QR. 19 € al mese." },
        { value: "pro", label: "Pro", description: "Fino a 5 sedi, ordini al tavolo, prenotazioni. 48 € al mese." },
        { value: "dedicated", label: "Dedicato", description: "Oltre 5 sedi: un piano su misura.", disabled: true, disabledReason: "Scrivi all'assistenza per un piano dedicato." }
    ];
    return (
        <>
            <State label="list (default): radio 16 · etichetta 14/500 · descrizione muta · disabilitata con tooltip">
                <RadioGroup label="Accettazione" value={value} onChange={setValue} options={options} />
            </State>
            <State label="card: riquadri con bordo, selezionato brand + brand-soft, hover, focus (Tab)" column>
                <div className={styles.narrow}>
                    <RadioGroup label="Piano" variant="card" value={plan} onChange={setPlan} options={plans} helperText="Puoi cambiarlo quando vuoi." />
                </div>
            </State>
            <State label="helper / error / disabled (list)">
                <RadioGroup label="Accettazione" value={value} onChange={setValue} options={options} helperText="Puoi cambiarla quando vuoi." />
                <RadioGroup label="Accettazione" value={value} onChange={setValue} options={options} error="Scegli una modalità." />
                <RadioGroup label="Accettazione" value={value} onChange={setValue} options={options} disabled />
            </State>
        </>
    );
}

const GALLERY_SEDI = [
    "Garbagnate", "Comasina", "Città Studi", "Varedo", "Baranzate", "Navigli",
    "Isola", "Porta Romana", "Bicocca", "Lambrate", "Brera", "Tortona"
].map((name, i) => ({ id: `sede-${i}`, name }));

function ActivityMultiSelectSection() {
    const [many, setMany] = useState<string[]>(["sede-1"]);
    const [few, setFew] = useState<string[]>([]);
    return (
        <>
            <State label="12 sedi: sopra le 8 compare la ricerca (nome, senza accenti)" column>
                <div className={styles.narrow}>
                    <ActivityMultiSelect tenantId="" callerScopedActivityIds={[]} callerIsTenantWide activities={GALLERY_SEDI} value={many} onChange={setMany} />
                </div>
            </State>
            <State label="3 sedi: niente ricerca" column>
                <div className={styles.narrow}>
                    <ActivityMultiSelect tenantId="" callerScopedActivityIds={[]} callerIsTenantWide activities={GALLERY_SEDI.slice(0, 3)} value={few} onChange={setFew} required={false} />
                </div>
            </State>
        </>
    );
}

const ROLES: UserRole[] = ["owner", "admin", "manager", "staff", "viewer"];

function RoleSelectorSection() {
    const [role, setRole] = useState<UserRole | null>("staff");
    return (
        <>
            <State label="tutti i ruoli">
                <RoleSelector value={role} onChange={setRole} availableRoles={ROLES} />
            </State>
            <State label="solo i ruoli invitabili da un manager">
                <RoleSelector value={role} onChange={setRole} availableRoles={["staff", "viewer"]} />
            </State>
            <State label="disabled">
                <RoleSelector value={role} onChange={noop} availableRoles={ROLES} disabled />
            </State>
        </>
    );
}

function ImageUploadFieldSection() {
    const cover = "/favicon/cataloglobe_icon_flat_primary_180.png";
    const pending = new File([new Uint8Array(2_400_000)], "foto-sala.jpg", { type: "image/jpeg" });
    return (
        <>
            <State label="vuoto: wide 16:10 (default) · square · product 4:3, coi vincoli in caption" column>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina della sede" imageUrl={null} onFileChange={noop} helperText="Compare in testa alla pagina pubblica." />
                </div>
                <div className={styles.narrow}>
                    <ImageUploadField label="Logo" variant="square" imageUrl={null} onFileChange={noop} accept="image/png,image/svg+xml" maxSizeMb={1} />
                </div>
                <div className={styles.narrow}>
                    <ImageUploadField label="Foto del piatto" variant="product" imageUrl={null} onFileChange={noop} />
                </div>
            </State>
            <State label="pronto: anteprima FramedMedia + Sostituisci · Inquadra · Rimuovi (wide, square)" column>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina" imageUrl={cover} onFileChange={noop} onRemove={noop} onReframe={noop} />
                </div>
                <div className={styles.narrow}>
                    <ImageUploadField label="Logo" variant="square" imageUrl={cover} onFileChange={noop} onRemove={noop} />
                </div>
            </State>
            <State label="file pendente (nome + peso · non salvato) · caricamento (ProgressBar)" column>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina" imageUrl={cover} pendingFile={pending} onFileChange={noop} onRemove={noop} />
                </div>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina" imageUrl={cover} pendingFile={pending} onFileChange={noop} uploadProgress={62} />
                </div>
            </State>
            <State label="errore (la zona resta) · disabilitato" column>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina" imageUrl={null} onFileChange={noop} error="Il file supera 5 MB." />
                </div>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina" imageUrl={null} onFileChange={noop} disabled />
                </div>
            </State>
            <State label="trascinamento: trascina un file sulla zona (bordo brand, fondo brand-soft)" column>
                <div className={styles.narrow}>
                    <ImageUploadField label="Copertina" imageUrl={null} onFileChange={noop} />
                </div>
            </State>
        </>
    );
}

export const formsSections: GallerySection[] = [
    { id: "formfield", title: "FormField", sheet: "FormField", Component: FormFieldSection },
    { id: "input", title: "Input (10 tipi)", sheet: "FormField", Component: InputSection },
    { id: "select", title: "Select", sheet: "FormField", Component: SelectSection },
    { id: "textarea", title: "Textarea", sheet: "FormField", Component: TextareaSection },
    { id: "switch", title: "Switch", sheet: "Switch", Component: SwitchSection },
    { id: "radiogroup", title: "RadioGroup", sheet: "RadioGroup", Component: RadioGroupSection },
    { id: "roleselector", title: "RoleSelector", Component: RoleSelectorSection },
    { id: "activitymultiselect", title: "ActivityMultiSelect", Component: ActivityMultiSelectSection },
    { id: "imageuploadfield", title: "ImageUploadField", sheet: "ImageUploadField", Component: ImageUploadFieldSection }
];
