import Text from "@/components/ui/Text/Text";
import { InfoTooltip } from "@components/ui/Tooltip/InfoTooltip";
import {
    StyleTokenModel,
    NavigationStyle,
    ProductStyle,
    FontFamily,
    BorderRadius,
    BackgroundPattern,
    PatternIntensity,
    FeaturedStyle,
    CardTreatment,
    OutlinedBorderColor,
    IconStyle,
    CompactLayoutStyle,
    ContentDensity,
    isCardTreatmentActive
} from "./StyleTokenModel";
import { getPatternCss, contrastText } from "@/features/public/utils/mapStyleTokensToCssVars";
import { NavMiniPreview, RADIUS_CSS, ProductStylePreview, FeaturedStylePreview, ImagePositionPreview } from "./StyleMiniPreviews";
import { StyleColorPicker } from "./StyleColorPicker";
import { IconRefresh } from "@tabler/icons-react";
import { usePaletteWarnings } from "./usePaletteWarnings";
import { PaletteWarningsBox } from "./PaletteWarningsBox";
import styles from "./StyleSettingsControls.module.scss";

type StylePropertiesPanelProps = {
    model: StyleTokenModel;
    onChange: (newModel: StyleTokenModel) => void;
};

export const StylePropertiesPanel = ({ model, onChange }: StylePropertiesPanelProps) => {
    const paletteWarnings = usePaletteWarnings({
        primary: model.colors.primary,
        pageBackground: model.colors.pageBackground,
        accent: model.colors.accent
    });

    const fontOptions: Array<{ value: FontFamily; label: string; css: string }> = [
        { value: "inter", label: "Inter", css: "'Inter', sans-serif" },
        { value: "poppins", label: "Poppins", css: "'Poppins', sans-serif" },
        { value: "montserrat", label: "Montserrat", css: "'Montserrat', sans-serif" },
        { value: "josefin-sans", label: "Josefin Sans", css: "'Josefin Sans', sans-serif" },
        { value: "raleway", label: "Raleway", css: "'Raleway', sans-serif" },
        { value: "spectral", label: "Spectral", css: "'Spectral', serif" },
        { value: "lora", label: "Lora", css: "'Lora', serif" },
        { value: "eb-garamond", label: "EB Garamond", css: "'EB Garamond', serif" },
        { value: "patrick-hand", label: "Patrick Hand", css: "'Patrick Hand', cursive" }
    ];

    const navigationOptions: Array<{ value: NavigationStyle; label: string }> = [
        { value: "filled", label: "Pill" },
        { value: "tinted", label: "Soft" },
        { value: "outline", label: "Outline" },
        { value: "tabs", label: "Tabs" },
        { value: "minimal", label: "Minimal" }
    ];

    const productStyleOptions: Array<{ value: ProductStyle; label: string }> = [
        { value: "card", label: "Card" },
        { value: "compact", label: "Compatto" }
    ];

    const borderRadiusOptions: Array<{ value: BorderRadius; label: string }> = [
        { value: "none", label: "Nessuno" },
        { value: "soft", label: "Morbido" },
        { value: "rounded", label: "Arrotondato" }
    ];

    const cardTreatmentOptions: Array<{ value: CardTreatment; label: string }> = [
        { value: "raised", label: "Elevata" },
        { value: "bordered", label: "Contornata" },
        { value: "glass", label: "Vetro" }
    ];

    const outlinedBorderColorOptions: Array<{ value: OutlinedBorderColor; label: string }> = [
        { value: "auto", label: "Automatico" },
        { value: "primary", label: "Primario" }
    ];

    const backgroundPatternOptions: Array<{ value: BackgroundPattern; label: string }> = [
        { value: "none", label: "Nessuno" },
        { value: "dots", label: "Puntini" },
        { value: "diagonal", label: "Diagonali" },
        { value: "waves", label: "Onde" },
        { value: "crosshatch", label: "Trama" },
        { value: "noise", label: "Texture" }
    ];

    const patternIntensityOptions: Array<{ value: PatternIntensity; label: string }> = [
        { value: "subtle", label: "Soft" },
        { value: "medium", label: "Media" },
        { value: "strong", label: "Marcata" }
    ];

    const featuredStyleOptions: Array<{ value: FeaturedStyle; label: string }> = [
        { value: "card", label: "Card" },
        { value: "highlight", label: "Highlight" },
        { value: "compact", label: "Compatto" }
    ];

    const iconStyleOptions: Array<{ value: IconStyle; label: string }> = [
        { value: "plain", label: "Senza sfondo" },
        { value: "pill", label: "Con sfondo" }
    ];

    const compactLayoutStyleOptions: Array<{ value: CompactLayoutStyle; label: string }> = [
        { value: "editorial", label: "Editoriale" },
        { value: "modern", label: "Moderno" }
    ];

    const contentDensityOptions: Array<{ value: ContentDensity; label: string }> = [
        { value: "minimal", label: "Minimo" },
        { value: "standard", label: "Con descrizione" },
        { value: "full", label: "Completo" }
    ];

    const updateColor = (key: keyof StyleTokenModel["colors"], value: string | undefined) => {
        onChange({
            ...model,
            colors: { ...model.colors, [key]: value }
        });
    };

    // accent "collegato al primario" = campo assente (undefined)
    const accentLinked = !model.colors.accent;

    const updateTypography = (fontFamily: FontFamily) => {
        onChange({
            ...model,
            typography: { ...model.typography, fontFamily }
        });
    };

    const updateBorderRadius = (borderRadius: BorderRadius) => {
        onChange({ ...model, appearance: { ...model.appearance, borderRadius } });
    };

    const updateIconStyle = (iconStyle: IconStyle) => {
        onChange({ ...model, appearance: { ...model.appearance, iconStyle } });
    };

    const updateCardTreatment = (cardTreatment: CardTreatment) => {
        onChange({ ...model, appearance: { ...model.appearance, cardTreatment } });
    };

    const updateOutlinedBorderColor = (outlinedBorderColor: OutlinedBorderColor) => {
        onChange({ ...model, appearance: { ...model.appearance, outlinedBorderColor } });
    };

    const updateBackgroundPattern = (backgroundPattern: BackgroundPattern) => {
        onChange({ ...model, appearance: { ...model.appearance, backgroundPattern } });
    };

    const updatePatternIntensity = (patternIntensity: PatternIntensity) => {
        onChange({ ...model, appearance: { ...model.appearance, patternIntensity } });
    };

    const updateFeaturedStyle = (featuredStyle: FeaturedStyle) => {
        onChange({ ...model, appearance: { ...model.appearance, featuredStyle } });
    };

    const updateShowFeaturedSubtitle = (showFeaturedSubtitle: boolean) => {
        onChange({ ...model, appearance: { ...model.appearance, showFeaturedSubtitle } });
    };

    const updateHeaderBool = (
        key: "showLogo" | "showCoverImage" | "showCatalogName" | "showAddress",
        value: boolean
    ) => {
        onChange({ ...model, header: { ...model.header, [key]: value } });
    };

    const updateNav = (style: NavigationStyle) => {
        onChange({
            ...model,
            navigation: { ...model.navigation, style }
        });
    };

    const updateProductStyle = (productStyle: ProductStyle) => {
        onChange({ ...model, card: { ...model.card, productStyle } });
    };

    const updateCompactLayoutStyle = (compactLayoutStyle: CompactLayoutStyle) => {
        onChange({ ...model, card: { ...model.card, compactLayoutStyle } });
    };

    const updateContentDensity = (contentDensity: ContentDensity) => {
        onChange({ ...model, card: { ...model.card, contentDensity } });
    };

    const updateCardImage = (mode: "show" | "hide", position: "left" | "right") => {
        onChange({
            ...model,
            card: {
                ...model.card,
                image: { mode, position }
            }
        });
    };

    return (
        <div className={styles.panelRoot}>
            {/* ASPETTO GENERALE */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Aspetto Generale
                    {paletteWarnings.length > 0 && (
                        <span
                            className={styles.warningDot}
                            title={`${paletteWarnings.length} ${paletteWarnings.length === 1 ? "suggerimento" : "suggerimenti"} sulla palette`}
                            aria-label={`${paletteWarnings.length} ${paletteWarnings.length === 1 ? "suggerimento" : "suggerimenti"} sulla palette`}
                        />
                    )}
                </Text>

                <StyleColorPicker
                    label="Sfondo pagina"
                    labelSuffix={<InfoTooltip content="Colore di sfondo dell'intera pagina pubblica." />}
                    value={model.colors.pageBackground}
                    onChange={val => updateColor("pageBackground", val)}
                />
                <StyleColorPicker
                    label="Colore primario"
                    labelSuffix={<InfoTooltip content="Colore identità: header, navigazione, sezioni attive e marchio." />}
                    value={model.colors.primary}
                    onChange={val => updateColor("primary", val)}
                />

                {/* COLORE ACCENT (ruolo azione) — sempre visibile, segue il primario finché non personalizzato */}
                <StyleColorPicker
                    label="Colore secondario"
                    labelSuffix={<InfoTooltip content="Applicato ai pulsanti dei prodotti e alle call-to-action. Se non impostato, usa il colore primario." />}
                    value={model.colors.accent ?? model.colors.primary}
                    onChange={val => updateColor("accent", val)}
                />
                {accentLinked ? (
                    <Text as="p" variant="body" className={styles.linkedCaption}>
                        Uguale al colore primario · modificalo per personalizzarlo.
                    </Text>
                ) : (
                    <button
                        type="button"
                        className={styles.resetLink}
                        onClick={() => updateColor("accent", undefined)}
                    >
                        <IconRefresh size={13} stroke={1.8} />
                        Usa il colore primario
                    </button>
                )}

                <PaletteWarningsBox warnings={paletteWarnings} />

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Arrotondamento<InfoTooltip content="Controlla la curvatura degli angoli di card, immagini, pulsanti e pannelli nella pagina pubblica." />
                    </Text>
                    <div className={styles.miniPreviewGrid} role="radiogroup">
                        {borderRadiusOptions.map(option => {
                            const isActive = model.appearance.borderRadius === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateBorderRadius(option.value)}
                                >
                                    <div className={styles.radiusSwatch} aria-hidden="true">
                                        <div
                                            className={styles.radiusRect}
                                            style={{ borderRadius: RADIUS_CSS[option.value] }}
                                        />
                                    </div>
                                    <span className={styles.miniPreviewLabel}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {isCardTreatmentActive(model.card.productStyle, model.appearance.featuredStyle) && (
                    <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                        <Text variant="body" weight={500} className={styles.fieldLabel}>
                            Aspetto card<InfoTooltip content="Aspetto di card e finestre: Elevata usa un'ombra, Contornata un bordo sottile, Vetro una superficie semitrasparente con sfocatura. Si applica ai prodotti in stile Card e ai contenuti in evidenza in stile Card o Compatto." />
                        </Text>
                        <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                            {cardTreatmentOptions.map(option => {
                                const isActive = model.appearance.cardTreatment === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={isActive}
                                        className={`${styles.optionButton} ${
                                            isActive ? styles.optionButtonActive : ""
                                        }`}
                                        onClick={() => updateCardTreatment(option.value)}
                                    >
                                        <Text as="span" variant="body" weight={600}>
                                            {option.label}
                                        </Text>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Pattern sfondo<InfoTooltip content="Aggiunge un motivo decorativo leggero allo sfondo, usando il colore primario." />
                    </Text>
                    <div className={styles.miniPreviewGrid} role="radiogroup">
                        {backgroundPatternOptions.map(option => {
                            const isActive = model.appearance.backgroundPattern === option.value;
                            const [bgImage, bgSize] = getPatternCss(option.value, contrastText(model.colors.pageBackground));
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateBackgroundPattern(option.value)}
                                >
                                    <div
                                        className={styles.patternSwatch}
                                        aria-hidden="true"
                                        style={{
                                            backgroundColor: model.colors.pageBackground,
                                            backgroundImage: bgImage,
                                            backgroundSize: bgSize
                                        }}
                                    />
                                    <span className={styles.miniPreviewLabel}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {model.appearance.backgroundPattern !== "none" && (
                    <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                        <Text variant="body" weight={500} className={styles.fieldLabel}>
                            Intensità<InfoTooltip content="Regola quanto è visibile il pattern di sfondo." />
                        </Text>
                        <div className={styles.miniPreviewGrid} role="radiogroup">
                            {patternIntensityOptions.map(option => {
                                const isActive = model.appearance.patternIntensity === option.value;
                                const [bgImage, bgSize] = getPatternCss(
                                    model.appearance.backgroundPattern,
                                    contrastText(model.colors.pageBackground),
                                    option.value
                                );
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={isActive}
                                        className={`${styles.miniPreviewCard} ${
                                            isActive ? styles.miniPreviewCardActive : ""
                                        }`}
                                        onClick={() => updatePatternIntensity(option.value)}
                                    >
                                        <div
                                            className={styles.patternSwatch}
                                            aria-hidden="true"
                                            style={{
                                                backgroundColor: model.colors.pageBackground,
                                                backgroundImage: bgImage,
                                                backgroundSize: bgSize
                                            }}
                                        />
                                        <span className={styles.miniPreviewLabel}>{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </section>

            {/* HEADER */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Header
                </Text>

                {(
                    [
                        { key: "showLogo", label: "Logo", tooltip: "Mostra o nascondi il logo dell'azienda nella pagina pubblica." },
                        {
                            key: "showCoverImage",
                            label: "Header espanso",
                            tooltip: "Mostra l'header grande con immagine di copertina, logo e informazioni. Se disattivato, viene mostrato solo l'header compatto."
                        },
                        { key: "showCatalogName", label: "Nome catalogo", tooltip: "Mostra o nascondi il nome del catalogo sotto il nome della sede." },
                        { key: "showAddress", label: "Indirizzo", tooltip: "Mostra o nascondi l'indirizzo della sede sotto il nome." }
                    ] as Array<{
                        key: "showLogo" | "showCoverImage" | "showCatalogName" | "showAddress";
                        label: string;
                        tooltip?: string;
                    }>
                ).map(({ key, label, tooltip }) => (
                    <div key={key} className={`${styles.controlField} ${styles.controlFieldMt8}`}>
                        <Text variant="body" weight={500} className={styles.fieldLabel}>
                            {label}{tooltip && <InfoTooltip content={tooltip} />}
                        </Text>
                        <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                            {(
                                [
                                    { value: true, label: "Mostra" },
                                    { value: false, label: "Nascondi" }
                                ] as Array<{ value: boolean; label: string }>
                            ).map(opt => {
                                const isActive = model.header[key] === opt.value;
                                return (
                                    <button
                                        key={String(opt.value)}
                                        type="button"
                                        className={`${styles.optionButton} ${
                                            isActive ? styles.optionButtonActive : ""
                                        }`}
                                        onClick={() => updateHeaderBool(key, opt.value)}
                                    >
                                        <Text as="span" variant="body" weight={600}>
                                            {opt.label}
                                        </Text>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </section>

            {/* NAVIGAZIONE SEZIONI */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Navigazione Sezioni
                </Text>

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Stile navigazione<InfoTooltip content="Aspetto delle categorie nella barra di navigazione." />
                    </Text>
                    <div className={styles.miniPreviewGrid} role="radiogroup">
                        {navigationOptions.map(option => {
                            const isActive = model.navigation.style === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateNav(option.value)}
                                >
                                    <div className={styles.navSwatch} aria-hidden="true">
                                        <NavMiniPreview navStyle={option.value} primaryColor={model.colors.primary} borderRadius={model.appearance.borderRadius} />
                                    </div>
                                    <span className={styles.miniPreviewLabel}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* CONTENUTI IN EVIDENZA */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Contenuti in evidenza
                </Text>

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Stile contenuti in evidenza<InfoTooltip content="Card mostra immagine e testo separati. Highlight sovrappone il testo all'immagine." />
                    </Text>
                    <div className={`${styles.miniPreviewGrid} ${styles.miniPreviewGridTwoCols}`} role="radiogroup">
                        {featuredStyleOptions.map(option => {
                            const isActive = model.appearance.featuredStyle === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateFeaturedStyle(option.value)}
                                >
                                    <FeaturedStylePreview variant={option.value} />
                                    <span className={styles.miniPreviewLabel}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Descrizione nell'anteprima<InfoTooltip content="Mostra o nascondi la riga descrittiva sotto il titolo, nella card dell'overview. Nella finestra di dettaglio resta sempre visibile." />
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {(
                            [
                                { value: true, label: "Mostra" },
                                { value: false, label: "Nascondi" }
                            ] as Array<{ value: boolean; label: string }>
                        ).map(opt => {
                            const isActive = (model.appearance.showFeaturedSubtitle ?? true) === opt.value;
                            return (
                                <button
                                    key={String(opt.value)}
                                    type="button"
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateShowFeaturedSubtitle(opt.value)}
                                >
                                    <Text as="span" variant="body" weight={600}>
                                        {opt.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* PRODOTTI */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Prodotti
                </Text>

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Stile prodotto<InfoTooltip content="Card mostra immagine e dettagli in un riquadro. Compatto mostra solo nome, prezzo e descrizione." />
                    </Text>
                    <div className={`${styles.miniPreviewGrid} ${styles.miniPreviewGridTwoCols}`} role="radiogroup">
                        {productStyleOptions.map(option => {
                            const isActive = model.card.productStyle === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateProductStyle(option.value)}
                                >
                                    <ProductStylePreview variant={option.value} />
                                    <span className={styles.miniPreviewLabel}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {model.card.productStyle === "card" && model.appearance.cardTreatment === "bordered" && (
                    <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                        <Text variant="body" weight={500} className={styles.fieldLabel}>
                            Colore bordo<InfoTooltip content="Automatico deriva il colore dal contrasto con lo sfondo. Primario usa il colore identità dello stile." />
                        </Text>
                        <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                            {outlinedBorderColorOptions.map(option => {
                                const isActive = (model.appearance.outlinedBorderColor ?? "auto") === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={isActive}
                                        className={`${styles.optionButton} ${
                                            isActive ? styles.optionButtonActive : ""
                                        }`}
                                        onClick={() => updateOutlinedBorderColor(option.value)}
                                    >
                                        <Text as="span" variant="body" weight={600}>
                                            {option.label}
                                        </Text>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Layout List/Grid rimosso: la Card si riorienta in automatico via
                    container query (riga sotto 1024px, colonna multi-col sopra);
                    il Compatto usa il grid auto-fit guidato dalla densità. */}

                {model.card.productStyle === "compact" && (
                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Variante Compatto<InfoTooltip content="Editoriale collega nome e prezzo con una linea di puntini, come un menù classico. Moderno li lascia separati." />
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {compactLayoutStyleOptions.map(option => {
                            const isActive = (model.card.compactLayoutStyle ?? "modern") === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateCompactLayoutStyle(option.value)}
                                >
                                    <Text as="span" variant="body" weight={600}>
                                        {option.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>
                )}

                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Densità contenuti<InfoTooltip content="Minimo mostra solo nome e prezzo. Con descrizione aggiunge la descrizione. Completo mostra anche abbinamenti e allergeni. Prezzo, sconto e bottone ordina restano sempre visibili." />
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {contentDensityOptions.map(option => {
                            const isActive = (model.card.contentDensity ?? "full") === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateContentDensity(option.value)}
                                >
                                    <Text as="span" variant="body" weight={600}>
                                        {option.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* IMAGE CONTROLS — only for card style */}
                {model.card.productStyle !== "compact" && (
                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Immagini prodotti<InfoTooltip content="Posizione dell'immagine nella card prodotto quando la lista è a una colonna; su schermi ampi, con più colonne, l'immagine va automaticamente sopra. Visibile solo nello stile Card." />
                    </Text>

                    <div className={styles.miniPreviewGrid} role="radiogroup">
                            {(
                                [
                                    { value: "left", label: "Sinistra", mode: "show" },
                                    { value: "right", label: "Destra", mode: "show" },
                                    { value: "none", label: "Nessuna", mode: "hide" }
                                ] as Array<{
                                    value: "left" | "right" | "none";
                                    mode: "show" | "hide";
                                    label: string;
                                }>
                            ).map(opt => {
                                const isActive =
                                    opt.mode === "hide"
                                        ? model.card.image.mode === "hide"
                                        : model.card.image.mode === "show" &&
                                          model.card.image.position === opt.value;

                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={isActive}
                                        className={`${styles.miniPreviewCard} ${
                                            isActive ? styles.miniPreviewCardActive : ""
                                        }`}
                                        onClick={() => {
                                            const pos =
                                                opt.value !== "none"
                                                    ? opt.value
                                                    : model.card.image.position;
                                            updateCardImage(opt.mode, pos);
                                        }}
                                    >
                                        <ImagePositionPreview variant={opt.value} />
                                        <span className={styles.miniPreviewLabel}>{opt.label}</span>
                                    </button>
                                );
                            })}
                    </div>
                </div>
                )}

                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Stile icone<InfoTooltip content="Mostra le icone di allergeni e caratteristiche senza sfondo oppure con uno sfondo colorato, la cui forma segue l'impostazione Arrotondamento." />
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {iconStyleOptions.map(option => {
                            const isActive = (model.appearance.iconStyle ?? "plain") === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateIconStyle(option.value)}
                                >
                                    <Text as="span" variant="body" weight={600}>
                                        {option.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* TIPOGRAFIA */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Tipografia
                </Text>

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Font family<InfoTooltip content="Tipo di carattere usato in tutta la pagina pubblica." />
                    </Text>
                    <div className={styles.miniPreviewGrid} role="radiogroup">
                        {fontOptions.map(option => {
                            const isActive = model.typography.fontFamily === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateTypography(option.value)}
                                >
                                    <span
                                        className={styles.fontPreviewLabel}
                                        style={{ fontFamily: option.css }}
                                    >
                                        {option.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>
        </div>
    );
};
