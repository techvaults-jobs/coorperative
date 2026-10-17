import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="border-border bg-surface overflow-x-auto rounded-lg border">
      <table className={cn("tabular w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, numeric, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "border-border bg-background text-muted border-b px-3 py-2 text-left text-xs font-medium tracking-wide uppercase whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, numeric, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("border-border border-b px-3 py-2 align-top", numeric && "text-right font-mono whitespace-nowrap", className)} {...props} />;
}
