import { memo } from "react";
import Text from "@/components/ui/Text/Text";
import { Input } from "@/components/ui";
import type { CollectionStyle, CardTemplate, SectionNavShape } from "@/types/collectionStyle";
import styles from "./CollectionStylePanel.module.scss";

type Props = {
    styleDraft: CollectionStyle;
    resolvedStyle: Required<CollectionStyle>;
    onChange: (next: Partial<CollectionStyle>) => void;
};

function CollectionStylePanel({ styleDraft, resolvedStyle, onChange }: Props) {
    const value = <K extends keyof CollectionStyle>(key: K) =>
        styleDraft[key] ?? resolvedStyle[key];

    return (
        <div className={styles.wrapper}>
            {/* =====================
          ASPETTO GENERALE
      ===================== */}
            <div className={styles.section}>
                <Text variant="body" weight={700}>
                    Aspetto generale
                </Text>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Sfondo pagina
                    </Text>

                    <div className={styles.colorRow}>
                        <input
                            type="color"
                            className={styles.colorInput}
                            value={value("backgroundColor")}
                            onChange={e => onChange({ backgroundColor: e.target.value })}
                        />
                        <Input
                            value={value("backgroundColor")}
                            onChange={e => onChange({ backgroundColor: e.target.value })}
                            placeholder="#ffffff"
                        />
                    </div>
                </div>
            </div>

            {/* =====================
          HEADER
      ===================== */}
            <div className={styles.section}>
                <Text variant="body" weight={700}>
                    Header
                </Text>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Colore header
                    </Text>

                    <div className={styles.colorRow}>
                        <input
                            type="color"
                            className={styles.colorInput}
                            value={value("headerBackgroundColor")}
                            onChange={e => onChange({ headerBackgroundColor: e.target.value })}
                        />
                        <Input
                            value={value("headerBackgroundColor")}
                            onChange={e => onChange({ headerBackgroundColor: e.target.value })}
                            placeholder="#ffffff"
                        />
                    </div>
                </div>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Bordo immagine
                    </Text>

                    <div className={styles.sliderRow}>
                        <input
                            type="range"
                            min={0}
                            max={32}
                            step={2}
                            value={value("heroImageRadius")}
                            onChange={e => onChange({ heroImageRadius: Number(e.target.value) })}
                        />
                        <Text variant="caption" colorVariant="muted">
                            {value("heroImageRadius")} px
                        </Text>
                    </div>
                </div>
            </div>

            {/* =====================
          NAVIGAZIONE
      ===================== */}
            <div className={styles.section}>
                <Text variant="body" weight={700}>
                    Navigazione sezioni
                </Text>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Colore
                    </Text>

                    <div className={styles.colorRow}>
                        <input
                            type="color"
                            className={styles.colorInput}
                            value={value("sectionNavColor")}
                            onChange={e => onChange({ sectionNavColor: e.target.value })}
                        />
                        <Input
                            value={value("sectionNavColor")}
                            onChange={e => onChange({ sectionNavColor: e.target.value })}
                            placeholder="#6366f1"
                        />
                    </div>
                </div>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Forma
                    </Text>

                    <div role="radiogroup" className={styles.segmentedRow}>
                        {(["rounded", "pill", "square"] as SectionNavShape[]).map(shape => (
                            <button
                                key={shape}
                                type="button"
                                role="radio"
                                aria-checked={value("sectionNavShape") === shape}
                                className={styles.segmentedBtn}
                                onClick={() => onChange({ sectionNavShape: shape })}
                            >
                                <Text variant="caption" weight={600}>
                                    {shape}
                                </Text>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* =====================
          CARD
      ===================== */}
            <div className={styles.section}>
                <Text variant="body" weight={700}>
                    Card
                </Text>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Layout
                    </Text>

                    <div role="radiogroup" className={styles.templateRow}>
                        {(["left", "right", "no-image"] as CardTemplate[]).map(tpl => (
                            <button
                                key={tpl}
                                type="button"
                                role="radio"
                                aria-checked={value("cardTemplate") === tpl}
                                className={styles.templateBtn}
                                onClick={() => onChange({ cardTemplate: tpl })}
                            >
                                <Text variant="caption" weight={600}>
                                    {tpl}
                                </Text>
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Colore
                    </Text>

                    <div className={styles.colorRow}>
                        <input
                            type="color"
                            className={styles.colorInput}
                            value={value("cardBackgroundColor")}
                            onChange={e => onChange({ cardBackgroundColor: e.target.value })}
                        />
                        <Input
                            value={value("cardBackgroundColor")}
                            onChange={e => onChange({ cardBackgroundColor: e.target.value })}
                            placeholder="#ffffff"
                        />
                    </div>
                </div>

                <div className={styles.controlGroup}>
                    <Text variant="caption" colorVariant="muted">
                        Bordo
                    </Text>

                    <div className={styles.sliderRow}>
                        <input
                            type="range"
                            min={0}
                            max={32}
                            step={2}
                            value={value("cardRadius")}
                            onChange={e => onChange({ cardRadius: Number(e.target.value) })}
                        />
                        <Text variant="caption" colorVariant="muted">
                            {value("cardRadius")} px
                        </Text>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default memo(CollectionStylePanel);
