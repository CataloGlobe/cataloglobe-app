/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { Plus, Trash2, Save, Grid2X2, List, Star } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SplitButton } from "@/components/ui/Button/SplitButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Chip } from "@/components/ui/Chip/Chip";
import { ChipGroupSingle, ChipGroupMultiple } from "@/components/ui/Chip/ChipGroup";
import { Pill } from "@/components/ui/Pill/Pill";
import { PillGroupSingle } from "@/components/ui/PillGroup/PillGroupSingle";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { Badge } from "@/components/ui/Badge/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { State, noop, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

const TEXT_VARIANTS = [
    "display",
    "title-lg",
    "title-md",
    "title-sm",
    "body-lg",
    "body",
    "body-sm",
    "caption",
    "caption-xs",
    "button"
] as const;

const TEXT_COLORS = [
    "default",
    "muted",
    "success",
    "error",
    "warning",
    "info",
    "primary",
    "dark",
    "white"
] as const;

function TextSection() {
    return (
        <>
            {TEXT_VARIANTS.map(variant => (
                <State key={variant} label={variant}>
                    <Text variant={variant}>Il menù del giorno, pronto in cucina</Text>
                </State>
            ))}
            <State label="pesi 400 / 500 / 600 / 700">
                {([400, 500, 600, 700] as const).map(weight => (
                    <Text key={weight} variant="body" weight={weight}>
                        Peso {weight}
                    </Text>
                ))}
            </State>
            {TEXT_COLORS.map(color => (
                <State key={color} label={`colorVariant=${color}`}>
                    <span
                        style={
                            color === "white"
                                ? { background: "var(--brand-primary)", padding: "4px 8px", borderRadius: 4 }
                                : undefined
                        }
                    >
                        <Text variant="body-sm" colorVariant={color}>
                            Testo {color}
                        </Text>
                    </span>
                </State>
            ))}
        </>
    );
}

const BUTTON_VARIANTS = ["primary", "secondary", "outline", "outline-danger", "ghost", "danger"] as const;

function ButtonSection() {
    return (
        <>
            {(["md", "sm", "lg"] as const).map(size => (
                <State key={size} label={`size=${size} — default`}>
                    {BUTTON_VARIANTS.map(variant => (
                        <Button key={variant} variant={variant} size={size} onClick={noop}>
                            {variant}
                        </Button>
                    ))}
                </State>
            ))}
            <State label="disabled">
                {BUTTON_VARIANTS.map(variant => (
                    <Button key={variant} variant={variant} disabled onClick={noop}>
                        {variant}
                    </Button>
                ))}
            </State>
            <State label="loading">
                {BUTTON_VARIANTS.map(variant => (
                    <Button key={variant} variant={variant} loading onClick={noop}>
                        {variant}
                    </Button>
                ))}
            </State>
            <State label="con icona">
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={noop}>
                    Aggiungi sede
                </Button>
                <Button variant="secondary" rightIcon={<Save size={16} />} onClick={noop}>
                    Salva
                </Button>
                <Button variant="danger" leftIcon={<Trash2 size={16} />} onClick={noop}>
                    Elimina
                </Button>
            </State>
            <State label="fullWidth">
                <Button variant="primary" fullWidth onClick={noop}>
                    Pubblica
                </Button>
            </State>
            <State label="as=a (link)">
                <Button as="a" href="#" variant="ghost">
                    Vai alla pagina pubblica
                </Button>
            </State>
            <State label="IconButton">
                {(["primary", "secondary", "outline", "ghost", "danger"] as const).map(variant => (
                    <IconButton key={variant} variant={variant} icon={<Star size={16} />} aria-label={variant} />
                ))}
                <IconButton variant="secondary" icon={<Star size={16} />} aria-label="disabled" disabled />
                <IconButton variant="secondary" icon={<Star size={16} />} aria-label="loading" loading />
                {(["sm", "md", "lg"] as const).map(size => (
                    <IconButton key={size} size={size} variant="secondary" icon={<Star size={16} />} aria-label={size} />
                ))}
            </State>
            <State label="SplitButton">
                <SplitButton
                    primaryLabel="Salva"
                    onPrimaryClick={noop}
                    options={[
                        { label: "Salva e chiudi", onClick: noop },
                        { label: "Salva come bozza", onClick: noop }
                    ]}
                />
                <SplitButton primaryLabel="Salva" onPrimaryClick={noop} options={[{ label: "Salva e chiudi", onClick: noop }]} size="sm" />
                <SplitButton primaryLabel="Salva" onPrimaryClick={noop} options={[{ label: "Salva e chiudi", onClick: noop }]} loading />
                <SplitButton primaryLabel="Salva" onPrimaryClick={noop} options={[{ label: "Salva e chiudi", onClick: noop }]} disabled />
            </State>
        </>
    );
}

