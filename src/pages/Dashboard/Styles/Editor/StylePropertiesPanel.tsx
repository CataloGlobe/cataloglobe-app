import React from "react";
import Text from "@/components/ui/Text/Text";
import {
    StyleTokenModel,
    NavigationStyle,
    CardLayout,
    FontFamily,
    CardRadiusPreset
} from "./StyleTokenModel";
import { StyleColorPicker } from "./StyleColorPicker";
import { StyleSlider } from "./StyleSlider";
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
        { value: "tabs", label: "Tabs" },
        { value: "minimal", label: "Minimal" }
    ];

    const cardLayoutOptions: Array<{ value: CardLayout; label: string }> = [
        { value: "grid", label: "Grid" },
        { value: "list", label: "List" }
    ];

    const cardRadiusOptions: Array<{ value: CardRadiusPreset; label: string }> = [
        { value: "sharp", label: "Sharp" },
        { value: "rounded", label: "Rounded" }
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

    const updateHeader = (key: keyof StyleTokenModel["header"], value: number) => {
        onChange({
            ...model,
            header: { ...model.header, [key]: value }
        });
    };

    const updateNav = (style: NavigationStyle) => {
        onChange({
            ...model,
            navigation: { ...model.navigation, style }
        });
    };

    const updateCard = (layout: CardLayout) => {
        onChange({
            ...model,
            card: { ...model.card, layout }
        });
    };

    const updateCardRadius = (radius: CardRadiusPreset) => {
        onChange({
            ...model,
            card: { ...model.card, radius }
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
                    value={model.colors.primary}
                    onChange={val => updateColor("primary", val)}
                />
            </section>

            {/* HEADER */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Header
                </Text>

                <StyleColorPicker
                    label="Colore header"
                    value={model.colors.headerBackground}
                    onChange={val => updateColor("headerBackground", val)}
                />
                <StyleSlider
                    label="Bordo immagine"
                    value={model.header.imageBorderRadiusPx}
                    min={0}
                    max={24}
                    unit="px"
                    onChange={val => updateHeader("imageBorderRadiusPx", val)}
                />
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

                <div className={styles.controlField} style={{ marginTop: "8px" }}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Arrotondamento card
                    </Text>
                    <div className={`${styles.buttonGroup} ${styles.cards}`} role="radiogroup">
                        {cardRadiusOptions.map(option => {
                            const isActive = model.card.radius === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isActive}
                                    className={`${styles.optionButton} ${
                                        isActive ? styles.optionButtonActive : ""
                                    }`}
                                    onClick={() => updateCardRadius(option.value)}
                                >
                                    <Text as="span" variant="body" weight={600}>
                                        {option.label}
                                    </Text>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* IMAGE CONTROLS */}
                <div className={styles.controlField} style={{ marginTop: "12px" }}>
                    <Text variant="body" weight={500} className={styles.fieldLabel}>
                        Immagini prodotti
                    </Text>

                    {model.card.layout === "grid" ? (
                        <div className={`${styles.buttonGroup} ${styles.cards}`}>
                            {[
                                { value: "show", label: "Mostra" },
                                { value: "hide", label: "Nascondi" }
                            ].map(opt => {
                                const isActive = model.card.image.mode === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`${styles.optionButton} ${
                                            isActive ? styles.optionButtonActive : ""
                                        }`}
                                        onClick={() =>
                                            updateCardImage(
                                                opt.value as any,
                                                model.card.image.position
                                            )
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
                            {[
                                { value: "left", label: "Sinistra", mode: "show" },
                                { value: "right", label: "Destra", mode: "show" },
                                { value: "none", label: "Nessuna", mode: "hide" }
                            ].map(opt => {
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
                                        onClick={() =>
                                            updateCardImage(
                                                opt.mode as any,
                                                opt.value === "none"
                                                    ? model.card.image.position
                                                    : (opt.value as any)
                                            )
                                        }
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
            </section>

            {/* TESTI E SUPERFICI */}
            <section className={styles.panelSection}>
                <Text as="h4" variant="title-sm" weight={700} className={styles.sectionTitle}>
                    Testi e superfici
                </Text>

                <StyleColorPicker
                    label="Colore testo principale"
                    value={model.colors.textPrimary}
                    onChange={val => updateColor("textPrimary", val)}
                />
                <StyleColorPicker
                    label="Colore testo secondario"
                    value={model.colors.textSecondary}
                    onChange={val => updateColor("textSecondary", val)}
                />
                <StyleColorPicker
                    label="Sfondo contenuti (card / liste)"
                    value={model.colors.surface}
                    onChange={val => updateColor("surface", val)}
                />
                <StyleColorPicker
                    label="Colore bordi"
                    value={model.colors.border}
                    onChange={val => updateColor("border", val)}
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
