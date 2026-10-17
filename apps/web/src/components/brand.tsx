import { cn } from "./ui/cn";

export const PRODUCT = "Cooperative Vaults";
export const COMPANY = "TechVaults";

/** The vault mark: a rounded vault door with a dial, in the brand colours. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="cv-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#19a57f" />
          <stop offset="1" stopColor="#0a5c47" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#cv-g)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill="#e2b45c" />
      <path d="M16 7.5v3M16 21.5v3M7.5 16h3M21.5 16h3" stroke="#fff" strokeOpacity=".9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, tone = "default", sub = true }: { className?: string; tone?: "default" | "inverse"; sub?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className={cn("text-[15px] font-semibold tracking-tight", tone === "inverse" ? "text-white" : "text-foreground")}>{PRODUCT}</span>
        {sub && <span className={cn("mt-1 text-[10px] font-medium tracking-widest uppercase", tone === "inverse" ? "text-sidebar-muted" : "text-subtle")}>by {COMPANY}</span>}
      </span>
    </span>
  );
}
