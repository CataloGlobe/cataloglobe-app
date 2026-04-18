import React from "react";
import Text from "@/components/ui/Text/Text";
import { InfoTooltip } from "@components/ui/Tooltip/InfoTooltip";
import {
    StyleTokenModel,
    NavigationStyle,
    CardLayout,
    ProductStyle,
    FontFamily,
    BorderRadius
} from "./StyleTokenModel";
import { StyleColorPicker } from "./StyleColorPicker";
import styles from "./StyleSettingsControls.module.scss";

type StylePropertiesPanelProps = {
    model: StyleTokenModel;
    onChange: (newModel: StyleTokenModel) => void;
};

export const StylePropertiesPanel = ({ model, onChange }: StylePropertiesPanelProps) => {
    const fontOptions: Array<{ value: FontFamily; label: string }> = [
        { value: "inter", label: "Inter" },
        { value: "poppins", label: "Poppins" },
        { value: "playfair", label: "Playfair" }
    ];

    const navigationOptions: Array<{ value: NavigationStyle; label: string }> = [
        { value: "pill", label: "Pill" },
        { value: "chip", label: "Chip" },
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

    const updateAppearance = (borderRadius: BorderRadius) => {
        onChange({ ...model, appearance: { ...model.appearance, borderRadius } });
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
                    value={model.colors.pageBackground}
                    onChange={val => updateColor("pageBackground", val)}
                />
                <StyleColorPicker
                    label="Colore primario"
                    labelSuffix={<InfoTooltip content="Applicato a: pulsanti attivi, navigazione categorie, prezzi, accenti e indicatori." />}
                    value={model.colors.primary}
                    onChange={val => updateColor("primary", val)}
                />

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Arrotondamento<InfoTooltip content="Controlla la curvatura degli angoli di card prodotti, pulsanti e immagini." />
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {borderRadiusOptions.map(option => {
                            const isActive = model.appearance.borderRadius === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateAppearance(option.value)}
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

            {/* HEADER */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Header
                </Text>

                {(
                    [
                        { key: "showLogo", label: "Logo" },
                        {
                            key: "showCoverImage",
                            label: "Header espanso",
                            tooltip: "Mostra l'header grande con immagine di copertina, logo e informazioni. Se disattivato, viene mostrato solo l'header compatto."
                        },
                        { key: "showCatalogName", label: "Nome catalogo" }
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
                        Stile navigazione
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.nav}`} role="radiogroup">
                        {navigationOptions.map(option => {
                            const isActive = model.navigation.style === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateNav(option.value)}
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

            {/* CARD LAYOUT */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Card Layout
                </Text>

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Stile prodotto
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {productStyleOptions.map(option => {
                            const isActive = model.card.productStyle === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateProductStyle(option.value)}
                                >
                                    <Text as="span" variant="body" weight={600}>
                                        {option.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className={`${styles.controlField} ${styles.controlFieldMt12}`}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Layout lista prodotti
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {cardLayoutOptions.map(option => {
                            const isActive = model.card.layout === option.value;
                            const previewClass =
                                option.value === "grid" ? styles.gridPreview : styles.listPreview;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${styles.cardOptionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateCard(option.value)}
                                >
                                    <div className={styles.layoutPreview} aria-hidden="true">
                                        <div className={previewClass}>
                                            <span />
                                            <span />
                                            {option.value === "list" && <span />}
                                        </div>
                                    </div>
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
                        Immagini prodotti
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
                        <div
                            className={`${styles.buttonGroup} ${styles.threeColumns}`}
                            role="radiogroup"
                        >
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
                                        className={`${styles.optionButton} ${
                                            isActive ? styles.optionButtonActive : ""
                                        }`}
                                        onClick={() => {
                                            const pos =
                                                opt.value !== "none"
                                                    ? opt.value
                                                    : model.card.image.position;
                                            updateCardImage(opt.mode, pos);
                                        }}
                                    >
                                        <Text variant="body" weight={600}>
                                            {opt.label}
                                        </Text>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                )}
            </section>

            {/* SUPERFICI */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Superfici
                </Text>

                <StyleColorPicker
                    label="Sfondo contenuti (card / liste)"
                    labelSuffix={<InfoTooltip content="Sfondo delle card prodotti e delle aree contenuto. Il colore del testo si adatta automaticamente per garantire la leggibilità." />}
                    value={model.colors.surface}
                    onChange={val => updateColor("surface", val)}
                />
            </section>

            {/* TIPOGRAFIA */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Tipografia
                </Text>

                <div className={styles.controlField}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Font family
                    </Text>
                    <div
                        className={`${styles.buttonGroup} ${styles.threeColumns}`}
                        role="radiogroup"
                    >
                        {fontOptions.map(option => {
                            const isActive = model.typography.fontFamily === option.value;
                            let ff = "'Inter', sans-serif";
                            if (option.value === "poppins") ff = "'Poppins', sans-serif";
                            if (option.value === "playfair") ff = "'Playfair Display', serif";

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateTypography(option.value)}
                                >
                                    <Text
                                        as="span"
                                        variant="body"
                                        weight={600}
                                        style={{ fontFamily: ff }}
                                    >
                                        {option.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>
        </div>
    );
};
