/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useState } from "react";
import { Plus, Trash2, Save, Grid2X2, List, Star } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { SplitButton } from "@/components/ui/Button/SplitButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Pill } from "@/components/ui/Pill/Pill";
import { PillGroupSingle } from "@/components/ui/PillGroup/PillGroupSingle";
import { PillGroupMultiple } from "@/components/ui/PillGroup/PillGroupMultiple";
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

function PillSection() {
    const [single, setSingle] = useState<"glutine" | "latte" | "uova" | undefined>("glutine");
    const [multi, setMulti] = useState<readonly ("glutine" | "latte" | "uova")[]>(["latte"]);
    const options = [
        { value: "glutine" as const, label: "Glutine" },
        { value: "latte" as const, label: "Latte" },
        { value: "uova" as const, label: "Uova" }
    ];
    return (
        <>
            <State label="default / active / disabled">
                <Pill label="Vegano" onClick={noop} />
                <Pill label="Vegano" active onClick={noop} />
                <Pill label="Vegano" disabled onClick={noop} />
                <Pill label="Con icona" icon={<Star size={14} />} onClick={noop} />
            </State>
            <State label="shape">
                {(["pill", "rounded", "square", "circle"] as const).map(shape => (
                    <Pill key={shape} label={shape === "circle" ? "A" : shape} shape={shape} active onClick={noop} />
                ))}
            </State>
            <State label="PillGroupSingle">
                <PillGroupSingle options={options} value={single} onChange={setSingle} ariaLabel="Allergene" />
            </State>
            <State label="PillGroupMultiple">
                <PillGroupMultiple options={options} value={multi} onChange={setMulti} ariaLabel="Allergeni" />
            </State>
        </>
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
    { id: "pill", title: "Pill · PillGroup", sheet: "Chip", Component: PillSection },
    { id: "tabs", title: "Tabs", sheet: "Tabs", Component: TabsSection },
    { id: "badge", title: "Badge", sheet: "Badge", Component: BadgeSection },
    { id: "statusbadge", title: "StatusBadge", sheet: "StatusBadge", Component: StatusBadgeSection }
];
