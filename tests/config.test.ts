import { describe, expect, it } from "vitest";
import { TODAY } from "@/lib/config";

describe("config", () => {
  it("TODAY is a real YYYY-MM-DD calendar date", () => {
    expect(TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Round-trip through UTC catches impossible dates like 2026-02-30.
    expect(new Date(`${TODAY}T00:00:00Z`).toISOString().slice(0, 10)).toBe(TODAY);
  });
});
