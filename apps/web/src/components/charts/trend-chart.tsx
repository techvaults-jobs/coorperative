"use client";

import { useId, useState } from "react";
import { compactNaira, fullNaira, niceTicks } from "./format";
import { useWidth } from "./use-width";

export interface Point {
  label: string;
  /** Full label for the tooltip, e.g. "September 2026". */
  title: string;
  value: number;
}

/**
 * One series over time: columns or an area line. Single series, so no legend; the
 * card title names it. Hover (or focus) a period for its exact value.
 */
export function TrendChart({ data, kind = "area", height = 220, ariaLabel }: { data: Point[]; kind?: "area" | "bars"; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId();
  const pad = { top: 12, right: 12, bottom: 26, left: 52 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 1));
  const max = ticks.at(-1)!;
  const band = w / Math.max(data.length, 1);
  const x = (i: number) => pad.left + band * i + band / 2;
  const y = (v: number) => pad.top + h - (v / max) * h;
  const bar = Math.min(24, band * 0.6);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = data.length ? `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const active = hover === null ? null : data[hover];
  const everyNth = Math.ceil(data.length / Math.max(1, Math.floor(w / 56)));

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden select-none" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--border-strong)" : "var(--grid)"} strokeWidth="1" />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-subtle text-[11px] tabular-nums">
              {compactNaira(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % everyNth === 0 || i === data.length - 1 ? (
            <text key={d.label} x={x(i)} y={height - 6} textAnchor="middle" className="fill-subtle text-[11px]">
              {d.label}
            </text>
          ) : null,
        )}
        {kind === "bars" ? (
          data.map((d, i) => {
            const top = y(d.value);
            const hgt = y(0) - top;
            const r = Math.min(4, hgt);
            return (
              <path
                key={d.label}
                d={`M${x(i) - bar / 2},${y(0)}V${top + r}Q${x(i) - bar / 2},${top} ${x(i) - bar / 2 + r},${top}H${x(i) + bar / 2 - r}Q${x(i) + bar / 2},${top} ${x(i) + bar / 2},${top + r}V${y(0)}Z`}
                fill="var(--accent)"
                opacity={hover === null || hover === i ? 1 : 0.45}
                className="transition-opacity"
              />
            );
          })
        ) : (
          <>
            <path d={area} fill={`url(#${gradient})`} />
            <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {data.length > 0 && (
              <circle cx={x(data.length - 1)} cy={y(data.at(-1)!.value)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
            )}
          </>
        )}
        {active && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" />
            {kind === "area" && <circle cx={x(hover)} cy={y(active.value)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          </g>
        )}
        {data.map((d, i) => (
          <rect
            key={d.label}
            x={pad.left + band * i}
            y={pad.top}
            width={band}
            height={h}
            fill="transparent"
            tabIndex={0}
            aria-label={`${d.title}: ${fullNaira(d.value)}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="outline-none"
          />
        ))}
      </svg>
      {active && hover !== null && (
        <div
          className="border-border bg-surface pointer-events-none absolute top-0 z-10 rounded-lg border px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 150), width: 150 }}
        >
          <p className="text-muted">{active.title}</p>
          <p className="text-foreground font-mono text-sm font-semibold">{fullNaira(active.value)}</p>
        </div>
      )}
    </div>
  );
}

/** A 12-point trend for stat tiles: de-emphasised line, the latest point in the accent. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)] as const);
  return (
    <svg width={w} height={h} className={className} aria-hidden>
      <path d={pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join("")} fill="none" stroke="var(--subtle)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="3" fill="var(--accent)" />
    </svg>
  );
}
