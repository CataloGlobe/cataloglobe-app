import { describe, expect, it } from "vitest";
import { ruleReachesAnyActivity, describeZeroReach } from "@/utils/scheduleReach";

const ctx = {
    activityExists: (id: string) => id === "activity-1",
    groupMemberCount: (id: string) => (id === "group-full" ? 1 : 0)
};

describe("ruleReachesAnyActivity", () => {
    it("apply_to_all wins regardless of targets", () => {
        expect(
            ruleReachesAnyActivity({ applyToAll: true, activityIds: [], groupIds: [] }, ctx)
        ).toBe(true);
    });

    it("reaches via an activity target that exists", () => {
        expect(
            ruleReachesAnyActivity(
                { applyToAll: false, activityIds: ["activity-1"], groupIds: [] },
                ctx
            )
        ).toBe(true);
    });

    it("does not reach via an activity target that no longer exists", () => {
        expect(
            ruleReachesAnyActivity(
                { applyToAll: false, activityIds: ["activity-deleted"], groupIds: [] },
                ctx
            )
        ).toBe(false);
    });

    it("reaches via a group target with at least one member", () => {
        expect(
            ruleReachesAnyActivity(
                { applyToAll: false, activityIds: [], groupIds: ["group-full"] },
                ctx
            )
        ).toBe(true);
    });

    it("does not reach via a group target with zero members", () => {
        expect(
            ruleReachesAnyActivity(
                { applyToAll: false, activityIds: [], groupIds: ["group-empty"] },
                ctx
            )
        ).toBe(false);
    });

    it("no targets at all is zero reach", () => {
        expect(
            ruleReachesAnyActivity({ applyToAll: false, activityIds: [], groupIds: [] }, ctx)
        ).toBe(false);
    });
});

describe("describeZeroReach", () => {
    const describeCtx = {
        ...ctx,
        groupName: (id: string) => (id === "group-empty" ? "Milanesi" : id)
    };

    it("names the empty group", () => {
        expect(
            describeZeroReach(
                { applyToAll: false, activityIds: [], groupIds: ["group-empty"] },
                describeCtx
            )
        ).toBe("Il gruppo «Milanesi» non ha sedi");
    });

    it("falls back to a generic message when the activity target is gone", () => {
        expect(
            describeZeroReach(
                { applyToAll: false, activityIds: ["activity-deleted"], groupIds: [] },
                describeCtx
            )
        ).toBe("Le sedi indicate non esistono più");
    });

    it("reports no target selected when both arrays are empty", () => {
        expect(
            describeZeroReach({ applyToAll: false, activityIds: [], groupIds: [] }, describeCtx)
        ).toBe("Nessun target selezionato");
    });
});
