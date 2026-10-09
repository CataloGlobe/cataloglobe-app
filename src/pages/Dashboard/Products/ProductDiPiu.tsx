import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Chip } from "@/components/ui/Chip/Chip";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import Text from "@/components/ui/Text/Text";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { formatPrice } from "@/utils/formatCurrency";
import type { V2Product } from "@/services/supabase/products";
import type { GroupWithValues } from "@/services/supabase/productOptions";
import type { ProductUsageData } from "@/services/supabase/productUsage";
import type { SchedaDraft } from "./hooks/useSchedaDraft";
import ProductNotesSection from "./components/ProductNotesSection/ProductNotesSection";
import styles from "./ProductPage.module.scss";

export type DiPiuView = "scelte" | "dove" | "caratteristiche" | "abbinamenti" | "attributi";

interface ProductDiPiuProps {
    product: V2Product;
    draft: SchedaDraft;
    addonGroups: GroupWithValues[];
    optionsLoading: boolean;
    usageData: ProductUsageData | null;
    usageLoading: boolean;
    /** La card «Varianti» di Prezzi & Opzioni, così com'è. */
    variants: React.ReactNode;
    showAttributes: boolean;
    attributesLabel: string;
    onOpen: (view: DiPiuView) => void;
}

/** «una sola» · «fino a 3» · «quante vuole», più «obbligatoria». */
function ruleText(group: GroupWithValues): string {
    const count =
        group.max_selectable === 1
            ? "una sola"
            : group.max_selectable === null
              ? "quante vuole"
              : `fino a ${group.max_selectable}`;
    return group.is_required ? `${count} · obbligatoria` : count;
}

function optionsText(group: GroupWithValues): string {
    return group.values
        .map(v => (v.price_modifier ? `${v.name} (+${formatPrice(v.price_modifier)})` : v.name))
        .join(", ");
}

/**
 * «Il di più» della pagina del prodotto (Officina 3): scelte del cliente,
 * dove si trova, caratteristiche, note, abbinamenti, varianti. Le cose lunghe
 * mostrano un riassunto e si aprono in grande al centro («Modifica»).
 */
