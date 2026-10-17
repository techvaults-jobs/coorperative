import { fullNaira } from "./format";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

/**
 * Parts of a whole as one 100% bar with a 2px surface gap between segments, plus a
 * legend that lists every value and share, so identity and amount never rest on colour.
 * At most three parts (the palette's all-pairs-safe slots).
 */
export function Composition({ parts, ariaLabel }: { parts: { label: string; value: number }[]; ariaLabel: string }) {
  const shown = parts.slice(0, 3);
  const total = shown.reduce((s, p) => s + Math.max(p.value, 0), 0);
  return (
    <div className="flex flex-col gap-4">
      <div role="img" aria-label={ariaLabel} className="bg-surface flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {total > 0 ? (
          shown.map((p, i) =>
            p.value > 0 ? (
              <span
                key={p.label}
                title={`${p.label}: ${fullNaira(p.value)}`}
                style={{ width: `${(p.value / total) * 100}%`, background: SLOTS[i] }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ) : null,
          )
        ) : (
          <span className="bg-surface-2 h-full w-full" />
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {shown.map((p, i) => (
          <li key={p.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SLOTS[i] }} aria-hidden />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium tabular-nums">{fullNaira(p.value)}</span>
              <span className="text-muted w-10 text-right text-xs tabular-nums">{total ? Math.round((p.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