function SegmentedControlSection() {
    const [view, setView] = useState<"grid" | "list">("grid");
    const [answer, setAnswer] = useState<"yes" | "no" | "ask">("yes");
    const options = [
        { value: "grid" as const, label: "Griglia", icon: <Grid2X2 size={16} /> },
        { value: "list" as const, label: "Lista", icon: <List size={16} /> }
    ];
    return (
        <>
            <State label="md">
                <SegmentedControl
                    value={answer}
                    onChange={setAnswer}
                    options={[
                        { value: "yes", label: "Sì" },
                        { value: "no", label: "No" },
                        { value: "ask", label: "Solo su richiesta" }
                    ]}
                />
            </State>
            <State label="sm">
                <SegmentedControl value={view} onChange={setView} options={options} size="sm" />
            </State>
            <State label="iconsOnly">
                <SegmentedControl value={view} onChange={setView} options={options} iconsOnly />
                <SegmentedControl value={view} onChange={setView} options={options} iconsOnly size="sm" />
            </State>
        </>
    );
}

function ChipSection() {
    const [single, setSingle] = useState<"glutine" | "latte" | "uova" | undefined>("glutine");
    const [multi, setMulti] = useState<readonly ("glutine" | "latte" | "uova")[]>(["latte"]);
    const [tags, setTags] = useState(["Vegano", "Senza glutine", "Piccante"]);
    const options = [
        { value: "glutine" as const, label: "Glutine" },
        { value: "latte" as const, label: "Latte" },
        { value: "uova" as const, label: "Uova" }
    ];
    return (
        <>
            <State label="default / hover / selected (spunta) / disabled">
                <Chip label="Vegano" onClick={noop} />
                <Chip label="Vegano" selected onClick={noop} />
                <Chip label="Vegano" disabled onClick={noop} />
                <Chip label="Vegano" selected disabled onClick={noop} />
                <Chip label="Con icona" icon={<Star size={16} />} onClick={noop} />
            </State>
            <State label="removable (×)">
                {tags.map(tag => (
                    <Chip key={tag} label={tag} onRemove={() => setTags(t => t.filter(x => x !== tag))} />
                ))}
                {tags.length === 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setTags(["Vegano", "Senza glutine", "Piccante"])}>
                        Ripristina
                    </Button>
                )}
            </State>
            <State label="Pill (alias deprecato, active=selected)">
                <Pill label="Vegano" active onClick={noop} />
            </State>
            <State label="shape deprecate (solo pill nel sistema)">
                {(["pill", "rounded", "square", "circle"] as const).map(shape => (
                    <Chip key={shape} label={shape === "circle" ? "A" : shape} shape={shape} selected onClick={noop} />
                ))}
            </State>
            <State label="ChipGroupSingle (default rounded)">
                <ChipGroupSingle options={options} value={single} onChange={setSingle} ariaLabel="Allergene" label="Allergene" />
            </State>
            <State label="ChipGroupMultiple shape=pill">
                <ChipGroupMultiple options={options} value={multi} onChange={setMulti} ariaLabel="Allergeni" shape="pill" />
            </State>
            <State label="PillGroupSingle (alias deprecato)">
                <PillGroupSingle options={options} value={single} onChange={setSingle} ariaLabel="Allergene" />
            </State>
        </>
    );
}

/** Riga «Allineamento»: i controlli affiancati devono condividere bordo
 *  superiore e inferiore (38px). Le altezze si leggono da console:
 *  `[...document.querySelectorAll('#allineamento [data-align]')].map(e => e.getBoundingClientRect().height)` */
