"use client";

import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="hover:bg-surface-2 flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors"
      >
        <Avatar name={name} size="sm" />
        <span className="hidden max-w-36 truncate text-sm font-medium lg:block">{name}</span>
      </button>
      {open && (
        <div role="menu" className="animate-in border-border bg-surface absolute right-0 z-40 mt-2 w-64 rounded-xl border p-1.5 shadow-lg">
          <div className="border-border mb-1 border-b px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-muted truncate text-xs">{email}</p>
          </div>
          <Link role="menuitem" href="/security" onClick={() => setOpen(false)} className="hover:bg-surface-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm">
            <KeyRound className="text-muted size-4" aria-hidden />
            Security
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/sign-in";
            }}
            className="hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm"
          >
            <LogOut className="text-muted size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
