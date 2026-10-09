const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Whole rupees with Indian digit grouping, e.g. ₹1,17,600. */
export function formatINR(amount: number): string {
  return INR.format(Math.round(amount));
}

const DISPLAY_DATE =new Intl.DateTimeFormat("en-IN", {
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