function AlignmentSection() {
    const [seg, setSeg] = useState<"grid" | "list">("grid");
    const [search, setSearch] = useState("");
    return (
        <State label="Button md · TextInput · Select · SegmentedControl md · ToolbarSearch" column>
            <div className={styles.alignRow}>
                <div data-align="button">
                    <Button variant="primary" onClick={noop}>
                        Nuova sede
                    </Button>
                </div>
                <div data-align="textinput">
                    <TextInput placeholder="Nome" />
                </div>
                <div data-align="select">
                    <Select options={[{ value: "a", label: "Ristorante" }]} />
                </div>
                <div data-align="segmented">
                    <SegmentedControl
                        value={seg}
                        onChange={setSeg}
                        options={[
                            { value: "grid", label: "Griglia", icon: <Grid2X2 size={16} /> },
                            { value: "list", label: "Lista", icon: <List size={16} /> }
                        ]}
                    />
                </div>
                <div data-align="toolbarsearch">
                    <ToolbarSearch value={search} onChange={setSearch} placeholder="Cerca" />
                </div>
            </div>
        </State>
    );
}

function TabsSection() {
    const [tab, setTab] = useState("menu");
    const [tab2, setTab2] = useState("menu");
    const [tab3, setTab3] = useState("menu");
    const render = (value: string, onChange: (v: string) => void, variant: "primary" | "secondary" | "line") => (
        <Tabs value={value} onChange={onChange} variant={variant}>
            <Tabs.List>
                <Tabs.Tab value="menu">Menù</Tabs.Tab>
                <Tabs.Tab value="piatti" badge={<Badge variant="primary">12</Badge>}>
                    Piatti
                </Tabs.Tab>
                <Tabs.Tab value="storie" disabled disabledTooltip="Disponibile con il piano Pro">
                    Storie
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="menu">
                <div className={styles.tabsPanel}>
                    <Text variant="body-sm" colorVariant="muted">
                        Pannello Menù
                    </Text>
                </div>
            </Tabs.Panel>
            <Tabs.Panel value="piatti">
                <div className={styles.tabsPanel}>
                    <Text variant="body-sm" colorVariant="muted">
                        Pannello Piatti
                    </Text>
                </div>
            </Tabs.Panel>
        </Tabs>
    );
    return (
        <>
            <State label="primary (badge, disabled)" column>
                {render(tab, setTab, "primary")}
            </State>
            <State label="secondary" column>
                {render(tab2, setTab2, "secondary")}
            </State>
            <State label="line" column>
                {render(tab3, setTab3, "line")}
            </State>
        </>
    );
}

function BadgeSection() {
    return (
        <>
            <State label="variant">
                {(["primary", "secondary", "success", "danger", "warning"] as const).map(variant => (
                    <Badge key={variant} variant={variant}>
                        {variant}
                    </Badge>
                ))}
            </State>
            <State label="color custom">
                <Badge color="#0f766e">Personalizzato</Badge>
            </State>
            <State label="absolute (angolo di un riquadro)">
                <div style={{ position: "relative", width: 96, height: 48, border: "1px solid var(--border)", borderRadius: 8 }}>
                    <Badge variant="primary" absolute top={-8} right={-8}>
                        3
                    </Badge>
                </div>
            </State>
        </>
    );
}

function StatusBadgeSection() {
    return (
        <State label="variant">
            <StatusBadge variant="success" label="Pubblicata" />
            <StatusBadge variant="neutral" label="Bozza" />
            <StatusBadge variant="warning" label="In attesa" />
            <StatusBadge variant="info" label="In corso" />
            <StatusBadge variant="pending" label="Sospesa" />
        </State>
    );
}

export const textAndActionsSections: GallerySection[] = [
    { id: "text", title: "Text", sheet: "Text", Component: TextSection },
    { id: "button", title: "Button · IconButton · SplitButton", sheet: "Button", Component: ButtonSection },
    { id: "segmented", title: "SegmentedControl", sheet: "SegmentedControl", Component: SegmentedControlSection },
    { id: "chip", title: "Chip · ChipGroup (era Pill)", sheet: "Chip", Component: ChipSection },
    { id: "allineamento", title: "Allineamento dei controlli", sheet: "FormField", Component: AlignmentSection },
    { id: "tabs", title: "Tabs", sheet: "Tabs", Component: TabsSection },
    { id: "badge", title: "Badge", sheet: "Badge", Component: BadgeSection },
    { id: "statusbadge", title: "StatusBadge", sheet: "StatusBadge", Component: StatusBadgeSection }
];
