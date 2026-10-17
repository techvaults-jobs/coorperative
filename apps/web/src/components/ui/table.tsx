import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="border-border bg-surface overflow-x-auto rounded-xl border shadow-sm">
      <table className={cn("tabular w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, numeric, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "border-border bg-surface-2 text-muted border-b px-4 py-2.5 text-left text-[11px] font-semibold tracking-wider uppercase whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("border-border border-b px-4 py-3 align-middle", numeric && "text-right tabular-nums whitespace-nowrap", className)} {...props} />;
}

/** Row hover for tables whose rows open something. */
export const ROW_HOVER = "transition-colors hover:bg-surface-2 [&:last-child>td]:border-b-0";
