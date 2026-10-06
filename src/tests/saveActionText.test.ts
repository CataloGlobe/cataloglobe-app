import { describe, expect, it } from "vitest";
import { formatChangeCount } from "@/components/ui/HeaderSaveAction/saveActionText";

describe("formatChangeCount", () => {
    it("singolare con una modifica", () => {
        expect(formatChangeCount(1)).toBe("1 modifica");
    });

    it("plurale da due in su", () => {
        expect(formatChangeCount(2)).toBe("2 modifiche");
        expect(formatChangeCount(12)).toBe("12 modifiche");
    });
});
