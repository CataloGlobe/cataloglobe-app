import type { BoardIcon as BoardIconName } from "@pages/CampaignLanding/content/landing";
import styles from "./Board.module.scss";

/** Icone disegnate dei foglietti (tratto indaco, riempimento pesca). */
export default function BoardIcon({ name }: { name: BoardIconName }) {
    return (
        <svg className={styles.icon} width="36" height="36" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            {name === "languages" && (
                <>
                    <path className={styles.fill} d="M7 8 h20 a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 h-11 l-6 5 v-5 h-3 a4 4 0 0 1 -4 -4 v-8 a4 4 0 0 1 4 -4 Z" />
                    <path d="M31 18 h9 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-2 v5 l-5 -5 h-8 a3 3 0 0 1 -3 -3 v-3" />
                    <path d="M10 16 h14" />
                </>
            )}
            {name === "schedule" && (
                <>
                    <circle className={styles.fill} cx="24" cy="25" r="16" />
                    <path d="M24 15 v10 l7 5" />
                    <path d="M18 5 h12" />
                    <path d="M24 5 v4" />
                </>
            )}
            {name === "stats" && (
                <>
                    <path d="M6 40 h36" />
                    <rect x="9" y="26" width="7" height="14" rx="1.5" />
                    <rect className={styles.fill} x="20.5" y="16" width="7" height="24" rx="1.5" />
                    <rect x="32" y="9" width="7" height="31" rx="1.5" />
                </>
            )}
            {name === "reservations" && (
                <>
                    <rect x="7" y="11" width="34" height="29" rx="4" />
                    <path d="M7 19 h34" />
                    <path d="M16 7 v7" />
                    <path d="M32 7 v7" />
                    <circle className={styles.fill} cx="30" cy="30" r="5" />
                    <path d="M27.8 30 l1.6 1.6 l3 -3.2" />
                </>
            )}
            {name === "featured" && (
                <>
                    <path className={styles.fill} d="M24 6 l5.3 11 l12 1.6 l-8.8 8.3 l2.2 11.9 L24 33 l-10.7 5.8 l2.2 -11.9 L6.7 18.6 l12 -1.6 Z" />
                    <path d="M38 6 l2 -3" />
                    <path d="M42 11 l3 -1" />
                </>
            )}
            {name === "allergens" && (
                <>
                    <path d="M24 44 V10" />
                    <path className={styles.fill} d="M24 12 c-5 -1 -7 -5 -6 -9 c5 1 7 5 6 9 Z" />
                    <path className={styles.fill} d="M24 20 c-6 0 -9 -4 -9 -8 c6 0 9 4 9 8 Z" />
                    <path className={styles.fill} d="M24 20 c6 0 9 -4 9 -8 c-6 0 -9 4 -9 8 Z" />
                    <path className={styles.fill} d="M24 29 c-6 0 -9 -4 -9 -8 c6 0 9 4 9 8 Z" />
                    <path className={styles.fill} d="M24 29 c6 0 9 -4 9 -8 c-6 0 -9 4 -9 8 Z" />
                    <path className={styles.fill} d="M24 38 c-6 0 -9 -4 -9 -8 c6 0 9 4 9 8 Z" />
                    <path className={styles.fill} d="M24 38 c6 0 9 -4 9 -8 c-6 0 -9 4 -9 8 Z" />
                </>
            )}
            {name === "stories" && (
                <>
                    <path className={styles.fill} d="M24 12 C 19 8, 11 8, 6 10 v26 c5 -2 13 -2 18 2 Z" />
                    <path d="M24 12 C 29 8, 37 8, 42 10 v26 c-5 -2 -13 -2 -18 2 Z" />
                    <path d="M24 12 v26" />
                    <path d="M30 17 h7" />
                    <path d="M30 22 h7" />
                </>
            )}
            {name === "venues" && (
                <>
                    <path className={styles.fill} d="M7 18 L11 8 h26 l4 10 Z" />
                    <path d="M7 18 a4.25 4 0 0 0 8.5 0 a4.25 4 0 0 0 8.5 0 a4.25 4 0 0 0 8.5 0 a4.25 4 0 0 0 8.5 0" />
                    <path d="M10 22 v18 h28 v-18" />
                    <rect x="20" y="29" width="8" height="11" rx="1" />
                </>
            )}
        </svg>
    );
}
