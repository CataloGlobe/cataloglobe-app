import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUp, ChevronRight } from "lucide-react";
import PublicSheet from "../PublicSheet/PublicSheet";
import Text from "@/components/ui/Text/Text";
import type { CollectionViewSection, CollectionViewSectionGroup } from "../CollectionView/CollectionView";
import styles from "./CategoriesSheet.module.scss";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** Stessa fonte dati di `navItems`/`CollectionSectionNav` — nessun nuovo
     *  fetch/calcolo. L'albero L2/L3 è ricostruito localmente da `parentCategoryId`
     *  (già presente su ogni nodo), senza toccare `displaySectionGroups`. */
    groups: CollectionViewSectionGroup[];
    /** Tap su una voce L1 (con o senza figli) → `scrollToSection` esistente. */
    onSelectSection: (sectionId: string) => void;
    /** Tap su una sottocategoria a qualunque profondità (L2, L3, ...) →
     *  `scrollToSubSection` esistente. */
    onSelectSubSection: (childId: string) => void;
    /** "Torna in cima" → `scrollContainerToTop` esistente (stesso comportamento
     *  perso sostituendo il retap diretto sul tab "Menu"). */
    onBackToTop: () => void;
};

/** Raggruppa l'array flat `group.children` (L2+L3 interfogliati da
 *  `mapCatalogToSectionGroups`) per `parentCategoryId` — ricostruisce la
 *  gerarchia reale ad albero, profondità arbitraria. */
function buildChildrenMap(children: CollectionViewSection[]): Map<string, CollectionViewSection[]> {
    const map = new Map<string, CollectionViewSection[]>();
    for (const child of children) {
        const key = child.parentCategoryId ?? "";
        const bucket = map.get(key);
        if (bucket) bucket.push(child);
        else map.set(key, [child]);
    }
    return map;
}

/** Conteggio ricorsivo: prodotti propri + tutti i discendenti, a qualunque
 *  profondità. Per L1 riproduce esattamente il totale già mostrato prima
 *  (che sommava L2+L3 flat) — qui il MEDESIMO calcolo si applica anche a
 *  L2 (prima mostrava solo i propri, incoerente rispetto al totale L1). */
function aggregateCount(section: CollectionViewSection, childrenMap: Map<string, CollectionViewSection[]>): number {
    const kids = childrenMap.get(section.id) ?? [];
    return section.items.length + kids.reduce((sum, kid) => sum + aggregateCount(kid, childrenMap), 0);
}

type CategoryTreeRowProps = {
    section: CollectionViewSection;
    depth: number;
    childrenMap: Map<string, CollectionViewSection[]>;
    openIds: Set<string>;
    onToggle: (id: string) => void;
    onSelectSection: (id: string) => void;
    onSelectSubSection: (id: string) => void;
    t: TFunction;
};

/** Riga ricorsiva: ogni nodo con figli ottiene il proprio chevron
 *  espandi/collassa, indipendentemente dalla profondità — L1 resta la card
 *  piena (stile invariato), i discendenti (qualunque livello) usano il
 *  trattino/tick + indentazione crescente per livello. */
function CategoryTreeRow({
    section,
    depth,
    childrenMap,
    openIds,
    onToggle,
    onSelectSection,
    onSelectSubSection,
    t
}: CategoryTreeRowProps) {
    const isRoot = depth === 0;
    const kids = childrenMap.get(section.id) ?? [];
    const hasChildren = kids.length > 0;
    const expanded = openIds.has(section.id);
    const count = aggregateCount(section, childrenMap);
    const select = isRoot
        ? () => onSelectSection(section.id)
        : () => onSelectSubSection(section.id);

    const rowClass = isRoot ? styles.treeRow : `${styles.treeRow} ${styles.child}`;

    return (
        <li>
            {hasChildren ? (
                <div className={rowClass} data-expanded={expanded}>
                    <button
                        type="button"
                        className={`${styles.chevBtn} ${isRoot ? "" : styles.chevBtnSmall}`}
                        aria-expanded={expanded}
                        aria-label={t("categories.toggle_aria")}
                        onClick={() => onToggle(section.id)}
                    >
                        <ChevronRight size={16} strokeWidth={2.25} />
                    </button>
                    <button
                        type="button"
                        className={`${styles.rowMain} ${isRoot ? "" : styles.rowMainChild}`}
                        onClick={select}
                    >
                        {!isRoot && <span className={styles.tick} aria-hidden="true" />}
                        <span className={styles.name}>{section.name}</span>
                        <span className={styles.count}>{count}</span>
                    </button>
                </div>
            ) : isRoot ? (
                <div className={rowClass}>
                    <span className={styles.chevSpacer} aria-hidden="true" />
                    <button type="button" className={styles.rowMain} onClick={select}>
                        <span className={styles.name}>{section.name}</span>
                        <span className={styles.count}>{count}</span>
                    </button>
                </div>
            ) : (
                <button type="button" className={`${rowClass} ${styles.rowMainChild}`} onClick={select}>
                    <span className={styles.tick} aria-hidden="true" />
                    <span className={styles.name}>{section.name}</span>
                    <span className={styles.count}>{count}</span>
                </button>
            )}

            {hasChildren && expanded && (
                <ul className={`${styles.childList} ${isRoot ? "" : styles.childListNested}`}>
                    {kids.map(kid => (
                        <CategoryTreeRow
                            key={kid.id}
                            section={kid}
                            depth={depth + 1}
                            childrenMap={childrenMap}
                            openIds={openIds}
                            onToggle={onToggle}
                            onSelectSection={onSelectSection}
                            onSelectSubSection={onSelectSubSection}
                            t={t}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

export default function CategoriesSheet({
    isOpen,
    onClose,
    groups,
    onSelectSection,
    onSelectSubSection,
    onBackToTop
}: Props) {
    const { t } = useTranslation("public");
    const [openIds, setOpenIds] = useState<Set<string>>(new Set());

    const toggle = (id: string) => {
        setOpenIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={t("categories.sheet_title")}
            headerContent={
                <div className={styles.header}>
                    <Text variant="body" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                        {t("categories.sheet_title")}
                    </Text>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label={t("categories.close_aria")}
                    >
                        {t("categories.close_label")}
                    </button>
                </div>
            }
        >
            <div className={styles.body}>
                <button
                    type="button"
                    className={styles.backToTop}
                    onClick={onBackToTop}
                >
                    <ArrowUp size={16} strokeWidth={2.25} />
                    <span>{t("categories.back_to_top")}</span>
                </button>

                <ul className={styles.list}>
                    {groups.map(group => {
                        const childrenMap = buildChildrenMap(group.children);
                        return (
                            <CategoryTreeRow
                                key={group.root.id}
                                section={group.root}
                                depth={0}
                                childrenMap={childrenMap}
                                openIds={openIds}
                                onToggle={toggle}
                                onSelectSection={onSelectSection}
                                onSelectSubSection={onSelectSubSection}
                                t={t}
                            />
                        );
                    })}
                </ul>
            </div>
        </PublicSheet>
    );
}
