import Text from "@/components/ui/Text/Text";
import { InfoTooltip } from "@components/ui/Tooltip/InfoTooltip";
import type { StyleTokenModel } from "./StyleTokenModel";
import sharedStyles from "./StyleSettingsControls.module.scss";
import roStyles from "./StylePropertiesReadOnly.module.scss";

type Props = { model: StyleTokenModel };

export const StylePropertiesReadOnly = ({ model }: Props) => {
    const navLabels: Record<string, string> = {
        pill: "Pill",
        chip: "Chip",
        outline: "Outline",
        tabs: "Tabs",
        dot: "Dot",
        minimal: "Minimal"
    };

    const fontLabels: Record<string, string> = {
        inter: "Inter",
        poppins: "Poppins",
        playfair: "Playfair"
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
                <ColorReadRow label="Sfondo pagina" value={model.colors.pageBackground} tooltip="Colore di sfondo dell'intera pagina pubblica." />
                <ColorReadRow label="Colore primario" value={model.colors.primary} tooltip="Colore principale applicato a header, navigazione, pulsanti e accenti nella pagina pubblica." />
                <ColorReadRow label="Sfondo superfici" value={model.colors.surface} tooltip="Sfondo di card prodotti, modali, pulsanti dell'header e altri elementi in primo piano." />
                <ValueReadRow
                    label="Arrotondamento"
                    tooltip="Controlla la curvatura degli angoli di card, immagini, pulsanti e pannelli nella pagina pubblica."
                    value={
                        model.appearance.borderRadius === "none"
                            ? "Nessuno"
                            : model.appearance.borderRadius === "soft"
                              ? "Morbido"
                              : "Arrotondato"
                    }
                />
                <ValueReadRow
                    label="Pattern sfondo"
                    tooltip="Aggiunge un motivo decorativo leggero allo sfondo, usando il colore primario."
                    value={
                        ({
                            none: "Nessuno",
                            dots: "Puntini",
                            diagonal: "Diagonali",
                            grid: "Griglia",
                            waves: "Onde",
                            diamonds: "Rombi"
                        } as Record<string, string>)[model.appearance.backgroundPattern] ?? "Nessuno"
                    }
                />
            </section>

            {/* HEADER */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Header
                </Text>
                <ColorReadRow label="Colore header" value={model.colors.headerBackground} tooltip="Colore di sfondo dell'header nella pagina pubblica." />
                <ValueReadRow
                    label="Logo"
                    tooltip="Mostra o nascondi il logo dell'azienda nella pagina pubblica."
                    value={model.header.showLogo ? "Visibile" : "Nascosto"}
                />
                <ValueReadRow
                    label="Immagine copertina"
                    tooltip="Mostra l'header grande con immagine di copertina, logo e informazioni. Se disattivato, viene mostrato solo l'header compatto."
                    value={model.header.showCoverImage ? "Visibile" : "Nascosta"}
                />
                <ValueReadRow
                    label="Nome catalogo"
                    tooltip="Mostra o nascondi il nome del catalogo sotto il nome della sede."
                    value={model.header.showCatalogName ? "Visibile" : "Nascosto"}
                />
            </section>

            {/* NAVIGAZIONE SEZIONI */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Navigazione Sezioni
                </Text>
                <ValueReadRow
                    label="Stile navigazione"
                    tooltip="Aspetto delle categorie nella barra di navigazione."
                    value={navLabels[model.navigation.style] ?? model.navigation.style}
                />
            </section>

            {/* CARD LAYOUT */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Card Layout
                </Text>
                <ValueReadRow
                    label="Stile prodotto"
                    tooltip="Card mostra immagine e dettagli in un riquadro. Compatto mostra solo nome, prezzo e descrizione."
                    value={model.card.productStyle === "compact" ? "Compatto" : "Card"}
                />
                <ValueReadRow
                    label="Layout lista prodotti"
                    tooltip="Grid mostra più prodotti affiancati su schermi ampi (desktop/tablet). Su mobile, entrambi i layout mostrano un prodotto per riga."
                    value={model.card.layout === "grid" ? "Grid" : "List"}
                />
                {model.card.productStyle !== "compact" && (
                    <ValueReadRow label="Immagini prodotti" tooltip="Posizione dell'immagine nella card prodotto. Visibile solo nello stile Card." value={imageLabel} />
                )}
                <ValueReadRow
                    label="Stile contenuti in evidenza"
                    tooltip="Card mostra immagine e testo separati. Highlight sovrappone il testo all'immagine."
                    value={model.appearance.featuredStyle === "highlight" ? "Highlight" : "Card"}
                />
            </section>

            {/* TESTI */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Testi
                </Text>
                <ColorReadRow label="Colore testo principale" value={model.colors.textPrimary} />
                <ColorReadRow label="Colore testo secondario" value={model.colors.textSecondary} />
                <ColorReadRow label="Colore bordi" value={model.colors.border} />
            </section>

            {/* TIPOGRAFIA */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Tipografia
                </Text>
                <ValueReadRow
                    label="Font family"
                    tooltip="Tipo di carattere usato in tutta la pagina pubblica."
                    value={fontLabels[model.typography.fontFamily] ?? model.typography.fontFamily}
                />
            </section>
        </div>
    );
};

/* ── Sub-components ─────────────────────────────────────────────────────── */

function ColorReadRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
    return (
        <div className={roStyles.readField}>
            <Text variant="body" weight={500} className={roStyles.readLabel}>
                {label}{tooltip && <InfoTooltip content={tooltip} />}
            </Text>
            <div className={roStyles.colorReadValue}>
                <span className={roStyles.colorDot} style={{ background: value }} />
                <span className={roStyles.colorHex}>{value.toUpperCase()}</span>
            </div>
        </div>
    );
}

function ValueReadRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
    return (
        <div className={roStyles.readField}>
            <Text variant="body" weight={500} className={roStyles.readLabel}>
                {label}{tooltip && <InfoTooltip content={tooltip} />}
            </Text>
            <span className={roStyles.readValue}>{value}</span>
        </div>
    );
}
