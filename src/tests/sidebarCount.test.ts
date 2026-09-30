import { describe, it, expect } from "vitest";
import { buildSidebarGroups, type SidebarNavGroup } from "@/components/layout/Sidebar/sidebarItems";

const groups = (count?: number, showTranslationBadge?: boolean): SidebarNavGroup[] => [
    { title: null, items: [{ to: "/reviews", label: "Recensioni", icon: null, count, showTranslationBadge }] }
];

const build = (g: SidebarNavGroup[], translationPendingCount = 0) =>
    buildSidebarGroups(g, { permissions: null, hasFeature: () => true, signals: { translationPendingCount } })[0].items[0];

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
});
