import { describe, expect, it } from "vitest";
import { formatDisplayDate } from "@/lib/format";

describe("formatDisplayDate", () => {
  it("formats the as-of date for the top bar", () => {
    expect(formatDisplayDate("2026-10-09")).toBe("Fri, 9 Oct 2026");
  });
});
