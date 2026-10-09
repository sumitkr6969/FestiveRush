import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, daysBetween } from "@/lib/dates";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-09", 7)).toBe("2026-10-16");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days, negative when going back", () => {
    expect(daysBetween("2026-10-09", "2026-10-16")).toBe(7);
    expect(daysBetween("2026-10-09", "2026-07-11")).toBe(-90);
  });

  it("knows 2026-10-09 is a Friday", () => {
    expect(dayOfWeek("2026-10-09")).toBe(5);
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => addDays("09/10/2026", 1)).toThrow();
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });
});
