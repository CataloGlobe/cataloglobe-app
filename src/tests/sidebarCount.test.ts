import { describe, it, expect } from "vitest";
import { buildSidebarGroups, type SidebarNavGroup } from "@/components/layout/Sidebar/sidebarItems";

const groups = (count?: number, showTranslationBadge?: boolean): SidebarNavGroup[] => [
    { title: null, items: [{ to: "/reviews", label: "Recensioni", icon: null, count, showTranslationBadge }] }
];

const build = (g: SidebarNavGroup[], translationPendingCount = 0, translationWaitingCount = 0) =>
    buildSidebarGroups(g, {
        permissions: null,
        hasFeature: () => true,
        signals: {
            translationPendingCount,
            translationWaitingCount,
            translationWaitingLabel: "2 traduzioni in attesa · partono tra 4 min"
        }
    })[0].items[0];

describe("NavItem.count", () => {
    it("sopra zero: badge brand col numero", () => {
        const item = build(groups(3));
        expect(item.badge).toBe(3);
        expect(item.badgeTone).toBe("brand");
    });

    it("a zero o assente: nessun badge", () => {
        expect(build(groups(0)).badge).toBeUndefined();
        expect(build(groups()).badge).toBeUndefined();
    });

    it("le traduzioni in corso restano il loro badge, neutro", () => {
        const item = build(groups(undefined, true), 5);
        expect(item.badge).toBe(5);
        expect(item.badgeTone).toBeUndefined();
    });

    it("senza lavoro in corso: il numero delle traduzioni in attesa, senza spinner e col titolo", () => {
        const item = build(groups(undefined, true), 0, 2);
        expect(item.badge).toBe(2);
        expect(item.loading).toBe(false);
        expect(item.badgeTone).toBeUndefined();
        expect(item.badgeLabel).toBe("2 traduzioni in attesa · partono tra 4 min");
    });

    it("con lavoro in corso vince lo spinner con il numero in corso", () => {
        const item = build(groups(undefined, true), 3, 2);
        expect(item.badge).toBe(3);
        expect(item.loading).toBe(true);
        expect(item.badgeLabel).toBeUndefined();
    });

    it("le attese non toccano le voci senza il segnale delle traduzioni", () => {
        expect(build(groups(), 0, 2).badge).toBeUndefined();
    });
});
