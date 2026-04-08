import Text from "@/components/ui/Text/Text";
import type { StyleTokenModel } from "./StyleTokenModel";
import sharedStyles from "./StyleSettingsControls.module.scss";
import roStyles from "./StylePropertiesReadOnly.module.scss";

type Props = { model: StyleTokenModel };

export const StylePropertiesReadOnly = ({ model }: Props) => {
    const fontLabels: Record<string, string> = {
        inter: "Inter",
        poppins: "Poppins",
        playfair: "Playfair"
    };

    const fontFamilyCss: Record<string, string> = {
        inter: "'Inter', sans-serif",
        poppins: "'Poppins', sans-serif",
        playfair: "'Playfair Display', serif"
    };

    const imageLabel = (() => {
        if (model.card.layout === "grid") {
            return model.card.image.mode === "show" ? "Mostra" : "Nascondi";
        }
        if (model.card.image.mode === "hide") return "Nessuna";
        return model.card.image.position === "right" ? "Destra" : "Sinistra";
    })();

    return (
        <div className={sharedStyles.panelRoot}>
            {/* ASPETTO GENERALE */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Aspetto Generale
                </Text>
                <ColorReadRow label="Sfondo pagina" value={model.colors.pageBackground} />
                <ColorReadRow label="Colore primario" value={model.colors.primary} />
            </section>

            {/* HEADER */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Header
                </Text>
                <ColorReadRow label="Colore header" value={model.colors.headerBackground} />
                <ValueReadRow
                    label="Bordo immagine"
                    value={`${model.header.imageBorderRadiusPx}px`}
                />
            </section>

            {/* NAVIGAZIONE SEZIONI */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Navigazione Sezioni
                </Text>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Stile navigazione
                    </Text>
                    <OptionChipRow
                        options={[
                            { value: "pill", label: "Pill" },
                            { value: "tabs", label: "Tabs" },
                            { value: "minimal", label: "Minimal" }
                        ]}
                        active={model.navigation.style}
                    />
                </div>
            </section>

            {/* CARD LAYOUT */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Card Layout
                </Text>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Layout lista prodotti
                    </Text>
                    <OptionChipRow
                        options={[
                            { value: "grid", label: "Grid" },
                            { value: "list", label: "List" }
                        ]}
                        active={model.card.layout}
                    />
                </div>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Arrotondamento card
                    </Text>
                    <OptionChipRow
                        options={[
                            { value: "sharp", label: "Sharp" },
                            { value: "rounded", label: "Rounded" }
                        ]}
                        active={model.card.radius}
                    />
                </div>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Immagini prodotti
                    </Text>
                    <span className={roStyles.readChipActive}>{imageLabel}</span>
                </div>
            </section>

            {/* TESTI E SUPERFICI */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Testi e superfici
                </Text>
                <ColorReadRow label="Colore testo principale" value={model.colors.textPrimary} />
                <ColorReadRow label="Colore testo secondario" value={model.colors.textSecondary} />
                <ColorReadRow
                    label="Sfondo contenuti (card / liste)"
                    value={model.colors.surface}
                />
                <ColorReadRow label="Colore bordi" value={model.colors.border} />
            </section>

            {/* TIPOGRAFIA */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Tipografia
                </Text>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Font family
                    </Text>
                    <span
                        className={roStyles.readChipActive}
                        style={{ fontFamily: fontFamilyCss[model.typography.fontFamily] }}
                    >
                        {fontLabels[model.typography.fontFamily] ?? model.typography.fontFamily}
                    </span>
                </div>
            </section>
        </div>
    );
};

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ColorReadRow({ label, value }: { label: string; value: string }) {
    return (
        <div className={roStyles.readField}>
            <Text variant="body" weight={500} className={roStyles.readLabel}>
                {label}
            </Text>
            <div className={roStyles.colorReadValue}>
                <span className={roStyles.colorDot} style={{ background: value }} />
                <span className={roStyles.colorHex}>{value.toUpperCase()}</span>
            </div>
        </div>
    );
}

function ValueReadRow({ label, value }: { label: string; value: string }) {
    return (
        <div className={roStyles.readField}>
            <Text variant="body" weight={500} className={roStyles.readLabel}>
                {label}
            </Text>
            <span className={roStyles.readValue}>{value}</span>
        </div>
    );
}

function OptionChipRow({
    options,
    active
}: {
    options: Array<{ value: string; label: string }>;
    active: string;
}) {
    return (
        <div className={roStyles.chipRow}>
            {options.map(opt => (
                <span
                    key={opt.value}
                    className={`${roStyles.readChip} ${opt.value === active ? roStyles.readChipActive : ""}`}
                >
                    {opt.label}
                </span>
            ))}
        </div>
    );
}
