import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// House style: no em dashes anywhere in the app's source or UI copy.
const EM_DASH = String.fromCharCode(0x2014);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css|sql|md)$/.test(entry.name) ? [full] : [];
  });
}

describe("copy", () => {
  it("contains no em dashes", () => {
    const root = path.join(__dirname, "..");
    const files = ["src", "scripts", "tests"].flatMap((d) => sourceFiles(path.join(root, d)));
    const offenders = files.filter((f) => fs.readFileSync(f, "utf8").includes(EM_DASH));
    expect(offenders).toEqual([]);
  });
});
