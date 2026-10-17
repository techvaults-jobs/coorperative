/** ₦1,234 → "₦1.2K"; for axis ticks and tight tiles. Input is naira (not kobo). */
export function compactNaira(naira: number): string {
  const abs = Math.abs(naira);
  const sign = naira < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}₦${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}₦${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}₦${trim(abs / 1e3)}K`;
  return `${sign}₦${Math.round(abs)}`;
}

function trim(n: number) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
}

export function fullNaira(naira: number): string {
  return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Clean tick values from 0 to at least `max`. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}
