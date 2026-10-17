"use client";

import { LogOut } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={buttonClass(compact ? "ghost" : "secondary", compact ? "justify-start md:w-full" : undefined)}
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/sign-in";
      }}
    >
      <LogOut className="size-4" aria-hidden />
      Sign out
    </button>
  );
}
