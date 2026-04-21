import Text from "@/components/ui/Text/Text";
import { InfoTooltip } from "@components/ui/Tooltip/InfoTooltip";
import type { StyleTokenModel, BackgroundPattern, BorderRadius, NavigationStyle, ProductStyle, FeaturedStyle } from "./StyleTokenModel";
import { getPatternCss } from "@/features/public/utils/mapStyleTokensToCssVars";
import { NavMiniPreview, RADIUS_CSS, ProductStylePreview, FeaturedStylePreview, ImagePositionPreview, CardLayoutPreview } from "./StyleMiniPreviews";
import sharedStyles from "./StyleSettingsControls.module.scss";
import roStyles from "./StylePropertiesReadOnly.module.scss";

type Props = { model: StyleTokenModel };

export const StylePropertiesReadOnly = ({ model }: Props) => {
    const fontLabels: Record<string, string> = {
        inter: "Inter",
        poppins: "Poppins",
        playfair: "Playfair"
    };

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
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Arrotondamento<InfoTooltip content="Controlla la curvatura degli angoli di card, immagini, pulsanti e pannelli nella pagina pubblica." />
                    </Text>
                    <div className={sharedStyles.miniPreviewGrid}>
                        {(
                            [
                                { value: "none" as BorderRadius, label: "Nessuno" },
                                { value: "soft" as BorderRadius, label: "Morbido" },
                                { value: "rounded" as BorderRadius, label: "Arrotondato" }
                            ]
                        ).map(opt => {
                            const isActive = model.appearance.borderRadius === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                        isActive ? sharedStyles.miniPreviewCardActive : ""
                                    }`}
                                >
                                    <div className={sharedStyles.radiusSwatch} aria-hidden="true">
                                        <div
                                            className={sharedStyles.radiusRect}
                                            style={{ borderRadius: RADIUS_CSS[opt.value] }}
                                        />
                                    </div>
                                    <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Pattern sfondo<InfoTooltip content="Aggiunge un motivo decorativo leggero allo sfondo, usando il colore primario." />
                    </Text>
                    <div className={sharedStyles.miniPreviewGrid}>
                        {(
                            [
                                { value: "none" as BackgroundPattern, label: "Nessuno" },
                                { value: "dots" as BackgroundPattern, label: "Puntini" },
                                { value: "diagonal" as BackgroundPattern, label: "Diagonali" },
                                { value: "grid" as BackgroundPattern, label: "Griglia" },
                                { value: "waves" as BackgroundPattern, label: "Onde" },
                                { value: "diamonds" as BackgroundPattern, label: "Rombi" }
                            ]
                        ).map(opt => {
                            const isActive = model.appearance.backgroundPattern === opt.value;
                            const [bgImage, bgSize] = getPatternCss(opt.value, model.colors.primary);
                            return (
                                <div
                                    key={opt.value}
                                    className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                        isActive ? sharedStyles.miniPreviewCardActive : ""
                                    }`}
                                >
                                    <div
                                        className={sharedStyles.patternSwatch}
                                        aria-hidden="true"
                                        style={{
                                            backgroundColor: model.colors.pageBackground,
                                            backgroundImage: bgImage,
                                            backgroundSize: bgSize
                                        }}
                                    />
                                    <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
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
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Stile navigazione<InfoTooltip content="Aspetto delle categorie nella barra di navigazione." />
                    </Text>
                    <div className={sharedStyles.miniPreviewGrid}>
                        {(
                            [
                                { value: "pill" as NavigationStyle, label: "Pill" },
                                { value: "chip" as NavigationStyle, label: "Chip" },
                                { value: "outline" as NavigationStyle, label: "Outline" },
                                { value: "tabs" as NavigationStyle, label: "Tabs" },
                                { value: "dot" as NavigationStyle, label: "Dot" },
                                { value: "minimal" as NavigationStyle, label: "Minimal" }
                            ]
                        ).map(opt => {
                            const isActive = model.navigation.style === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                        isActive ? sharedStyles.miniPreviewCardActive : ""
                                    }`}
                                >
                                    <div className={sharedStyles.navSwatch} aria-hidden="true">
                                        <NavMiniPreview navStyle={opt.value} primaryColor={model.colors.primary} />
                                    </div>
                                    <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* CARD LAYOUT */}
            <section className={sharedStyles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={sharedStyles.sectionTitle}>
                    Card Layout
                </Text>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Stile prodotto<InfoTooltip content="Card mostra immagine e dettagli in un riquadro. Compatto mostra solo nome, prezzo e descrizione." />
                    </Text>
                    <div className={`${sharedStyles.miniPreviewGrid} ${sharedStyles.miniPreviewGridTwoCols}`}>
                        {(
                            [
                                { value: "card" as ProductStyle, label: "Card" },
                                { value: "compact" as ProductStyle, label: "Compatto" }
                            ]
                        ).map(opt => {
                            const isActive = model.card.productStyle === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                        isActive ? sharedStyles.miniPreviewCardActive : ""
                                    }`}
                                >
                                    <ProductStylePreview variant={opt.value} />
                                    <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Layout lista prodotti<InfoTooltip content="Grid mostra più prodotti affiancati su schermi ampi (desktop/tablet). Su mobile, entrambi i layout mostrano un prodotto per riga." />
                    </Text>
                    <div className={`${sharedStyles.miniPreviewGrid} ${sharedStyles.miniPreviewGridTwoCols}`}>
                        {(
                            [
                                { value: "grid" as const, label: "Grid" },
                                { value: "list" as const, label: "List" }
                            ]
                        ).map(opt => {
                            const isActive = model.card.layout === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                        isActive ? sharedStyles.miniPreviewCardActive : ""
                                    }`}
                                >
                                    <CardLayoutPreview variant={opt.value} />
                                    <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {model.card.productStyle !== "compact" && (
                    <div className={sharedStyles.controlField}>
                        <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                            Immagini prodotti<InfoTooltip content="Posizione dell'immagine nella card prodotto. Visibile solo nello stile Card." />
                        </Text>
                        {model.card.layout === "grid" ? (
                            <span className={roStyles.readValue}>
                                {model.card.image.mode === "show" ? "Mostra" : "Nascondi"}
                            </span>
                        ) : (
                            <div className={sharedStyles.miniPreviewGrid}>
                                {(
                                    [
                                        { value: "left" as const, label: "Sinistra" },
                                        { value: "right" as const, label: "Destra" },
                                        { value: "none" as const, label: "Nessuna" }
                                    ]
                                ).map(opt => {
                                    const isActive =
                                        opt.value === "none"
                                            ? model.card.image.mode === "hide"
                                            : model.card.image.mode === "show" &&
                                              model.card.image.position === opt.value;
                                    return (
                                        <div
                                            key={opt.value}
                                            className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                                isActive ? sharedStyles.miniPreviewCardActive : ""
                                            }`}
                                        >
                                            <ImagePositionPreview variant={opt.value} />
                                            <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                <div className={sharedStyles.controlField}>
                    <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                        Stile contenuti in evidenza<InfoTooltip content="Card mostra immagine e testo separati. Highlight sovrappone il testo all'immagine." />
                    </Text>
                    <div className={`${sharedStyles.miniPreviewGrid} ${sharedStyles.miniPreviewGridTwoCols}`}>
                        {(
                            [
                                { value: "card" as FeaturedStyle, label: "Card" },
                                { value: "highlight" as FeaturedStyle, label: "Highlight" }
                            ]
                        ).map(opt => {
                            const isActive = model.appearance.featuredStyle === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    className={`${sharedStyles.miniPreviewCard} ${sharedStyles.miniPreviewCardReadonly} ${
                                        isActive ? sharedStyles.miniPreviewCardActive : ""
                                    }`}
                                >
                                    <FeaturedStylePreview variant={opt.value} />
                                    <span className={sharedStyles.miniPreviewLabel}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
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
