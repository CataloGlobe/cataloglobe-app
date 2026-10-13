import { useTranslation } from "react-i18next";
import { CakeSlice, Check, ChevronRight, Coffee, LayoutGrid, Utensils, Wine } from "lucide-react";
import { menuHours, menuIcon, type MenuIcon } from "./menuList";
import type { MenuSheetBinding } from "./menuSheet";
import styles from "../sheets/VenueSheets.module.scss";

const ICONS: Record<MenuIcon, typeof Utensils> = { utensils: Utensils, wine: Wine, coffee: Coffee, cake: CakeSlice };

/**
 * «Menu disponibili ora» (mockup v38, foglio `menus`): i menu di adesso con la
 * spunta su quello a vista; sotto, «Tutti i menu» riporta alla scelta.
 */
export default function MenusPage({ menus, current, choose, showAll }: MenuSheetBinding) {
    const { t } = useTranslation("public");
    return (
        <div className={styles.list}>
            <p className={styles.intro}>{t("menus.sheet_subtitle", { count: menus.length })}</p>
            <div className={styles.group} role="radiogroup" aria-label={t("menus.sheet_title")}>
                {menus.map(menu => {
                    const Icon = ICONS[menuIcon(menu)];
                    const active = menu.catalogId === current?.catalogId;
                    return (
                        <button
                            key={menu.catalogId}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className={styles.row}
                            onClick={() => choose(menu)}
                        >
                            <span className={styles.rowIcon} aria-hidden>
                                <Icon size={18} strokeWidth={2} />
                            </span>
                            <span className={styles.rowText}>
                                <span className={styles.rowLabel}>{menu.name}</span>
                                <span className={styles.rowSubtitle}>
                                    {menuHours(menu)} · {t("menus.products", { count: menu.productsCount })}
                                </span>
                            </span>
                            {active ? <Check size={18} strokeWidth={2.5} className={styles.check} aria-hidden /> : null}
                        </button>
                    );
                })}
            </div>
            <div className={styles.group}>
                <button type="button" className={styles.row} onClick={showAll}>
                    <span className={styles.rowIcon} aria-hidden>
                        <LayoutGrid size={18} strokeWidth={2} />
                    </span>
                    <span className={styles.rowText}>
                        <span className={styles.rowLabel}>{t("menus.all_menus")}</span>
                        <span className={styles.rowSubtitle}>{t("menus.all_menus_subtitle")}</span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden />
                </button>
            </div>
        </div>
    );
}
