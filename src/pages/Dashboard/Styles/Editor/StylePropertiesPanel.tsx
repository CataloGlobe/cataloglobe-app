import Text from "@/components/ui/Text/Text";
import { InfoTooltip } from "@components/ui/Tooltip/InfoTooltip";
import {
    StyleTokenModel,
    NavigationStyle,
    CardLayout,
    ProductStyle,
    FontFamily,
    BorderRadius,
    BackgroundPattern,
    FeaturedStyle
} from "./StyleTokenModel";
import { getPatternCss } from "@/features/public/utils/mapStyleTokensToCssVars";
import { NavMiniPreview, RADIUS_CSS, ProductStylePreview, FeaturedStylePreview, ImagePositionPreview, CardLayoutPreview } from "./StyleMiniPreviews";
import { StyleColorPicker } from "./StyleColorPicker";
import styles from "./StyleSettingsControls.module.scss";

type StylePropertiesPanelProps = {
    model: StyleTokenModel;
    onChange: (newModel: StyleTokenModel) => void;
};

export const StylePropertiesPanel = ({ model, onChange }: StylePropertiesPanelProps) => {
    const fontOptions: Array<{ value: FontFamily; label: string; css: string }> = [
        { value: "inter", label: "Inter", css: "'Inter', sans-serif" },
        { value: "poppins", label: "Poppins", css: "'Poppins', sans-serif" },
        { value: "montserrat", label: "Montserrat", css: "'Montserrat', sans-serif" },
        { value: "josefin-sans", label: "Josefin Sans", css: "'Josefin Sans', sans-serif" },
        { value: "raleway", label: "Raleway", css: "'Raleway', sans-serif" },
        { value: "playfair", label: "Playfair", css: "'Playfair Display', serif" },
        { value: "lora", label: "Lora", css: "'Lora', serif" },
        { value: "cormorant-garamond", label: "Cormorant", css: "'Cormorant Garamond', serif" },
        { value: "caveat", label: "Caveat", css: "'Caveat', cursive" }
    ];

    const navigationOptions: Array<{ value: NavigationStyle; label: string }> = [
        { value: "filled", label: "Pill" },
        { value: "outline", label: "Outline" },
        { value: "tabs", label: "Tabs" },
        { value: "dot", label: "Dot" },
        { value: "minimal", label: "Minimal" }
    ];

    const productStyleOptions: Array<{ value: ProductStyle; label: string }> = [
        { value: "card", label: "Card" },
        { value: "compact", label: "Compatto" }
    ];

    const cardLayoutOptions: Array<{ value: CardLayout; label: string }> = [
        { value: "grid", label: "Grid" },
        { value: "list", label: "List" }
    ];

    const borderRadiusOptions: Array<{ value: BorderRadius; label: string }> = [
        { value: "none", label: "Nessuno" },
        { value: "soft", label: "Morbido" },
        { value: "rounded", label: "Arrotondato" }
    ];

    const backgroundPatternOptions: Array<{ value: BackgroundPattern; label: string }> = [
        { value: "none", label: "Nessuno" },
        { value: "dots", label: "Puntini" },
        { value: "diagonal", label: "Diagonali" },
        { value: "grid", label: "Griglia" },
        { value: "waves", label: "Onde" },
        { value: "diamonds", label: "Rombi" }
    ];

    const featuredStyleOptions: Array<{ value: FeaturedStyle; label: string }> = [
        { value: "card", label: "Card" },
        { value: "highlight", label: "Highlight" }
    ];

    const updateColor = (key: keyof StyleTokenModel["colors"], value: string) => {
        onChange({
            ...model,
            colors: { ...model.colors, [key]: value }
        });
    };

    const updateTypography = (fontFamily: FontFamily) => {
        onChange({
            ...model,
            typography: { ...model.typography, fontFamily }
        });
    };

    const updateBorderRadius = (borderRadius: BorderRadius) => {
        onChange({ ...model, appearance: { ...model.appearance, borderRadius } });
    };

    const updateBackgroundPattern = (backgroundPattern: BackgroundPattern) => {
        onChange({ ...model, appearance: { ...model.appearance, backgroundPattern } });
    };

    const updateFeaturedStyle = (featuredStyle: FeaturedStyle) => {
        onChange({ ...model, appearance: { ...model.appearance, featuredStyle } });
    };

    const updateHeaderBool = (
        key: "showLogo" | "showCoverImage" | "showCatalogName",
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

    const updateCard = (layout: CardLayout) => {
        onChange({
            ...model,
            card: { ...model.card, layout }
        });
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
                </Text>

                <StyleColorPicker
                    label="Sfondo pagina"
                    labelSuffix={<InfoTooltip content="Colore di sfondo dell'intera pagina pubblica." />}
                    value={model.colors.pageBackground}
                    onChange={val => updateColor("pageBackground", val)}
                />
                <StyleColorPicker
                    label="Colore primario"
                    labelSuffix={<InfoTooltip content="Colore principale applicato a header, navigazione, pulsanti e accenti nella pagina pubblica." />}
                    value={model.colors.primary}
                    onChange={val => updateColor("primary", val)}
                />
                <StyleColorPicker
                    label="Sfondo superfici"
                    labelSuffix={<InfoTooltip content="Sfondo di card prodotti, modali, pulsanti dell'header e altri elementi in primo piano." />}
                    value={model.colors.surface}
                    onChange={val => updateColor("surface", val)}
                />

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

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Pattern sfondo<InfoTooltip content="Aggiunge un motivo decorativo leggero allo sfondo, usando il colore primario." />
                    </Text>
                    <div className={styles.miniPreviewGrid} role="radiogroup">
                        {backgroundPatternOptions.map(option => {
                            const isActive = model.appearance.backgroundPattern === option.value;
                            const [bgImage, bgSize] = getPatternCss(option.value, model.colors.primary);
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
                        { key: "showCatalogName", label: "Nome catalogo", tooltip: "Mostra o nascondi il nome del catalogo sotto il nome della sede." }
                    ] as Array<{
                        key: "showLogo" | "showCoverImage" | "showCatalogName";
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

            {/* CARD LAYOUT */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Card Layout
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

                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Layout lista prodotti<InfoTooltip content="Grid mostra più prodotti affiancati su schermi ampi (desktop/tablet). Su mobile, entrambi i layout mostrano un prodotto per riga." />
                    </Text>
                    <div className={`${styles.miniPreviewGrid} ${styles.miniPreviewGridTwoCols}`} role="radiogroup">
                        {cardLayoutOptions.map(option => {
                            const isActive = model.card.layout === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.miniPreviewCard} ${
                                        isActive ? styles.miniPreviewCardActive : ""
                                    }`}
                                    onClick={() => updateCard(option.value)}
                                >
                                    <CardLayoutPreview variant={option.value} />
                                    <span className={styles.miniPreviewLabel}>{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* IMAGE CONTROLS — only for card style */}
                {model.card.productStyle !== "compact" && (
                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Immagini prodotti<InfoTooltip content="Posizione dell'immagine nella card prodotto. Visibile solo nello stile Card." />
                    </Text>

                    {model.card.layout === "grid" ? (
                        <div className={`${styles.buttonGroup} ${styles.cards}`}>
                            {(
                                [
                                    { value: "show", label: "Mostra" },
                                    { value: "hide", label: "Nascondi" }
                                ] as Array<{ value: "show" | "hide"; label: string }>
                            ).map(opt => {
                                const isActive = model.card.image.mode === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`${styles.optionButton} ${
                                            isActive ? styles.optionButtonActive : ""
                                        }`}
                                        onClick={() =>
                                            updateCardImage(opt.value, model.card.image.position)
                                        }
                                    >
                                        <Text variant="body" weight={600}>
                                            {opt.label}
                                        </Text>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
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
                    )}
                </div>
                )}

                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
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
