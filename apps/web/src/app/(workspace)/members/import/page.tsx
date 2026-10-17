import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { todayIso } from "@/lib/periods";
import { hasPermission, requireWorkspace } from "@/lib/session";
import { requireSociety } from "@/lib/society";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import records" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ws = await requireWorkspace();
  const canMembers = hasPermission(ws, "members.write");
  const canBalances = hasPermission(ws, "ledger.prepare");
  if (!canMembers && !canBalances) return <EmptyState title="Your role can't import records." />;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "balances" && canBalances ? "balances" : canMembers ? "members" : "balances";
  const { terminology } = await requireSociety();
  return (
    <>
      <PageHeader
        back={{ href: "/members", label: "Members" }}
        title="Bring your records across"
        description="Import your member register, then each member's savings and share balances. You'll see every problem before anything is saved."
      />
      <LinkTabs
        label="What to import"
        current={tab}
        tabs={[
          ...(canMembers ? [{ key: "members", label: "1. Member register", href: "/members/import?tab=members" }] : []),
          ...(canBalances ? [{ key: "balances", label: "2. Opening balances", href: "/members/import?tab=balances" }] : []),
        ]}
      />
      {tab === "members" ? (
        <ImportWizard
          kind="members"
          templateHref="/members/import/template?kind=members"
          intro={`One row per member. “Member no” and “Full name” are required; ${terminology.externalId}, ${terminology.group}, phone, email, date joined (DD/MM/YYYY) and status are optional. The import adds everyone or no one.`}
        />
      ) : (
        <ImportWizard
          kind="balances"
          templateHref="/members/import/template?kind=balances"
          defaultDate={todayIso()}
          intro="One row per member: “Member no”, then a column for each savings or share account, headed by its code (e.g. 2100). This becomes one journal entry against 3900 Opening balances, approved by a second officer. Then bring the bank and cash balances across with an ordinary entry against 3900, so it nets to the society's accumulated funds. Loan balances come across with their loans."
        />
      )}
    </>
  );
}
