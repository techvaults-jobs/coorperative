import { cn } from "./ui/cn";

export const PRODUCT = "Cooperative Vaults";
export const COMPANY = "TechVaults";

/** TechVaults logo red (D-030). Used only for the logo; interface colour comes from --accent. */
const LOGO_RED = "#ed3135";

const layer = (src: string): React.CSSProperties => ({
  maskImage: `url(${src})`,
  WebkitMaskImage: `url(${src})`,
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
});

/**
 * The TechVaults mark, drawn as two masked layers so the charcoal part follows the theme
 * (charcoal on light surfaces, white on the sidebar and in dark mode) while the red stays red.
 */
export function LogoMark({ className, tone = "default" }: { className?: string; tone?: "default" | "inverse" }) {
  return (
    <span className={cn("relative inline-block size-8 shrink-0", className)} aria-hidden>
      <span className={cn("absolute inset-0", tone === "inverse" ? "bg-white" : "bg-[var(--logo-ink)]")} style={layer("/brand/mark-ink.png")} />
      <span className="absolute inset-0" style={{ ...layer("/brand/mark-red.png"), background: LOGO_RED }} />
    </span>
  );
}

export function Logo({ className, tone = "default", sub = true }: { className?: string; tone?: "default" | "inverse"; sub?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} />
      <span className="flex flex-col leading-none">
        <span className={cn("text-[15px] font-semibold tracking-tight", tone === "inverse" ? "text-white" : "text-foreground")}>{PRODUCT}</span>
        {sub && (
          <span className={cn("mt-1 text-[10px] font-medium tracking-widest uppercase", tone === "inverse" ? "text-sidebar-muted" : "text-subtle")}>
            by <span style={{ color: tone === "inverse" ? "#ff7a7d" : LOGO_RED }}>Tech</span>
            <span className={tone === "inverse" ? "text-white" : "text-foreground"}>Vaults</span>
          </span>
        )}
      </span>
    </span>
  );
}
