import React from "react";
import Text from "@/components/ui/Text/Text";
import { StyleTokenModel, NavigationStyle, CardLayout } from "./StyleTokenModel";
import { StyleColorPicker } from "./StyleColorPicker";
import { StyleSlider } from "./StyleSlider";
import styles from "./StyleSettingsControls.module.scss";

type StylePropertiesPanelProps = {
    model: StyleTokenModel;
    onChange: (newModel: StyleTokenModel) => void;
};

export const StylePropertiesPanel = ({ model, onChange }: StylePropertiesPanelProps) => {
    const navigationOptions: Array<{ value: NavigationStyle; label: string }> = [
        { value: "pill", label: "Pill" },
        { value: "tabs", label: "Tabs" },
        { value: "minimal", label: "Minimal" }
    ];

    const cardLayoutOptions: Array<{ value: CardLayout; label: string }> = [
        { value: "grid", label: "Grid" },
        { value: "list", label: "List" }
    ];

    const updateColor = (key: keyof StyleTokenModel["colors"], value: string) => {
        onChange({
            ...model,
            colors: { ...model.colors, [key]: value }
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
            </section>
        </div>
    );
};