export function ProductDiPiu({
    product,
    draft,
    addonGroups,
    optionsLoading,
    usageData,
    usageLoading,
    variants,
    showAttributes,
    attributesLabel,
    onOpen
}: ProductDiPiuProps) {
    const verticalConfig = useVerticalConfig();
    const isBaseProduct = product.parent_product_id === null;
    const productLower = verticalConfig.productLabel.toLowerCase();
    const { characteristics, pairings, notes } = draft;
    const selectedChars = characteristics.available.filter(c => characteristics.draftIds.includes(c.id));
    const usage = usageData ?? { catalogs: [], schedules: [], activities: [] };

    const openButton = (label: string, view: DiPiuView) => (
        <Button variant="ghost" size="sm" onClick={() => onOpen(view)}>
            {label}
        </Button>
    );

    return (
        <div className={styles.boxes}>
            <Card
                title="Cosa sceglie il cliente"
                className={styles.span2}
                actions={openButton(addonGroups.length > 0 ? "Modifica" : "Aggiungi", "scelte")}
            >
                {optionsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento...
                    </Text>
                ) : addonGroups.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna scelta: il {productLower} si ordina così com'è.
                    </Text>
                ) : (
                    <ul className={styles.groupList} aria-label="Scelte del cliente">
                        {addonGroups.map(g => {
                            const tooMany =
                                g.max_selectable !== null && g.max_selectable > 1 && g.values.length > 0 && g.max_selectable > g.values.length;
                            return (
                                <li key={g.id} className={styles.groupRow}>
                                    <Text as="span" variant="body-sm" weight={600}>
                                        {g.name}
                                    </Text>
                                    <Text as="span" variant="caption" colorVariant="muted">
                                        {ruleText(g)}
                                    </Text>
                                    {g.values.length === 0 ? (
                                        <Text as="span" variant="body-sm" colorVariant="warning">
                                            nessuna opzione: il cliente non la vede
                                        </Text>
                                    ) : (
                                        <Text as="span" variant="body-sm" colorVariant="muted" className={styles.ellipsis}>
                                            {optionsText(g)}
                                            {tooMany && (
                                                <Text as="span" variant="body-sm" colorVariant="warning">
                                                    {` · fino a ${g.max_selectable}, ma le opzioni sono ${g.values.length}`}
                                                </Text>
                                            )}
                                        </Text>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

            <Card title="Dove si trova" actions={openButton("Vedi tutto", "dove")}>
                {usageLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento...
                    </Text>
                ) : (
                    <dl className={styles.where}>
                        <dt>{verticalConfig.catalogLabelPlural}</dt>
                        <dd>{usage.catalogs.length > 0 ? usage.catalogs.map(c => c.name).join(", ") : "nessuno"}</dd>
                        <dt>Regole</dt>
                        <dd>{usage.schedules.length > 0 ? usage.schedules.map(s => s.name).join(", ") : "nessuna"}</dd>
                        <dt>Oggi in</dt>
                        <dd>
                            {usage.activities.length > 0 ? (
                                usage.activities.map(a => a.name).join(", ")
                            ) : (
                                <Text as="span" variant="body-sm" colorVariant="warning">
                                    nessuna sede
                                </Text>
                            )}
                        </dd>
                    </dl>
                )}
            </Card>

            {isBaseProduct && draft.showCharacteristics && (
                <Card
                    title="Caratteristiche"
                    actions={openButton(selectedChars.length > 0 ? "Cambia" : "Scegli", "caratteristiche")}
                >
                    {selectedChars.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna. Vegano, piccante, fatto in casa…
                        </Text>
                    ) : (
                        <div className={styles.chips}>
                            {selectedChars.map(c => (
                                <Chip
                                    key={c.id}
                                    label={c.label_it}
                                    icon={<CharacteristicIcon icon={c.icon} size={16} variant="bare" />}
                                />
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {isBaseProduct && draft.showNotes && (
                <Card
                    title="Note"
                    subtitle="Provenienza, cottura, dettagli che non stanno nella descrizione."
                >
                    <ProductNotesSection value={notes.draft} onChange={notes.setDraft} disabled={notes.isSaving} />
                </Card>
            )}

            {isBaseProduct && draft.showPairings && (
                <Card
                    title="Perfetto con"
                    actions={openButton(pairings.draft.length > 0 ? "Modifica" : "Aggiungi", "abbinamenti")}
                >
                    {pairings.loading ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Caricamento...
                        </Text>
                    ) : pairings.draft.length === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            I {verticalConfig.productLabelPlural.toLowerCase()} che consigli insieme a questo.
                        </Text>
                    ) : (
                        <ul className={styles.plainList}>
                            {pairings.draft.map(p => (
                                <li key={p.pairedProductId}>
                                    <Text as="span" variant="body-sm" weight={600}>
                                        {p.pairedProductName ?? "Non disponibile"}
                                    </Text>
                                    {p.note && (
                                        <Text as="span" variant="body-sm" colorVariant="muted">
                                            {` · ${p.note}`}
                                        </Text>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            )}

            {showAttributes && (
                <Card title={attributesLabel} actions={openButton("Modifica", "attributi")}>
                    <Text variant="body-sm" colorVariant="muted">
                        Taglia, colore e gli altri dati del {productLower}.
                    </Text>
                </Card>
            )}

            {!isBaseProduct && (
                <Card title="Caratteristiche, note, abbinamenti">
                    <Text variant="body-sm" colorVariant="muted">
                        Quelli del {productLower} da cui viene: per cambiarli apri lui.
                    </Text>
                </Card>
            )}

            {variants && <div className={styles.span3}>{variants}</div>}
        </div>
    );
}
