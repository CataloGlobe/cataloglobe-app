import { memo } from "react";
import Text from "@/components/ui/Text/Text";
import type { CollectionStyle, CardTemplate, SectionNavShape } from "@/types/collectionStyle";
import styles from "./CollectionStylePanel.module.scss";
import { RangeInput } from "@/components/ui/Input/RangeInput";
import { ColorInput } from "@/components/ui/Input/ColorInput";

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

                <ColorInput
                    label="Sfondo pagina"
                    value={value("backgroundColor")}
                    onChange={color => onChange({ backgroundColor: color })}
                />
            </div>

            {/* =====================
          HEADER
      ===================== */}
            <div className={styles.section}>
                <Text variant="body" weight={700}>
                    Header
                </Text>

                <ColorInput
                    label="Colore header"
                    value={value("headerBackgroundColor")}
                    onChange={color => onChange({ headerBackgroundColor: color })}
                />

                <RangeInput
                    label="Bordo immagine"
                    showValue={false}
                    min={0}
                    max={32}
                    step={2}
                    value={value("heroImageRadius")}
                    onChange={e => onChange({ heroImageRadius: Number(e.target.value) })}
                />
            </div>

            {/* =====================
          NAVIGAZIONE
      ===================== */}
            <div className={styles.section}>
                <Text variant="body" weight={700}>
                    Navigazione sezioni
                </Text>

                <ColorInput
                    label="Colore"
                    value={value("sectionNavColor")}
                    onChange={color => onChange({ sectionNavColor: color })}
                />

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

                <ColorInput
                    label="Colore"
                    value={value("cardBackgroundColor")}
                    onChange={color => onChange({ cardBackgroundColor: color })}
                />

                <div className={styles.controlGroup}>
                    <RangeInput
                        label="Bordo Card"
                        showValue={false}
                        min={0}
                        max={32}
                        step={2}
                        value={value("cardRadius")}
                        onChange={e => onChange({ cardRadius: Number(e.target.value) })}
                    />
                </div>
            </div>
        </div>
    );
}

export default memo(CollectionStylePanel);
