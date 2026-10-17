import { ChevronDown } from "lucide-react";

/** Native disclosure widgets: keyboard and screen-reader friendly, no script needed. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-border border-border bg-surface divide-y rounded-2xl border shadow-sm">
      {items.map(({ q, a }) => (
        <details key={q} className="group px-6 py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown className="text-muted size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="text-muted mt-3 leading-relaxed">{a}</p>
        </details>
      ))}
    </div>
  );
}
