const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Whole rupees with Indian digit grouping, e.g. ₹1,17,600. */
export function formatINR(amount: number): string {
  return INR.format(Math.round(amount));
}

const COMPACT_INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const NUMBER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const SHORT_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const TIMESTAMP = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/** Short rupees for tiles, e.g. ₹1.4Cr, ₹55.8L. */
export function formatCompactINR(amount: number): string {
  return COMPACT_INR.format(amount);
}

/** Indian digit grouping, up to one decimal. */
export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** "12 Oct" from a YYYY-MM-DD string. */
export function formatShortDate(isoDate: string): string {
  return SHORT_DATE.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Wall-clock audit timestamps (decisions), shown in India time. */
export function formatTimestamp(iso: string): string {
  return TIMESTAMP.format(new Date(iso));
}

const DISPLAY_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Formats a YYYY-MM-DD string as e.g. "Fri, 9 Oct 2026".
 * Parsed and printed in UTC so the day never shifts with the viewer's time zone.
 * Assembled from parts because locale punctuation differs between ICU versions.
 */
export function formatDisplayDate(isoDate: string): string {
  const parts = DISPLAY_DATE.formatToParts(new Date(`${isoDate}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
}
