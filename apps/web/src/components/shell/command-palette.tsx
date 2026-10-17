"use client";

import type { Module, Permission } from "@techvaults/core";
import { ArrowRight, CornerDownLeft, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { visibleGroups } from "./nav";

type Item = { id: string; label: string; hint: string; href: string; kind: "page" | "member" };

/** ⌘K / Ctrl+K: jump to any page, or find a member by name, number or staff ID. */
export function CommandPalette({ permissions, modules }: { permissions: Permission[]; modules: Module[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const canSearchMembers = permissions.includes("members.read");

  const pages = useMemo<Item[]>(
    () =>
      visibleGroups(permissions, modules).flatMap((g) =>
        g.items.map((i) => ({ id: i.href, label: i.label, hint: [g.label, i.keywords].filter(Boolean).join(" "), href: i.href, kind: "page" as const })),
      ),
    [permissions, modules],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cv:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cv:command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!canSearchMembers || query.trim().length < 2) {
      setMembers([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (res.ok) setMembers((await res.json()).members);
      } catch {
        /* aborted or offline: keep the page results */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, canSearchMembers]);

  const q = query.trim().toLowerCase();
  const results = [...pages.filter((p) => !q || `${p.label} ${p.hint}`.toLowerCase().includes(q)), ...members];
  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-in border-border bg-surface w-full max-w-xl overflow-hidden rounded-2xl border shadow-lg"
      >
        <div className="border-border flex items-center gap-3 border-b px-4">
          <Search className="text-subtle size-4" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") go(results[index]);
            }}
            placeholder={canSearchMembers ? "Go to a page or find a member…" : "Go to a page…"}
            aria-label="Search"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
          />
          <kbd className="border-border text-subtle rounded border px-1.5 py-0.5 text-[10px]">ESC</kbd>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="text-muted px-3 py-8 text-center text-sm">Nothing matches “{query}”.</li>}
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.id}`} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm", i === index && "bg-accent-soft")}
              >
                <span className={cn("flex size-7 items-center justify-center rounded-md", i === index ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted")}>
                  {r.kind === "member" ? <User className="size-3.5" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.label}</span>
                  <span className="text-muted block truncate text-xs">{r.kind === "member" ? r.hint : "Page"}</span>
                </span>
                {i === index && <CornerDownLeft className="text-subtle size-3.5" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
