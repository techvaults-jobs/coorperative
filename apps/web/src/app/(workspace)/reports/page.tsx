import { ArrowUpRight, BarChart3, FileText, Landmark, Scale, Timer } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ws = await requireWorkspace();
  if (!hasPermission(ws, "ledger.read")) return <EmptyState title="Your role doesn't include financial reports." />;
  const { modules } = await requireSociety();
  const reports = [
    { href: "/reports/position", icon: Landmark, title: "Statement of financial position", body: "Assets, liabilities, members' funds and surplus as at any date. The balance sheet for the AGM." },
    { href: "/reports/income", icon: BarChart3, title: "Income and expenditure", body: "Income, expenses and surplus for a period, with the 25% statutory reserve (Act s.34)." },
    ...(modules.includes("loans") ? [{ href: "/reports/loans", icon: Timer, title: "Loan portfolio ageing", body: "Active loans by days overdue, outstanding principal and arrears, with PAR." }] : []),
    { href: "/members", icon: FileText, title: "Member statements", body: "Open a member and choose Statement for a printable statement of any period." },
    { href: "/trial-balance", icon: Scale, title: "Trial balance", body: "Debits and credits for every account; the check that the books balance." },
  ];
  return (
    <>
      <PageHeader title="Reports" description="Every report is computed from approved journal entries, so it always agrees with the ledger. Print any of them or download CSV." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group">
            <Card className="group-hover:border-accent/40 flex h-full flex-col gap-3 p-5 transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between">
                <span className="bg-accent-soft text-accent flex size-10 items-center justify-center rounded-xl">
                  <Icon className="size-5" aria-hidden />
                </span>
                <ArrowUpRight className="text-subtle group-hover:text-accent size-4" aria-hidden />
              </div>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-muted text-sm leading-relaxed">{body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
