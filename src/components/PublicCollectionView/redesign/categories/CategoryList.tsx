import type { CollectionViewSectionGroup } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { categoryBoxes } from "./categoryBoxes";
import styles from "./CategoryList.module.scss";

type Props = {
    groups: readonly CollectionViewSectionGroup[];
    activeSectionId: string | null;
    /** depth 0 = categoria principale, 1+ = sottocategoria. */
    onSelect: (sectionId: string, depth: number) => void;
};

/**
 * Elenco delle categorie a riquadri (spec §4, D36): uno per categoria
 * principale, sottocategorie dentro, la corrente col fondo acceso. Lo usano il
 * foglio «Categorie» e la ricerca a campo vuoto.
 */
export default function CategoryList({ groups, activeSectionId, onSelect }: Props) {
    return (
        <ul className={styles.boxes}>
            {categoryBoxes(groups).map(box => (
                <li key={box.id} className={styles.box}>
                    <ul className={styles.boxRows}>
                        {box.rows.map(row => (
                            <li key={row.id}>
                                <button
                                    type="button"
                                    className={styles.row}
                                    data-depth={Math.min(row.depth, 2)}
                                    aria-current={row.id === activeSectionId ? "location" : undefined}
                                    onClick={() => onSelect(row.id, row.depth)}
                                >
                                    <span className={styles.name}>{row.name}</span>
                                    {row.count !== null ? <span className={styles.count}>{row.count}</span> : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ul>
    );
}
