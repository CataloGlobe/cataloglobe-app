import { describe, expect, it } from "vitest";
import { resolveDrawerSize } from "@/components/layout/SystemDrawer/drawerSize";

describe("resolveDrawerSize", () => {
    it("usa md senza size né width", () => {
        expect(resolveDrawerSize(undefined, undefined)).toEqual({ size: "md" });
    });

    it("size vince su width", () => {
        expect(resolveDrawerSize("sm", 900)).toEqual({ size: "sm" });
    });

    it("mappa la width deprecata alla taglia più vicina per eccesso", () => {
        expect(resolveDrawerSize(undefined, 400)).toEqual({ size: "sm" });
        expect(resolveDrawerSize(undefined, 460)).toEqual({ size: "sm" });
        expect(resolveDrawerSize(undefined, 480)).toEqual({ size: "md" });
        expect(resolveDrawerSize(undefined, 620)).toEqual({ size: "md" });
        expect(resolveDrawerSize(undefined, 680)).toEqual({ size: "lg" });
        expect(resolveDrawerSize(undefined, 800)).toEqual({ size: "lg" });
    });

    it("oltre 800 tiene la larghezza com'era (route nel lotto 5)", () => {
        expect(resolveDrawerSize(undefined, 900)).toEqual({ size: "lg", explicitWidth: 900 });
        expect(resolveDrawerSize(undefined, 960)).toEqual({ size: "lg", explicitWidth: 960 });
    });
});
