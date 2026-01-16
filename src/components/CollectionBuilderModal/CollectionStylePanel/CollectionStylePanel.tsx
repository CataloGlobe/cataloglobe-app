import { memo } from "react";
import Text from "@/components/ui/Text/Text";
import type { CollectionStyle } from "@/types/collectionStyle";
import styles from "./CollectionStylePanel.module.scss";
import { RangeInput } from "@/components/ui/Input/RangeInput";
import { ColorInput } from "@/components/ui/Input/ColorInput";
import { PillGroupSingle } from "@/components/ui/PillGroup/PillGroupSingle";

type OnStyleChange = <K extends keyof CollectionStyle>(next: Pick<CollectionStyle, K>) => void;

type Props = {
    styleDraft: CollectionStyle;
    resolvedStyle: Required<CollectionStyle>;
    onChange: OnStyleChange;
};

const SECTION_NAV_OPTIONS = [
    { value: "pill", label: "pill" },
    { value: "rounded", label: "rounded" },
    { value: "square", label: "square" }
] as const;

const CARD_TEMPLATE = [
    { value: "left", label: "left" },
    { value: "right", label: "right" },
    { value: "no-image", label: "no-image" }
] as const;

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
                    <PillGroupSingle
                        options={SECTION_NAV_OPTIONS}
                        value={value("sectionNavShape")}
                        label="Forma"
                        ariaLabel="Forma navigazione sezione"
                        layout="equal"
                        onChange={shape => onChange({ sectionNavShape: shape })}
                    />
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
                    <PillGroupSingle
                        options={CARD_TEMPLATE}
                        value={value("cardTemplate")}
                        label="Layout"
                        ariaLabel="Layout delle card"
                        layout="equal"
                        onChange={shape => onChange({ cardTemplate: shape })}
                    />
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
