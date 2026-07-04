import { describe, it, expect } from "vitest";
import { enforceOrderCaps, MAX_ORDER_TOTAL, MAX_ORDER_LINES, OrderCapError } from "./orderCaps";

describe("enforceOrderCaps", () => {
  it("passes within limits", () => {
    expect(() => enforceOrderCaps(120.5, 10)).not.toThrow();
  });
  it("throws ORDER_TOTAL_EXCEEDED above max total", () => {
    try { enforceOrderCaps(MAX_ORDER_TOTAL + 0.01, 1); expect.fail("should throw"); }
    catch (e) { expect((e as OrderCapError).code).toBe("ORDER_TOTAL_EXCEEDED"); }
  });
  it("throws TOO_MANY_LINES above max lines", () => {
    try { enforceOrderCaps(10, MAX_ORDER_LINES + 1); expect.fail("should throw"); }
    catch (e) { expect((e as OrderCapError).code).toBe("TOO_MANY_LINES"); }
  });
  it("allows exactly at the boundary", () => {
    expect(() => enforceOrderCaps(MAX_ORDER_TOTAL, MAX_ORDER_LINES)).not.toThrow();
  });
});
