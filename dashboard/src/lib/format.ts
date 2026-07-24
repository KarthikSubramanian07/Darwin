// Small display formatters. Tabular-friendly, no locale surprises in the demo.

export const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;

export const money = (v: number): string =>
  v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(2)}`;

export const latency = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;

export const signedPct = (v: number, digits = 1): string =>
  `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

export const signedPts = (v: number, digits = 1): string =>
  `${v >= 0 ? "+" : ""}${v.toFixed(digits)} pts`;

export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export const shortModel = (label: string): string => label;
