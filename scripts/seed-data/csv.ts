// Minimal RFC 4180 reader: quoted fields, "" escapes, CRLF or LF. No dependencies.

export interface CsvRow {
  /** 1-based line in the file (header is line 1), for error messages. */
  line: number;
  values: Record<string, string>;
}

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Blank lines (a trailing newline, an empty last line) carry no data.
  return records.filter((r) => !(r.length === 1 && r[0]?.trim() === ""));
}

/** Parses a CSV whose header must be exactly `columns`, in order. */
export function parseCsv(text: string, file: string, columns: readonly string[]): CsvRow[] {
  const [header, ...records] = splitRecords(text.replace(/^﻿/, ""));
  const got = (header ?? []).map((h) => h.trim());
  if (got.join(",") !== columns.join(",")) {
    throw new Error(`${file}: expected columns ${columns.join(",")} but found ${got.join(",")}`);
  }
  return records.map((values, i) => {
    const line = i + 2;
    if (values.length !== columns.length) {
      throw new Error(`${file} line ${line}: expected ${columns.length} fields, found ${values.length}`);
    }
    return { line, values: Object.fromEntries(columns.map((c, j) => [c, (values[j] ?? "").trim()])) };
  });
}
