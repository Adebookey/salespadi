// Naira helpers. All amounts are integers in kobo (₦1 = 100 kobo).
const fmt = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function formatNaira(kobo: number | null | undefined): string {
  const k = kobo ?? 0;
  return `₦${fmt.format(k / 100)}`;
}

/** Parses "₦18,000", "18000", "18k", "18.5k" into kobo. Returns null when it is not a price. */
export function parseNairaToKobo(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  const s = input.trim().toLowerCase().replace(/[₦,\s]|ngn|naira/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1;
  return Math.round(parseFloat(m[1]) * mult * 100);
}
