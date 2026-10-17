import { cn } from "./cn";

const HUES = [160, 210, 28, 265, 340, 190, 45, 120];

function hueFor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export function initials(name: string) {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

/** Initials on a tint picked from the name, so the same person always looks the same. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const hue = hueFor(name);
  const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-16 text-lg" };
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide", sizes[size], className)}
      style={{ background: `oklch(0.93 0.05 ${hue})`, color: `oklch(0.38 0.1 ${hue})` }}
    >
      {initials(name)}
    </span>
  );
}
